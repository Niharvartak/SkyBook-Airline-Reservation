/**
 * Extended API regression suite for the production-readiness work.
 * Covers the shared airport catalogue, account recovery, customer dashboard,
 * fare watches, cabin pricing and the administrative management endpoints.
 *
 * Usage: node src/backend/extended-api-test.js
 * Requires the backend on http://localhost:8080 and MySQL running.
 * All accounts created here use the test_*@test.com pattern and are removed by
 * `node src/backend/cleanup-test-data.js --apply`.
 */
const BASE = process.env.API_BASE || "http://localhost:8080";

let passed = 0;
let failed = 0;
const failures = [];

async function req(method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed, headers: res.headers, text };
}

async function test(name, fn) {
  try {
    const error = await fn();
    if (error) {
      failed += 1;
      failures.push(`${name}: ${error}`);
      console.log(`  ❌  ${name}: ${error}`);
    } else {
      passed += 1;
      console.log(`  ✅  ${name}`);
    }
  } catch (error) {
    failed += 1;
    failures.push(`${name}: ${error.message}`);
    console.log(`  ❌  ${name}: ${error.message}`);
  }
}

const futureDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

(async () => {
  console.log("────────────────────────────────────────────────────────────");
  console.log(" SkyBook extended API suite");
  console.log("────────────────────────────────────────────────────────────");

  // ── Public configuration & catalogue ─────────────────────────────────────
  console.log("\n🌐 Public catalogue");
  await test("GET /api/health reports MySQL", async () => {
    const { status, body } = await req("GET", "/api/health");
    if (status !== 200 || body.db !== "mysql") return `status ${status} db ${body.db}`;
  });

  await test("GET /api/settings/public exposes branding only", async () => {
    const { status, body } = await req("GET", "/api/settings/public");
    if (status !== 200) return `status ${status}`;
    if (!body.settings?.brand_name) return "missing brand_name";
    const keys = Object.keys(body.settings || {});
    if (keys.some(key => /secret|password|token/i.test(key))) return "secret-like key exposed";
  });

  await test("GET /api/airports returns the 72-airport shared catalogue", async () => {
    const { status, body } = await req("GET", "/api/airports");
    if (status !== 200) return `status ${status}`;
    if (!Array.isArray(body.airports) || body.airports.length < 72) return `only ${body.airports?.length} airports`;
    if (!body.airports.some(a => a.code === "IXL")) return "Leh (IXL) missing";
    if (!body.airports.every(a => a.name && a.city && a.code)) return "catalogue row missing required fields";
  });

  await test("GET /api/destinations is backed by the airport table", async () => {
    const { status, body } = await req("GET", "/api/destinations");
    if (status !== 200) return `status ${status}`;
    if (!Array.isArray(body.destinations) || body.destinations.length === 0) return "no destinations";
    if (!body.destinations.every(d => typeof d.city === "string" && typeof d.code === "string")) return "malformed destination";
  });

  // ── Test account ─────────────────────────────────────────────────────────
  console.log("\n👤 Account lifecycle");
  const stamp = Date.now().toString().slice(-9);
  const email = `test_ext_${stamp}@test.com`;
  const initialPassword = "test123";
  let userToken = null;
  let userId = null;

  await test("POST /api/auth/register creates a disposable account", async () => {
    const { status, body } = await req("POST", "/api/auth/register", {
      name: "Extended QA", email, password: initialPassword,
    });
    if (status !== 201) return `status ${status}: ${JSON.stringify(body)}`;
    userId = body.user?.id;
    if (!userId) return "missing user id";
  });

  await test("POST /api/auth/login returns a customer token", async () => {
    const { status, body } = await req("POST", "/api/auth/login", { email, password: initialPassword });
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    if (body.user?.role !== "USER") return `role ${body.user?.role}`;
    userToken = body.token;
  });

  await test("PUT /api/auth/profile persists name and phone", async () => {
    const { status, body } = await req("PUT", "/api/auth/profile", {
      name: "Extended QA Updated", email, phone: "+91 90000 11111",
    }, userToken);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    if (body.user?.phone !== "+91 90000 11111") return "phone not persisted";
  });

  await test("POST /api/auth/change-password rotates credentials", async () => {
    const { status, body } = await req("POST", "/api/auth/change-password", {
      currentPassword: initialPassword, newPassword: "newpass123",
    }, userToken);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    const login = await req("POST", "/api/auth/login", { email, password: "newpass123" });
    if (login.status !== 200) return `new password rejected (${login.status})`;
    userToken = login.body.token;
  });

  await test("POST /api/auth/forgot-password returns a dev-only one-time link", async () => {
    const { status, body } = await req("POST", "/api/auth/forgot-password", { email });
    if (status !== 200) return `status ${status}`;
    if (body.delivery !== "not-configured") return "delivery should be labelled not-configured";
    if (!body.devResetToken || !body.devResetUrl) return "no development reset token";
  });

  await test("POST /api/auth/reset-password consumes the token and rejects reuse", async () => {
    const forgot = await req("POST", "/api/auth/forgot-password", { email });
    const token = forgot.body.devResetToken;
    if (!token) return "no reset token";
    const reset = await req("POST", "/api/auth/reset-password", { token, password: "reset123" });
    if (reset.status !== 200) return `reset status ${reset.status}: ${JSON.stringify(reset.body)}`;
    const reuse = await req("POST", "/api/auth/reset-password", { token, password: "another123" });
    if (reuse.status !== 400) return `token was reusable (status ${reuse.status})`;
    const login = await req("POST", "/api/auth/login", { email, password: "reset123" });
    if (login.status !== 200) return "reset password does not log in";
    userToken = login.body.token;
  });

  // ── Customer dashboard + booking ──────────────────────────────────────────
  console.log("\n🧭 Customer dashboard & booking");
  let booking = null;
  let flightId = null;
  let flightPrice = 0;
  let flightDate = null;
  let businessSeat = null;
  let economySeat = null;

  await test("GET /api/dashboard/overview returns customer statistics", async () => {
    const { status, body } = await req("GET", "/api/dashboard/overview", undefined, userToken);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    if (typeof body.stats?.totalBookings !== "number") return "missing stats";
    if (typeof body.stats?.profileCompletion !== "number") return "missing profileCompletion";
  });

  await test("GET /api/flights/search finds a future flight with seats", async () => {
    const date = futureDate(3);
    const { status, body } = await req("GET", `/api/flights/search?from=${encodeURIComponent("Mumbai (BOM)")}&to=${encodeURIComponent("Delhi (DEL)")}&departureDate=${date}`);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    const flight = (body.flights || []).find(f => f.availableSeats > 0);
    if (!flight) return `no flight with seats on ${date}`;
    flightId = flight.id;
    flightPrice = Number(flight.price);
    flightDate = String(flight.departureDate).slice(0, 10);
  });

  await test("GET /api/flights/:id returns seat metadata and live availability", async () => {
    const { status, body } = await req("GET", `/api/flights/${flightId}`);
    if (status !== 200) return `status ${status}`;
    const seats = body.flight?.seats || [];
    if (!seats.length) return "no seats";
    if (!seats.every(s => s.cabinClass === "Business" || s.cabinClass === "Economy")) return "seat cabinClass missing";
    businessSeat = seats.find(s => s.cabinClass === "Business" && s.status === "available")?.seatNumber;
    if (!businessSeat) return "no business seat available";
    economySeat = seats.find(s => s.cabinClass === "Economy" && s.status === "available")?.seatNumber;
    if (!economySeat) return "no economy seat available";
  });

  await test("POST /api/bookings rejects a seat outside the selected cabin", async () => {
    const { status, body } = await req("POST", "/api/bookings", {
      flightId,
      travelDate: `${flightDate}T00:00:00.000Z`,
      passengerName: "Mr Cabin Mismatch",
      contactEmail: email,
      seatNumbers: [economySeat],
      travelers: 1,
      cabinClass: "Business",
    }, userToken);
    if (status !== 400) return `expected 400, got ${status}: ${JSON.stringify(body)}`;
    if (!String(body.message).includes("was selected")) return `unexpected message: ${body.message}`;
  });

  await test("POST /api/bookings prices a Business cabin at 2.5×", async () => {
    const { status, body } = await req("POST", "/api/bookings", {
      flightId,
      travelDate: `${flightDate}T00:00:00.000Z`,
      passengerName: "Mr Extended QA",
      passengers: JSON.stringify([{ title: "Mr", name: "Extended QA", gender: "Adult" }]),
      contactEmail: email,
      contactPhone: "+91 90000 11111",
      seatNumbers: [businessSeat],
      travelers: 1,
      cabinClass: "Business",
    }, userToken);
    if (status !== 201) return `status ${status}: ${JSON.stringify(body)}`;
    booking = body.booking;
    if (booking.cabinClass !== "Business") return `cabin ${booking.cabinClass}`;
    if (!booking.fareBreakdown) return "missing fareBreakdown";
    if (Number(booking.fareBreakdown.baseFare) !== Math.round(flightPrice * 2.5)) {
      return `baseFare ${booking.fareBreakdown.baseFare} expected ${Math.round(flightPrice * 2.5)}`;
    }
  });

  await test("GET /api/customer/bookings searches by PNR", async () => {
    const { status, body } = await req("GET", `/api/customer/bookings?search=${encodeURIComponent(booking.pnr)}`, undefined, userToken);
    if (status !== 200) return `status ${status}`;
    if (!body.bookings?.some(b => b.pnr === booking.pnr)) return "booking not found";
    if (body.total !== 1) return `total ${body.total}`;
  });

  await test("GET /api/bookings/:id exposes fare breakdown", async () => {
    const { status, body } = await req("GET", `/api/bookings/${booking.id}`, undefined, userToken);
    if (status !== 200) return `status ${status}`;
    if (!body.booking?.fareBreakdown) return "missing fareBreakdown";
    if (body.booking.cabinClass !== "Business") return "cabin class lost";
  });

  await test("POST /api/bookings/:id/cancel applies policy and releases the seat", async () => {
    const { status, body } = await req("POST", `/api/bookings/${booking.id}/cancel`, {}, userToken);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    if (body.refund?.status !== "not-applicable") return "refund should be labelled not-applicable";
    const detail = await req("GET", `/api/flights/${flightId}`);
    const seat = detail.body.flight?.seats?.find(s => s.seatNumber === businessSeat);
    if (seat?.status !== "available") return "seat was not released";
  });

  await test("GET /api/notifications contains booking and cancellation events", async () => {
    const { status, body } = await req("GET", "/api/notifications", undefined, userToken);
    if (status !== 200) return `status ${status}`;
    const types = (body.notifications || []).map(n => n.type);
    if (!types.includes("booking")) return "no booking notification";
    if (!types.includes("cancellation")) return "no cancellation notification";
  });

  await test("GET /api/notifications/unread-count returns a number", async () => {
    const { status, body } = await req("GET", "/api/notifications/unread-count", undefined, userToken);
    if (status !== 200) return `status ${status}`;
    if (typeof body.unread !== "number") return "unread missing";
  });

  // ── Fare watch lifecycle ─────────────────────────────────────────────────
  console.log("\n◎ Fare watches");
  let watchId = null;

  await test("POST /api/fare-watches creates a watch", async () => {
    const { status, body } = await req("POST", "/api/fare-watches", { flightId, targetPrice: Math.round(flightPrice * 0.8) }, userToken);
    if (status !== 201 && status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    watchId = body.fareWatch?.id || body.watch?.id || body.id;
    if (!watchId) {
      const list = await req("GET", "/api/fare-watches", undefined, userToken);
      watchId = list.body.fareWatches?.[0]?.id;
    }
    if (!watchId) return "watch id missing";
  });

  await test("PUT /api/fare-watches/:id updates target and pause state", async () => {
    const { status, body } = await req("PUT", `/api/fare-watches/${watchId}`, {
      targetPrice: Math.round(flightPrice * 0.7), isActive: false,
    }, userToken);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    const list = await req("GET", "/api/fare-watches", undefined, userToken);
    const watch = list.body.fareWatches?.find(w => w.id === watchId);
    if (Number(watch?.targetPrice) !== Math.round(flightPrice * 0.7)) return "target not updated";
    if (Number(watch?.isActive) !== 0) return "watch not paused";
  });

  await test("POST /api/fare-watches/:id/check records a snapshot", async () => {
    await req("PUT", `/api/fare-watches/${watchId}`, { isActive: true }, userToken);
    const { status, body } = await req("POST", `/api/fare-watches/${watchId}/check`, {}, userToken);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
  });

  // ── Admin management ─────────────────────────────────────────────────────
  console.log("\n👑 Admin management");
  let adminToken = null;
  let adminId = null;
  let createdFlightId = null;
  let originalTagline = null;
  let airportBackup = null;

  await test("POST /api/auth/login authenticates the administrator", async () => {
    const { status, body } = await req("POST", "/api/auth/login", { email: "admin@skybook.com", password: "Admin@123" });
    if (status !== 200) return `status ${status}`;
    if (body.user?.role !== "ADMIN") return `role ${body.user?.role}`;
    adminToken = body.token;
    adminId = body.user.id;
  });

  await test("GET /api/admin/overview returns platform metrics", async () => {
    const { status, body } = await req("GET", "/api/admin/overview", undefined, adminToken);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    if (!body.stats || typeof body.stats.totalUsers !== "number") return "missing stats";
    if (!Array.isArray(body.bookingTrend)) return "missing bookingTrend";
  });

  await test("GET /api/admin/flights paginates and filters", async () => {
    const { status, body } = await req("GET", "/api/admin/flights?limit=5&search=SK-", undefined, adminToken);
    if (status !== 200) return `status ${status}`;
    if (!Array.isArray(body.flights) || body.flights.length > 5) return "bad page size";
    if (typeof body.total !== "number") return "missing total";
  });

  await test("POST /api/admin/flights creates a flight with exact seat inventory", async () => {
    const { status, body } = await req("POST", "/api/admin/flights", {
      flightNumber: `SK-QA${stamp.slice(-5)}`,
      airline: "SkyBook QA",
      origin: "Mumbai (BOM)",
      destination: "Delhi (DEL)",
      departureDate: futureDate(3),
      departureTime: "09:00 AM",
      arrivalTime: "11:15 AM",
      price: 5000,
      status: "On Time",
      capacity: 40,
      aircraft: "Airbus A320neo",
      cabinClasses: "Economy,Business",
      baggageAllowance: "15kg check-in + 7kg cabin",
      terminal: "T2",
      gate: "G12",
    }, adminToken);
    if (status !== 201) return `status ${status}: ${JSON.stringify(body)}`;
    createdFlightId = body.flightId;
    if (body.capacity !== 40) return `capacity ${body.capacity}`;
    const detail = await req("GET", `/api/flights/${createdFlightId}`);
    if (detail.body.flight?.seats?.length !== 40) return `seats ${detail.body.flight?.seats?.length}`;
  });

  await test("PUT /api/admin/flights/:id edits fare and metadata", async () => {
    const { status, body } = await req("PUT", `/api/admin/flights/${createdFlightId}`, {
      price: 5500, aircraft: "Boeing 737 MAX", gate: "G14",
    }, adminToken);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    const detail = await req("GET", `/api/flights/${createdFlightId}`);
    if (Number(detail.body.flight?.price) !== 5500) return "price not updated";
    if (detail.body.flight?.aircraft !== "Boeing 737 MAX") return "aircraft not updated";
  });

  await test("PATCH /api/admin/flights/:id/status archives and restores a flight", async () => {
    const archive = await req("PATCH", `/api/admin/flights/${createdFlightId}/status`, { isActive: false }, adminToken);
    if (archive.status !== 200) return `archive status ${archive.status}`;
    const search = await req("GET", `/api/flights/search?from=${encodeURIComponent("Mumbai (BOM)")}&to=${encodeURIComponent("Delhi (DEL)")}&departureDate=${futureDate(3)}`);
    if ((search.body.flights || []).some(f => f.id === createdFlightId)) return "archived flight still searchable";
    const restore = await req("PATCH", `/api/admin/flights/${createdFlightId}/status`, { isActive: true }, adminToken);
    if (restore.status !== 200) return `restore status ${restore.status}`;
  });

  await test("PATCH /api/admin/bookings/:id/status cancels and releases seats", async () => {
    const seats = await req("GET", `/api/flights/${createdFlightId}`);
    const seat = seats.body.flight?.seats?.find(s => s.status === "available" && s.cabinClass === "Economy");
    if (!seat) return "no seat for admin booking";
    const create = await req("POST", "/api/bookings", {
      flightId: createdFlightId,
      travelDate: futureDate(3),
      passengerName: "Mr Admin Cancel",
      contactEmail: email,
      seatNumbers: [seat.seatNumber],
      travelers: 1,
      cabinClass: "Economy",
    }, userToken);
    if (create.status !== 201) return `booking status ${create.status}: ${JSON.stringify(create.body)}`;
    const id = create.body.booking.id;
    const cancel = await req("PATCH", `/api/admin/bookings/${id}/status`, { status: "CANCELLED" }, adminToken);
    if (cancel.status !== 200) return `cancel status ${cancel.status}: ${JSON.stringify(cancel.body)}`;
    const after = await req("GET", `/api/flights/${createdFlightId}`);
    const released = after.body.flight?.seats?.find(s => s.seatNumber === seat.seatNumber);
    if (released?.status !== "available") return "seat not released after admin cancellation";
  });

  await test("GET /api/admin/users reports roles and booking counts", async () => {
    const { status, body } = await req("GET", `/api/admin/users?search=${encodeURIComponent(email)}`, undefined, adminToken);
    if (status !== 200) return `status ${status}`;
    const user = body.users?.find(u => u.email === email);
    if (!user) return "test user not listed";
    if (!("bookingCount" in user) || !("role" in user)) return "missing user projections";
  });

  await test("PATCH /api/admin/users/:id/role refuses to demote the last admin", async () => {
    const { status } = await req("PATCH", `/api/admin/users/${adminId}/role`, { role: "USER" }, adminToken);
    if (![400, 409].includes(status)) return `expected 400/409, got ${status}`;
  });

  await test("PATCH /api/admin/users/:id/status deactivates and restores a customer", async () => {
    const off = await req("PATCH", `/api/admin/users/${userId}/status`, { isActive: false }, adminToken);
    if (off.status !== 200) return `deactivate status ${off.status}`;
    const blocked = await req("POST", "/api/auth/login", { email, password: "reset123" });
    if (blocked.status !== 403) return `login while disabled returned ${blocked.status}`;
    const on = await req("PATCH", `/api/admin/users/${userId}/status`, { isActive: true }, adminToken);
    if (on.status !== 200) return `restore status ${on.status}`;
  });

  await test("GET /api/admin/airports returns flight counts", async () => {
    const { status, body } = await req("GET", "/api/admin/airports?search=Leh", undefined, adminToken);
    if (status !== 200) return `status ${status}`;
    const airport = body.airports?.find(a => a.code === "IXL");
    if (!airport) return "IXL not found";
    if (!("activeFlights" in airport)) return "missing activeFlights";
    airportBackup = airport;
  });

  await test("PATCH /api/admin/airports/:id round-trips a description", async () => {
    const update = await req("PATCH", `/api/admin/airports/${airportBackup.id}`, {
      description: `${airportBackup.description || ""} [qa]`,
    }, adminToken);
    if (update.status !== 200) return `status ${update.status}: ${JSON.stringify(update.body)}`;
    if (!String(update.body.airport?.description).endsWith("[qa]")) return "description not updated";
    const restore = await req("PATCH", `/api/admin/airports/${airportBackup.id}`, {
      description: airportBackup.description || "",
    }, adminToken);
    if (restore.status !== 200) return `restore status ${restore.status}`;
  });

  await test("GET /api/admin/reports/:type generates JSON reports", async () => {
    for (const type of ["bookings", "routes", "users", "revenue", "cancellations", "fare-watches"]) {
      const { status, body } = await req("GET", `/api/admin/reports/${type}`, undefined, adminToken);
      if (status !== 200) return `${type}: status ${status}`;
      if (!Array.isArray(body.rows)) return `${type}: rows missing`;
      if (!body.summary) return `${type}: summary missing`;
    }
  });

  await test("GET /api/admin/reports/bookings?format=csv returns CSV", async () => {
    const res = await fetch(`${BASE}/api/admin/reports/bookings?format=csv`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) return `status ${res.status}`;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/csv")) return `content-type ${type}`;
    const text = await res.text();
    if (!text.includes("pnr")) return "CSV header missing pnr";
  });

  await test("PUT /api/admin/settings validates and persists", async () => {
    const current = await req("GET", "/api/admin/settings", undefined, adminToken);
    originalTagline = current.body.settings?.brand_tagline || "";
    const bad = await req("PUT", "/api/admin/settings", { cancellation_window_hours: 999 }, adminToken);
    if (bad.status !== 400) return `invalid window accepted (${bad.status})`;
    const save = await req("PUT", "/api/admin/settings", {
      brand_tagline: `${originalTagline} [qa]`,
    }, adminToken);
    if (save.status !== 200) return `save status ${save.status}`;
    if (!String(save.body.settings?.brand_tagline).endsWith("[qa]")) return "tagline not saved";
    const restore = await req("PUT", "/api/admin/settings", { brand_tagline: originalTagline }, adminToken);
    if (restore.status !== 200) return `restore status ${restore.status}`;
  });

  await test("GET /api/admin/audit-log records administrative actions", async () => {
    const { status, body } = await req("GET", "/api/admin/audit-log?limit=50", undefined, adminToken);
    if (status !== 200) return `status ${status}`;
    if (!Array.isArray(body.entries) || body.total === 0) return "no audit entries";
    if (!body.entries.some(entry => entry.action === "flight.create")) return "flight.create not audited";
  });

  await test("Non-admin tokens are rejected by admin endpoints", async () => {
    const { status } = await req("GET", "/api/admin/overview", undefined, userToken);
    if (status !== 403) return `expected 403, got ${status}`;
  });

  // ── Cleanup of the admin-created flight ──────────────────────────────────
  if (createdFlightId) {
    await req("PATCH", `/api/admin/flights/${createdFlightId}/status`, { isActive: false }, adminToken);
  }

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(`Result: ${passed} passed | ${failed} failed | ${passed + failed} total`);
  if (failures.length) {
    console.log("Failures:");
    failures.forEach(failure => console.log(`  - ${failure}`));
  }
  console.log("Test accounts match test_*@test.com and are removed by cleanup-test-data.js.");
  process.exit(failed > 0 ? 1 : 0);
})().catch(error => {
  console.error("FATAL", error);
  process.exit(1);
});
