/**
 * Administrator access, validation and safe-flight-removal checks.
 *
 * Requires the backend to be running. It creates and removes one disposable
 * flight; it never changes genuine users, bookings or airports.
 *
 *   node src/backend/admin-security-test.js
 */
const API = String(process.env.SKYBOOK_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.SKYBOOK_ADMIN_EMAIL || "admin@skybook.com";
const ADMIN_PASSWORD = process.env.SKYBOOK_DEV_ADMIN_PASSWORD || "Admin@123";

let pass = 0;
let fail = 0;
let adminToken = null;
let createdFlightId = null;

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function req(method, path, body, token, raw = false) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, body: data };
}

async function cleanupFlight() {
  if (!createdFlightId || !adminToken) return;
  try { await req("DELETE", `/api/admin/flights/${createdFlightId}`, undefined, adminToken); } catch {}
  try { await req("DELETE", `/api/admin/flights/${createdFlightId}/permanent`, undefined, adminToken); } catch {}
}

(async () => {
  console.log("🧪 SkyBook administrator security and management checks\n");

  const adminLogin = await req("POST", "/api/admin/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  check("admin signs in with the configured credential", adminLogin.status === 200 && adminLogin.body.user?.role === "ADMIN", `${adminLogin.status}`);
  adminToken = adminLogin.body.token;
  const adminId = adminLogin.body.user?.id;

  const oldLogin = await req("POST", "/api/admin/login", { email: ADMIN_EMAIL, password: "admin123" });
  check("old development password is rejected", oldLogin.status === 401, `${oldLogin.status}`);

  const customerAdminLogin = await req("POST", "/api/admin/login", { email: "demo@skybook.com", password: "demo123" });
  check("customer is rejected by the admin sign-in endpoint", customerAdminLogin.status === 403, `${customerAdminLogin.status}`);

  const missingPassword = await req("POST", "/api/admin/login", { email: ADMIN_EMAIL });
  check("admin sign-in without a password returns 400", missingPassword.status === 400, `${missingPassword.status}`);

  const anonymous = await req("GET", "/api/admin/overview");
  check("anonymous admin API access returns 401", anonymous.status === 401, `${anonymous.status}`);

  const customerLogin = await req("POST", "/api/auth/login", { email: "demo@skybook.com", password: "demo123" });
  const customerToken = customerLogin.body.token;
  check("demo customer can sign in to the public site", customerLogin.status === 200 && Boolean(customerToken), `${customerLogin.status}`);

  const customerAdminApi = await req("GET", "/api/admin/overview", undefined, customerToken);
  check("customer token is rejected by admin APIs", customerAdminApi.status === 403, `${customerAdminApi.status}`);

  const overview = await req("GET", "/api/admin/overview", undefined, adminToken);
  check("dashboard statistics load from the database", overview.status === 200 && typeof overview.body.stats?.totalUsers === "number" && typeof overview.body.stats?.totalAirports === "number", `${overview.status}`);

  const invalidFlight = await req("GET", "/api/flights/not-a-number");
  check("invalid public flight id returns 400", invalidFlight.status === 400, `${invalidFlight.status}`);

  const malformed = await req("POST", "/api/auth/login", "{bad json", undefined, true);
  check("malformed JSON returns 400", malformed.status === 400, `${malformed.status}`);

  const stringUserStatus = await req("PATCH", `/api/admin/users/${adminId}/status`, { isActive: "false" }, adminToken);
  check("string user status is rejected without changing the account", stringUserStatus.status === 400, `${stringUserStatus.status}`);

  const badSetting = await req("PUT", "/api/admin/settings", { cancellation_window_hours: "abc" }, adminToken);
  check("non-numeric setting is rejected", badSetting.status === 400, `${badSetting.status}`);

  const badNewsletter = await req("POST", "/api/newsletter", { email: "not-an-email" });
  check("invalid newsletter email is rejected", badNewsletter.status === 400, `${badNewsletter.status}`);

  const flights = await req("GET", "/api/admin/flights?limit=1", undefined, adminToken);
  check("admin flight rows expose booking counts", flights.status === 200 && flights.body.flights?.length > 0 && Object.prototype.hasOwnProperty.call(flights.body.flights[0], "bookingCount"), `${flights.status}`);

  const missingDelete = await req("DELETE", "/api/admin/flights/999999", undefined, adminToken);
  check("archiving a missing flight returns 404", missingDelete.status === 404, `${missingDelete.status}`);

  const invalidDelete = await req("DELETE", "/api/admin/flights/not-a-number", undefined, adminToken);
  check("archiving an invalid flight id returns 400", invalidDelete.status === 400, `${invalidDelete.status}`);

  // A real booking must protect its flight from removal.
  const genuine = await req("GET", "/api/admin/bookings?search=SKB-Z3MJY6&limit=10", undefined, adminToken);
  const genuineBooking = genuine.body.bookings?.find(booking => booking.pnr === "SKB-Z3MJY6");
  if (genuineBooking) {
    const detail = await req("GET", `/api/admin/bookings/${genuineBooking.id}`, undefined, adminToken);
    const flightId = detail.body.booking?.flightId;
    const guarded = await req("DELETE", `/api/admin/flights/${flightId}`, undefined, adminToken);
    check("a flight with an active booking cannot be archived by the delete endpoint", guarded.status === 409, `${guarded.status}`);
    const stillThere = await req("GET", `/api/flights/${flightId}`);
    check("the guarded flight still exists", stillThere.status === 200, `${stillThere.status}`);
  } else {
    console.log("  SKIP  genuine booking SKB-Z3MJY6 not present; active-booking guard not exercised");
  }

  const flightNumber = `SK-ADM-${Date.now().toString().slice(-8)}`;
  const invalidCapacity = await req("POST", "/api/admin/flights", {
    flightNumber: `SK-BAD-${Date.now().toString().slice(-8)}`,
    airline: "SkyBook Admin QA",
    origin: "Mumbai (BOM)",
    destination: "Delhi (DEL)",
    departureDate: "2026-11-15",
    departureTime: "09:30",
    arrivalTime: "11:30",
    price: 4200,
    capacity: "abc",
  }, adminToken);
  check("non-numeric seat capacity is rejected", invalidCapacity.status === 400, `${invalidCapacity.status}`);

  const create = await req("POST", "/api/admin/flights", {
    flightNumber,
    airline: "SkyBook Admin QA",
    origin: "Mumbai (BOM)",
    destination: "Delhi (DEL)",
    departureDate: "2026-11-15",
    departureTime: "09:30",
    arrivalTime: "11:30",
    price: 4200,
    capacity: 40,
    status: "On Time",
    aircraft: "Airbus A320neo",
    stops: 0,
  }, adminToken);
  createdFlightId = create.body.flightId;
  check("admin creates a flight with seat inventory", create.status === 201 && Boolean(createdFlightId), `${create.status}`);

  if (createdFlightId) {
    const stringFlightStatus = await req("PATCH", `/api/admin/flights/${createdFlightId}/status`, { isActive: "false" }, adminToken);
    check("string flight status is rejected without changing the flight", stringFlightStatus.status === 400, `${stringFlightStatus.status}`);

    const archive = await req("DELETE", `/api/admin/flights/${createdFlightId}`, undefined, adminToken);
    check("admin archives a flight safely", archive.status === 200, `${archive.status}`);

    const permanent = await req("DELETE", `/api/admin/flights/${createdFlightId}/permanent`, undefined, adminToken);
    check("admin permanently deletes an archived unbooked flight", permanent.status === 200, `${permanent.status}`);

    const gone = await req("GET", `/api/flights/${createdFlightId}`);
    check("permanently deleted flight is no longer public", gone.status === 404, `${gone.status}`);

    const audit = await req("GET", "/api/admin/audit-log?search=flight.delete&limit=20", undefined, adminToken);
    const audited = Array.isArray(audit.body.entries) && audit.body.entries.some(entry => entry.action === "flight.delete" && String(entry.entityId) === String(createdFlightId));
    check("permanent deletion is audit-logged", audited, `${audit.status}`);
    createdFlightId = null;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(async error => {
  console.error("\nFATAL:", error.message);
  await cleanupFlight();
  process.exitCode = 1;
});
