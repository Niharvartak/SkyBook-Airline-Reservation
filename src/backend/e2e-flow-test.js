/** End-to-end flow test: round trip, booking+promo, fare watch, admin flight mgmt, notifications */
const http = require("http");
const BASE_PORT = 8080;

function dateStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = value => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method, hostname: "localhost", port: BASE_PORT, path,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

let pass = 0, fail = 0;
async function check(name, fn) {
  try {
    const r = await fn();
    if (r === true || r === undefined) { console.log("  PASS", name); pass++; }
    else { console.log("  FAIL", name, "->", r); fail++; }
  } catch (e) { console.log("  FAIL", name, "-> EXCEPTION", e.message); fail++; }
}

(async () => {
  const stamp = Date.now();
  const email = `e2e_${stamp}@test.com`;

  // Register + login
  const reg = await req("POST", "/api/auth/register", { name: "E2E Tester", email, password: "test123" });
  const login = await req("POST", "/api/auth/login", { email, password: "test123" });
  const token = login.body?.token;
  if (!token) { console.log("FATAL: cannot log in", JSON.stringify(login.body)); process.exit(1); }

  console.log("\n[1] Round-trip search");
  const out = await req("GET", `/api/flights/search?from=Mumbai%20(BOM)&to=Delhi%20(DEL)&departureDate=${dateStr(0)}`);
  await check("outbound flights found", () => out.body.flights?.length > 0 || `got ${out.body.flights?.length}`);
  const back = await req("GET", `/api/flights/search?from=Delhi%20(DEL)&to=Mumbai%20(BOM)&departureDate=${dateStr(3)}`);
  await check("return flights found", () => back.body.flights?.length > 0 || `got ${back.body.flights?.length}`);
  await check("flight fares present", () => (out.body.flights||[]).every(f => f.price > 0) || "missing price");
  await check("seat availability present", () => (out.body.flights||[]).every(f => typeof f.availableSeats === "number") || "missing availableSeats");

  console.log("\n[2] International search + WORLD20 promo");
  const intl = await req("GET", `/api/flights/search?from=Mumbai%20(BOM)&to=Dubai%20(DXB)&departureDate=${dateStr(0)}`);
  await check("intl flights found", () => intl.body.flights?.length > 0 || `got ${intl.body.flights?.length}`);
  const intlFlight = intl.body.flights?.[0];
  if (intlFlight) {
    const det = await req("GET", `/api/flights/${intlFlight.id}`);
    const seat = (det.body.flight?.seats || []).find(s => s.status === "available" && s.cabinClass === "Economy");
    await check("intl flight has seats", () => (seat ? true : "no available seats"));
    if (seat) {
      const date = new Date(det.body.flight.departureDate).toISOString().slice(0, 10);
      const bk = await req("POST", "/api/bookings", {
        flightId: intlFlight.id, travelDate: date, passengerName: "Intl Tester",
        seatNumbers: [seat.seatNumber], travelers: 1, contactEmail: email, promoCode: "WORLD20",
      }, token);
      await check("WORLD20 intl booking w/ 20% off", () => {
        if (bk.status !== 201) return `status ${bk.status}: ${JSON.stringify(bk.body)}`;
        const full = intlFlight.price;
        if (bk.body.booking.totalPrice !== Math.round(full * 0.8)) return `expected ${Math.round(full*0.8)}, got ${bk.body.booking.totalPrice}`;
        return true;
      });
      // Cancel it to release seat
      if (bk.body?.booking?.id) await req("POST", `/api/bookings/${bk.body.booking.id}/cancel`, {}, token);
    }
  }

  console.log("\n[3] Fare watch lifecycle");
  const target = out.body.flights?.[0];
  if (target) {
    const fw = await req("POST", "/api/fare-watches", { flightId: target.id, targetPrice: target.price + 500 }, token);
    await check("create fare watch", () => fw.status === 201 || `status ${fw.status}`);
    const chk = await req("POST", "/api/fare-watches/check", {}, token);
    await check("check fares returns watch w/ snapshots", () => {
      const w = chk.body.fareWatches?.find(w => w.flightId === target.id);
      if (!w) return "watch not returned";
      if (!Array.isArray(w.snapshots) || w.snapshots.length === 0) return "no snapshots";
      return true;
    });
    const list = await req("GET", "/api/fare-watches", {}, token);
    const mine = list.body.fareWatches?.find(w => w.flightId === target.id);
    if (mine) {
      const del = await req("DELETE", `/api/fare-watches/${mine.id}`, {}, token);
      await check("delete fare watch", () => del.status === 200 || `status ${del.status}`);
    }
  }

  console.log("\n[4] Admin: dashboard, create+delete flight, authz");
  const adminLogin = await req("POST", "/api/admin/login", { email: "admin@skybook.com", password: "Admin@123" });
  const adminToken = adminLogin.body?.token;
  await check("admin login", () => (adminToken ? true : "no token"));
  if (adminToken) {
    const dash = await req("GET", "/api/admin/dashboard", null, adminToken);
    await check("dashboard stats", () => (dash.body.stats?.totalFlights > 0 && dash.body.stats?.totalUsers > 0) || JSON.stringify(dash.body.stats));
    const cf = await req("POST", "/api/admin/flights", {
      flightNumber: `SK-E2E${stamp % 10000}`, airline: "SkyBook Airlines",
      origin: "Mumbai (BOM)", destination: "Goa (GOI)", departureDate: dateStr(10),
      departureTime: "06:00 AM", arrivalTime: "07:30 AM", price: 3999,
    }, adminToken);
    await check("create flight", () => ((cf.status === 201 && cf.body.flightId) ? true : `status ${cf.status} ${JSON.stringify(cf.body)}`));
    if (cf.body?.flightId) {
      const fdet = await req("GET", `/api/flights/${cf.body.flightId}`);
      await check("created flight has 180-seat map", () => (fdet.body.flight?.seats?.length === 180) || `seats=${fdet.body.flight?.seats?.length}`);
      const del = await req("DELETE", `/api/admin/flights/${cf.body.flightId}`, {}, adminToken);
      await check("deactivate flight", () => del.status === 200 || `status ${del.status}`);
      const gone = await req("GET", `/api/flights/search?from=Mumbai%20(BOM)&to=Goa%20(GOI)&departureDate=${dateStr(10)}`);
      await check("deactivated flight excluded from search", () => !(gone.body.flights||[]).some(f => f.id === cf.body.flightId) || "still in search");
    }
    // Authz: user token must be rejected
    const unauth = await req("GET", "/api/admin/dashboard", null, token);
    await check("non-admin rejected from dashboard", () => unauth.status === 403 || `status ${unauth.status}`);
  }

  console.log("\n[5] Notifications + preferences");
  const notif = await req("GET", "/api/notifications", {}, token);
  await check("notifications list", () => Array.isArray(notif.body.notifications) || "not array");
  const prefs = await req("PUT", "/api/account/preferences", { preferences: ["window-seat", "vegetarian"] }, token);
  await check("save preferences", () => prefs.status === 200 || `status ${prefs.status}`);
  const gp = await req("GET", "/api/account/preferences", {}, token);
  await check("read preferences round-trip", () => (gp.body.preferences||[]).includes("window-seat") || JSON.stringify(gp.body.preferences));

  console.log("\n[6] Profile + dashboard stats");
  const me = await req("GET", "/api/auth/profile", null, token);
  await check("profile returns role USER", () => me.body.user?.role === "USER" || `role=${me.body.user?.role}`);
  const dstats = await req("GET", "/api/dashboard/stats", null, token);
  await check("user dashboard stats", () => (dstats.body.totalBookings >= 0 && dstats.body.totalFlights > 0) || JSON.stringify(dstats.body));

  console.log(`\n==== E2E Results: ${pass} passed, ${fail} failed ====`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
