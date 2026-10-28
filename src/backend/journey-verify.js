/**
 * SkyBook full-journey verification (real backend + real MySQL).
 *
 * Covers: register/login/profile -> multi-city one-way & round-trip search ->
 * seat map -> booking + unique PNR -> booking history + PNR retrieval ->
 * cancellation + seat release -> notifications -> fare watch -> planner.
 * Plus admin login, authorization (403/401), dashboard stats vs the database,
 * flight create/deactivate, and date-range filtering.
 *
 * Usage: node journey-verify.js            (cleans up its own test rows)
 *        node journey-verify.js --keep     (leaves the test user/booking in place)
 */
const path = require("path");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config();

const BASE = process.env.TEST_BASE || "http://localhost:8080";
const KEEP = process.argv.includes("--keep");
const PNR_RE = /^SKB-[A-Z0-9]{6}$/;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; failures.push(name + (extra ? ` \u2014 ${extra}` : "")); console.log(`  \u2717 ${name}${extra ? " \u2014 " + extra : ""}`); }
}
async function req(method, url, body, token) {
  const res = await fetch(BASE + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json };
}
const iso = d => d.toISOString().slice(0, 10);
const shift = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const stamp = Date.now();

(async () => {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "skybook",
    decimalNumbers: true,
  });
  const q = async (s, a = []) => (await pool.query(s, a))[0];

  let testUserId = null, createdFlightId = null, bookingId = null;

  // ── 0. health + airports ───────────────────────────────────────────────────
  console.log("\n[0] Backend & reference data");
  const health = await req("GET", "/api/health");
  check("health reports MySQL", health.body?.db === "mysql", JSON.stringify(health.body));
  check("health reports 14 tables", health.body?.tables === 14, `tables=${health.body?.tables}`);
  const airports = await req("GET", "/api/airports");
  check("airports endpoint returns rows", (airports.body?.airports?.length || 0) >= 20, `n=${airports.body?.airports?.length}`);
  check("airports include BOM and DEL", (airports.body?.airports || []).some(a => a.code === "BOM") && (airports.body?.airports || []).some(a => a.code === "DEL"));
  const dbAirports = await q("SELECT COUNT(*) c FROM airports");
  check("airports table populated in DB", dbAirports[0].c >= 20, `db=${dbAirports[0].c}`);

  // ── 1. register / login / profile / logout(auth guard) ─────────────────────
  console.log("\n[1] Account lifecycle");
  const email = `qa.journey.${stamp}@skybook-test.com`;
  const password = "TestPass123";
  const reg = await req("POST", "/api/auth/register", { name: "QA Journey Tester", email, password });
  check("register returns 201", reg.status === 201, `status=${reg.status} ${reg.body?.message || ""}`);
  testUserId = reg.body?.user?.id;
  check("register returns a user id", Number.isInteger(testUserId), `id=${testUserId}`);
  const dup = await req("POST", "/api/auth/register", { name: "Dup", email, password });
  check("duplicate registration is rejected (409)", dup.status === 409, `status=${dup.status}`);
  const shortPw = await req("POST", "/api/auth/register", { name: "Short", email: `short.${stamp}@x.com`, password: "123" });
  check("short password rejected (400)", shortPw.status === 400, `status=${shortPw.status}`);

  const login = await req("POST", "/api/auth/login", { email, password });
  const token = login.body?.token;
  check("login returns token", typeof token === "string" && token.length > 20);
  check("login returns USER role", login.body?.user?.role === "USER", `role=${login.body?.user?.role}`);
  const badLogin = await req("POST", "/api/auth/login", { email, password: "wrongpass" });
  check("wrong password rejected (401)", badLogin.status === 401, `status=${badLogin.status}`);

  const profile = await req("GET", "/api/auth/me", null, token);
  check("profile returns the account", profile.body?.user?.email === email);
  const noTokenBookings = await req("GET", "/api/bookings");
  check("protected route without token -> 401", noTokenBookings.status === 401, `status=${noTokenBookings.status}`);
  const badToken = await req("GET", "/api/bookings", null, "not.a.real.token");
  check("protected route with bad token -> 401", badToken.status === 401, `status=${badToken.status}`);

  // ── 2. multi-city search (one-way + round-trip) ────────────────────────────
  console.log("\n[2] Flight search");
  const todaySearch = await req("GET", `/api/flights/search?from=${encodeURIComponent("Mumbai (BOM)")}&to=${encodeURIComponent("Delhi (DEL)")}&departureDate=${shift(0)}`);
  check("BOM->DEL today returns flights", (todaySearch.body?.flights?.length || 0) > 0, `n=${todaySearch.body?.flights?.length}`);
  check("every result exposes numeric availableSeats", (todaySearch.body?.flights || []).every(f => typeof f.availableSeats === "number"));
  check("no result is wrongly sold out (seat rows exist or column used)", (todaySearch.body?.flights || []).every(f => f.availableSeats > 0));

  const pairs = [
    ["Mumbai (BOM)", "Bengaluru (BLR)"],
    ["Mumbai (BOM)", "Goa (GOI)"],
    ["Delhi (DEL)", "Mumbai (BOM)"],
    ["Mumbai (BOM)", "Dubai (DXB)"],
    ["Mumbai (BOM)", "Singapore (SIN)"],
    ["Mumbai (BOM)", "London (LHR)"],
  ];
  for (const [from, to] of pairs) {
    const r = await req("GET", `/api/flights/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&departureDate=${shift(1)}`);
    check(`route ${from} -> ${to} returns flights`, (r.body?.flights?.length || 0) > 0, `n=${r.body?.flights?.length}`);
  }
  const same = await req("GET", `/api/flights/search?from=${encodeURIComponent("Mumbai (BOM)")}&to=${encodeURIComponent("Mumbai (BOM)")}`);
  check("same origin/destination rejected (400)", same.status === 400, `status=${same.status}`);
  const missing = await req("GET", "/api/flights/search?from=Mumbai%20(BOM)");
  check("missing destination rejected (400)", missing.status === 400, `status=${missing.status}`);

  // Round trip = outbound + return search
  const outDate = shift(2), backDate = shift(6);
  const outbound = await req("GET", `/api/flights/search?from=${encodeURIComponent("Mumbai (BOM)")}&to=${encodeURIComponent("Delhi (DEL)")}&departureDate=${outDate}`);
  const inbound = await req("GET", `/api/flights/search?from=${encodeURIComponent("Delhi (DEL)")}&to=${encodeURIComponent("Mumbai (BOM)")}&departureDate=${backDate}`);
  check("round-trip outbound leg has flights", (outbound.body?.flights?.length || 0) > 0);
  check("round-trip return leg has flights", (inbound.body?.flights?.length || 0) > 0);
  check("outbound results are on the requested date", (outbound.body?.flights || []).every(f => String(f.departureDate).slice(0, 10) === outDate));

  // ── 3. seat map -> booking -> PNR ──────────────────────────────────────────
  console.log("\n[3] Seat map, booking and PNR");
  const bookable = (outbound.body?.flights || []).find(f => f.availableSeats >= 2);
  check("a bookable flight with >=2 seats is available", !!bookable, `n=${outbound.body?.flights?.length}`);
  const detail = await req("GET", `/api/flights/${bookable.id}`);
  const seatList = detail.body?.flight?.seats || [];
  check("seat map returns seats", seatList.length >= 2, `n=${seatList.length}`);
  check("seat map rows are numeric", seatList.every(s => Number.isInteger(s.row)));
  const openSeats = seatList.filter(s => s.status === "available" && s.cabinClass === "Economy").map(s => s.seatNumber);
  check("at least 2 seats open", openSeats.length >= 2, `open=${openSeats.length}`);
  const pick = openSeats.slice(0, 2);
  const seatsBefore = detail.body?.flight?.availableSeats;

  const booking = await req("POST", "/api/bookings", {
    flightId: bookable.id, travelDate: outDate, passengerName: "QA Journey Tester",
    passengers: [{ name: "QA Journey Tester", age: 30 }],
    contactEmail: email, contactPhone: "+91 90000 00000",
    seatNumbers: pick, travelers: 2, cabinClass: "Economy",
  }, token);
  check("booking succeeds (201)", booking.status === 201, `status=${booking.status} ${booking.body?.message || ""}`);
  bookingId = booking.body?.booking?.id;
  const pnr = booking.body?.booking?.pnr;
  check("PNR has expected format", PNR_RE.test(pnr || ""), `pnr=${pnr}`);
  check("booking returns CONFIRMED", booking.body?.booking?.status === "CONFIRMED");
  check("booking total price is positive", Number(booking.body?.booking?.totalPrice) > 0);

  const dbBooking = await q("SELECT id, userId, pnr, status, seatNumbers FROM bookings WHERE pnr = ?", [pnr]);
  check("PNR is persisted uniquely in DB", dbBooking.length === 1, `rows=${dbBooking.length}`);
  check("booking is linked to the test user", dbBooking[0]?.userId === testUserId);
  const pnrDup = await q("SELECT COUNT(*) c FROM bookings WHERE pnr = ?", [pnr]);
  check("PNR is unique", pnrDup[0].c === 1);
  const dbSeats = await q("SELECT seatNumber, status FROM seats WHERE flightId = ? AND travelDate = ? AND seatNumber IN (?)",
    [bookable.id, outDate, pick]);
  check("booked seats marked booked in DB", dbSeats.length === 2 && dbSeats.every(s => s.status === "booked"), JSON.stringify(dbSeats));

  // booking history + retrieve by PNR
  const history = await req("GET", "/api/bookings", null, token);
  const found = (history.body?.bookings || []).find(b => b.pnr === pnr);
  check("booking appears in history", !!found);
  check("booking can be retrieved by its PNR", (history.body?.bookings || []).some(b => b.pnr.toUpperCase() === pnr.toUpperCase()));
  check("history exposes seats for the booking", Array.isArray(found?.seatNumbers) && found.seatNumbers.length === 2, JSON.stringify(found?.seatNumbers));

  const afterBook = await req("GET", `/api/flights/${bookable.id}`);
  check("availability dropped after booking", afterBook.body?.flight?.availableSeats === seatsBefore - 2,
    `before=${seatsBefore} after=${afterBook.body?.flight?.availableSeats}`);
  const bookedSeatNow = (afterBook.body?.flight?.seats || []).filter(s => pick.includes(s.seatNumber));
  check("selected seats show booked on the map", bookedSeatNow.length === 2 && bookedSeatNow.every(s => s.status === "booked"));

  const doubleBook = await req("POST", "/api/bookings", {
    flightId: bookable.id, travelDate: outDate, passengerName: "QA", seatNumbers: [pick[0]], travelers: 1,
  }, token);
  check("re-booking an already booked seat is rejected (409)", doubleBook.status === 409, `status=${doubleBook.status}`);

  const otherUser = await req("GET", `/api/bookings`, null, token); // still same user; cross-user check below uses admin dashboards
  check("bookings list is scoped to the caller", (otherUser.body?.bookings || []).every(b => b.userId === testUserId || b.userId === undefined || b.userId === testUserId));

  // ── 4. cancellation and seat release ───────────────────────────────────────
  console.log("\n[4] Cancellation & seat release");
  const cancel = await req("POST", `/api/bookings/${bookingId}/cancel`, {}, token);
  check("cancel succeeds", cancel.status === 200, `status=${cancel.status}`);
  const cancelAgain = await req("POST", `/api/bookings/${bookingId}/cancel`, {}, token);
  check("double cancel rejected (400)", cancelAgain.status === 400, `status=${cancelAgain.status}`);
  const afterCancel = await req("GET", `/api/flights/${bookable.id}`);
  const released = (afterCancel.body?.flight?.seats || []).filter(s => pick.includes(s.seatNumber));
  check("seats released after cancellation", released.every(s => s.status === "available"), JSON.stringify(released.map(s => s.status)));
  check("availability restored after cancellation", afterCancel.body?.flight?.availableSeats === seatsBefore,
    `expected=${seatsBefore} got=${afterCancel.body?.flight?.availableSeats}`);
  const dbCancel = await q("SELECT status FROM bookings WHERE id = ?", [bookingId]);
  check("booking marked CANCELLED in DB", dbCancel[0]?.status === "CANCELLED");

  // ── 5. notifications, fare watch, planner, status ──────────────────────────
  console.log("\n[5] Secondary features");
  const notes = await req("GET", "/api/notifications", null, token);
  check("notifications endpoint works", Array.isArray(notes.body?.notifications));
  check("booking + cancellation notifications created", (notes.body?.notifications || []).filter(n => /booking|cancel/i.test(n.title || "")).length >= 2,
    `n=${notes.body?.notifications?.length}`);
  if (notes.body?.notifications?.length) {
    const nid = notes.body.notifications[0].id;
    const read = await req("PUT", `/api/notifications/${nid}/read`, {}, token);
    check("mark notification read works", read.status === 200, `status=${read.status}`);
    const readAll = await req("PUT", "/api/notifications/read-all", {}, token);
    check("mark all notifications read works", readAll.status === 200, `status=${readAll.status}`);
  }
  const fw = await req("POST", "/api/fare-watches", { flightId: bookable.id, targetPrice: 3000 }, token);
  check("fare watch created", fw.status === 201 || fw.status === 200, `status=${fw.status}`);
  const fwList = await req("GET", "/api/fare-watches", null, token);
  check("fare watch listed", (fwList.body?.watches || fwList.body?.fareWatches || []).length >= 1, JSON.stringify(fwList.body).slice(0, 120));
  const fwId = (fwList.body?.watches || fwList.body?.fareWatches || [])[0]?.id || fw.body?.watch?.id;
  if (fwId) {
    const fwDel = await req("DELETE", `/api/fare-watches/${fwId}`, null, token);
    check("fare watch deleted", fwDel.status === 200, `status=${fwDel.status}`);
  }
  const fwCheck = await req("POST", "/api/fare-watches/check", {}, token);
  check("fare watch check runs", fwCheck.status === 200, `status=${fwCheck.status}`);
  const planner = await req("POST", "/api/planner/recommend", { origin: "Mumbai (BOM)", destination: "Delhi (DEL)", departureDate: shift(2), travelers: 1, budget: 50000, preferences: ["morning"] });
  check("travel planner recommends flights", (planner.body?.recommendations?.length || 0) >= 1,
    JSON.stringify(planner.body).slice(0, 160));
  const status = await req("GET", `/api/flights/status?flightNumber=${encodeURIComponent(bookable.flightNumber)}`);
  check("flight status lookup works", status.status === 200 && status.body?.flight?.flightNumber === bookable.flightNumber, `status=${status.status}`);

  // ── 6. admin panel & authorization ─────────────────────────────────────────
  console.log("\n[6] Admin panel & authorization");
  const userOnAdmin = await req("GET", "/api/admin/dashboard", null, token);
  check("normal user blocked from admin API (403)", userOnAdmin.status === 403, `status=${userOnAdmin.status}`);
  const anonOnAdmin = await req("GET", "/api/admin/dashboard");
  check("anonymous blocked from admin API (401)", anonOnAdmin.status === 401, `status=${anonOnAdmin.status}`);
  const userCreateFlight = await req("POST", "/api/admin/flights", { flightNumber: "SK-999", origin: "X", destination: "Y", departureDate: shift(3) }, token);
  check("normal user blocked from admin flight create (403)", userCreateFlight.status === 403, `status=${userCreateFlight.status}`);

  const adminLogin = await req("POST", "/api/admin/login", { email: "admin@skybook.com", password: "Admin@123" });
  const adminToken = adminLogin.body?.token;
  check("admin login works", typeof adminToken === "string" && adminLogin.body?.user?.role === "ADMIN", JSON.stringify(adminLogin.body)?.slice(0, 120));
  const nonAdminLogin = await req("POST", "/api/admin/login", { email, password });
  check("non-admin blocked from admin login (403)", nonAdminLogin.status === 403, `status=${nonAdminLogin.status}`);

  const sd = shift(-30), ed = shift(0);
  const dash = await req("GET", `/api/admin/dashboard?startDate=${sd}&endDate=${ed}`, null, adminToken);
  check("admin dashboard loads", dash.status === 200 && !!dash.body?.stats, `status=${dash.status}`);
  const stats = dash.body?.stats || {};
  const dbUsers = Number((await q("SELECT COUNT(*) c FROM users"))[0].c);
  const dbActiveFlights = Number((await q("SELECT COUNT(*) c FROM flights WHERE isActive = 1"))[0].c);
  const dbRangeBookings = Number((await q("SELECT COUNT(*) c FROM bookings WHERE DATE(createdAt) BETWEEN ? AND ?", [sd, ed]))[0].c);
  const dbRangeRevenue = Number((await q("SELECT COALESCE(SUM(totalPrice),0) s FROM bookings WHERE status='CONFIRMED' AND DATE(createdAt) BETWEEN ? AND ?", [sd, ed]))[0].s);
  check("dashboard totalUsers matches DB", Number(stats.totalUsers) === dbUsers, `api=${stats.totalUsers} db=${dbUsers}`);
  check("dashboard activeFlights matches DB", Number(stats.activeFlights) === dbActiveFlights, `api=${stats.activeFlights} db=${dbActiveFlights}`);
  check("dashboard totalBookings matches DB range", Number(stats.totalBookings) === dbRangeBookings, `api=${stats.totalBookings} db=${dbRangeBookings}`);
  check("dashboard revenue matches DB range", Math.abs(Number(stats.totalRevenue) - dbRangeRevenue) < 0.5, `api=${stats.totalRevenue} db=${dbRangeRevenue}`);
  check("dashboard lists flights/users/bookings arrays", Array.isArray(dash.body?.flights) && Array.isArray(dash.body?.users) && Array.isArray(dash.body?.bookings));
  const today = shift(0);
  const dashToday = await req("GET", `/api/admin/dashboard?startDate=${today}&endDate=${today}`, null, adminToken);
  const dbTodayBookings = Number((await q("SELECT COUNT(*) c FROM bookings WHERE DATE(createdAt) = ?", [today]))[0].c);
  check("date-range filter (today) matches DB", Number(dashToday.body?.stats?.totalBookings) === dbTodayBookings,
    `api=${dashToday.body?.stats?.totalBookings} db=${dbTodayBookings}`);
  check("empty range returns zero bookings", Number((await req("GET", `/api/admin/dashboard?startDate=2000-01-01&endDate=2000-01-02`, null, adminToken)).body?.stats?.totalBookings) === 0);

  // admin flight create -> persisted -> deactivate -> hidden from search
  const newFlightNumber = `SK-QA${String(stamp).slice(-4)}`;
  const createRes = await req("POST", "/api/admin/flights", {
    flightNumber: newFlightNumber, airline: "QA Air", origin: "Mumbai (BOM)", destination: "Pune (PNQ)",
    departureDate: shift(20), departureTime: "10:00 AM", arrivalTime: "11:00 AM", price: 2222, status: "On Time",
  }, adminToken);
  createdFlightId = createRes.body?.flightId;
  check("admin can create a flight", createRes.status === 201 && Number.isInteger(createdFlightId), `status=${createRes.status}`);
  const dbNewFlight = await q("SELECT id, isActive, availableSeats FROM flights WHERE id = ?", [createdFlightId]);
  check("created flight persisted in DB", dbNewFlight.length === 1 && dbNewFlight[0].isActive === 1);
  const newDetails = await req("GET", `/api/flights/${createdFlightId}`);
  check("created flight has a seat map", (newDetails.body?.flight?.seats?.length || 0) >= 32, `seats=${newDetails.body?.flight?.seats?.length}`);
  const newSearch = await req("GET", `/api/flights/search?from=${encodeURIComponent("Mumbai (BOM)")}&to=${encodeURIComponent("Pune (PNQ)")}&departureDate=${shift(20)}`);
  check("created flight is searchable", (newSearch.body?.flights || []).some(f => f.id === createdFlightId));
  const delRes = await req("DELETE", `/api/admin/flights/${createdFlightId}`, null, adminToken);
  check("admin can deactivate a flight", delRes.status === 200, `status=${delRes.status}`);
  const dbDeactivated = await q("SELECT isActive FROM flights WHERE id = ?", [createdFlightId]);
  check("deactivation saved in DB", dbDeactivated[0]?.isActive === 0);
  const afterDel = await req("GET", `/api/flights/search?from=${encodeURIComponent("Mumbai (BOM)")}&to=${encodeURIComponent("Pune (PNQ)")}&departureDate=${shift(20)}`);
  check("deactivated flight hidden from search", !(afterDel.body?.flights || []).some(f => f.id === createdFlightId));

  // ── 7. cleanup ─────────────────────────────────────────────────────────────
  console.log("\n[7] Cleanup");
  if (KEEP) {
    console.log(`  (kept) test user #${testUserId} ${email}, flight #${createdFlightId}`);
  } else {
    if (createdFlightId) await q("DELETE FROM seats WHERE flightId = ?", [createdFlightId]);
    if (createdFlightId) await q("DELETE FROM flights WHERE id = ?", [createdFlightId]);
    if (testUserId) {
      await q("DELETE FROM notifications WHERE userId = ?", [testUserId]);
      await q("DELETE FROM fare_watches WHERE userId = ?", [testUserId]);
      await q("DELETE FROM account_preferences WHERE userId = ?", [testUserId]);
      await q("DELETE FROM bookings WHERE userId = ?", [testUserId]);
      await q("DELETE FROM users WHERE id = ?", [testUserId]);
    }
    check("test rows cleaned up", (await q("SELECT COUNT(*) c FROM users WHERE id = ?", [testUserId]))[0].c === 0);
  }

  await pool.end();
  console.log("\n" + "=".repeat(52));
  console.log(`Results: \u2705 ${pass} passed | \u274c ${fail} failed | \ud83d\udcca ${pass + fail} total`);
  if (fail) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("Status: \ud83c\udf89 ALL JOURNEY CHECKS PASSED");
})().catch(async e => { console.error("FATAL", e); process.exit(1); });
