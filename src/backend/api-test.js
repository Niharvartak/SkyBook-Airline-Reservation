/**
 * SkyBook API Test Suite
 * Tests all critical endpoints against running server.
 * Usage: node api-test.js
 */
const http = require("http");

const BASE = "http://localhost:8080";
let pass = 0, fail = 0;
let authToken = null;

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method, hostname: "localhost", port: 8080,
      path, headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      }
    };
    const r = http.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => raw += c);
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

async function test(name, fn) {
  try {
    const result = await fn();
    if (result === true || result === undefined) {
      console.log(`  ✅  ${name}`);
      pass++;
    } else {
      console.log(`  ❌  ${name}: ${result}`);
      fail++;
    }
  } catch (e) {
    console.log(`  ❌  ${name}: EXCEPTION ${e.message}`);
    fail++;
  }
}

async function runTests() {
  console.log("\n🧪 SkyBook API Test Suite\n");

  // --- Health ---
  console.log("📋 Health & General");
  await test("GET /api/health returns ok=true", async () => {
    const { body } = await req("GET", "/api/health");
    if (!body.ok) return `ok=false: ${JSON.stringify(body)}`;
    if (body.tables < 10) return `Expected at least 10 tables, got ${body.tables}`;
  });

  await test("GET /api/destinations returns 20+ destinations", async () => {
    const { body } = await req("GET", "/api/destinations");
    if (!body.ok) return "ok=false";
    if (body.destinations.length < 10) return `Only ${body.destinations.length} destinations`;
  });

  // --- Auth ---
  console.log("\n🔐 Authentication");
  const email = `test_${Date.now()}@skybook.com`;
  await test("POST /api/auth/register creates user", async () => {
    const { status, body } = await req("POST", "/api/auth/register", { name: "Test User", email, password: "test123" });
    if (status !== 201) return `status ${status}: ${JSON.stringify(body)}`;
    if (!body.ok || !body.user) return `unexpected: ${JSON.stringify(body)}`;
  });

  await test("POST /api/auth/register rejects duplicate email", async () => {
    const { status, body } = await req("POST", "/api/auth/register", { name: "Test User", email, password: "test123" });
    if (status !== 409) return `expected 409, got ${status}`;
  });

  await test("POST /api/auth/login succeeds", async () => {
    const { status, body } = await req("POST", "/api/auth/login", { email, password: "test123" });
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    if (!body.token) return "no token in response";
    authToken = body.token;
  });

  await test("POST /api/auth/login rejects wrong password", async () => {
    const { status } = await req("POST", "/api/auth/login", { email, password: "wrongpass" });
    if (status !== 401) return `expected 401, got ${status}`;
  });

  await test("GET /api/auth/profile requires auth", async () => {
    const { status } = await req("GET", "/api/auth/profile");
    if (status !== 401) return `expected 401, got ${status}`;
  });

  await test("GET /api/auth/profile works with token", async () => {
    const { status, body } = await req("GET", "/api/auth/profile", null, authToken);
    if (status !== 200) return `status ${status}`;
    if (!body.user?.email) return "no user.email in response";
  });

  // --- Admin ---
  console.log("\n👑 Admin Auth");
  let adminToken = null;
  await test("POST /api/admin/login works for admin@skybook.com", async () => {
    const { status, body } = await req("POST", "/api/admin/login", { email: "admin@skybook.com", password: "Admin@123" });
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    if (!body.token) return "no token";
    adminToken = body.token;
  });

  await test("POST /api/admin/login rejects non-admin user", async () => {
    const { status } = await req("POST", "/api/admin/login", { email, password: "test123" });
    if (status !== 403) return `expected 403, got ${status}`;
  });

  // --- Flights ---
  console.log("\n✈️  Flights");
  await test("GET /api/flights/search returns flights (BOM→DEL)", async () => {
    const { status, body } = await req("GET", "/api/flights/search?from=BOM&to=DEL");
    if (status !== 200) return `status ${status}`;
    if (!Array.isArray(body.flights)) return "flights not array";
    if (body.flights.length === 0) return "no flights found (check seed data)";
    console.log(`       (found ${body.flights.length} flights)`);
  });

  await test("GET /api/flights/search rejects same origin/dest", async () => {
    const { status } = await req("GET", "/api/flights/search?from=BOM&to=BOM");
    if (status !== 400) return `expected 400, got ${status}`;
  });

  await test("GET /api/flights/catalog returns flights", async () => {
    const { status, body } = await req("GET", "/api/flights/catalog");
    if (status !== 200) return `status ${status}`;
    if (body.flights.length === 0) return "no flights in catalog";
    console.log(`       (catalog has ${body.flights.length} flights)`);
  });

  let flightId = null;
  await test("GET /api/flights/:id returns flight with seat map", async () => {
    // Use a departure a few days away so the cancellation-window policy can be exercised.
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const { body: search } = await req(
      "GET",
      `/api/flights/search?from=${encodeURIComponent("Mumbai (BOM)")}&to=${encodeURIComponent("Delhi (DEL)")}&departureDate=${date}`
    );
    const flight = (search.flights || []).find(f => f.availableSeats > 1);
    if (!flight) return `no flight with seats on ${date}`;
    flightId = flight.id;
    const { status, body } = await req("GET", `/api/flights/${flightId}`);
    if (status !== 200) return `status ${status}`;
    if (!body.flight?.seats?.length) return "no seats in response";
    console.log(`       (flight ${flightId} has ${body.flight.seats.length} seats)`);
  });

  await test("GET /api/flights/status returns status for SK-101", async () => {
    const { status, body } = await req("GET", "/api/flights/status?flightNumber=SK-101");
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    if (!body.flight) return "no flight in response";
  });

  // --- Bookings ---
  console.log("\n📋 Bookings");
  await test("GET /api/bookings requires auth", async () => {
    const { status } = await req("GET", "/api/bookings");
    if (status !== 401) return `expected 401, got ${status}`;
  });

  await test("GET /api/bookings returns empty array for new user", async () => {
    const { status, body } = await req("GET", "/api/bookings", null, authToken);
    if (status !== 200) return `status ${status}`;
    if (!Array.isArray(body.bookings)) return "not array";
  });

  let bookingPnr = null, bookingId = null;
  if (flightId) {
    // Get flight date
    const { body: flightBody } = await req("GET", `/api/flights/${flightId}`);
    const travelDate = flightBody.flight?.departureDate
      ? new Date(flightBody.flight.departureDate).toISOString().slice(0, 10)
      : new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    await test("POST /api/bookings creates a booking", async () => {
      // Dynamically pick 2 available seats so repeated runs don't conflict
      const { body: seatsBody } = await req("GET", `/api/flights/${flightId}`);
      const availableSeats = (seatsBody.flight?.seats || [])
        .filter(s => s.status === "available" && s.cabinClass === "Economy")
        .map(s => s.seatNumber);
      if (availableSeats.length < 2) return `need at least 2 available economy seats, got ${availableSeats.length}`;
      const testSeats = [availableSeats[0], availableSeats[1]];
      const { status, body } = await req("POST", "/api/bookings", {
        flightId, travelDate, passengerName: "Test Passenger",
        seatNumbers: testSeats, travelers: 2, cabinClass: "Economy",
        contactEmail: "test@skybook.com", contactPhone: "+91 99999 00000",
      }, authToken);
      if (status !== 201) return `status ${status}: ${JSON.stringify(body)}`;
      if (!body.booking?.pnr) return "no pnr in response";
      bookingPnr = body.booking.pnr;
      bookingId = body.booking.id;
      console.log(`       (PNR: ${bookingPnr})`);
    });

    if (bookingId) {
      await test("POST /api/bookings/:id/cancel cancels booking", async () => {
        const { status, body } = await req("POST", `/api/bookings/${bookingId}/cancel`, {}, authToken);
        if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
        if (!body.ok) return "ok=false";
      });
    }
  }

  // --- Promo Codes ---
  console.log("\n🎟️  Promo Codes (via booking)");
  if (flightId) {
    // Get a fresh available seat (not hardcoded – may be taken from previous runs)
    const { body: flightBody2 } = await req("GET", `/api/flights/${flightId}`);
    const travelDate2 = flightBody2.flight?.departureDate
      ? new Date(flightBody2.flight.departureDate).toISOString().slice(0, 10)
      : new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const availableSeat = flightBody2.flight?.seats?.find(s => s.status === "available" && s.cabinClass === "Economy")?.seatNumber;

    await test("WELCOME promo code applies discount", async () => {
      if (!availableSeat) return "no available seats to test promo (all booked)";
      const { status, body } = await req("POST", "/api/bookings", {
        flightId, travelDate: travelDate2, passengerName: "Promo Test",
        seatNumbers: [availableSeat], travelers: 1,
        contactEmail: "promo@test.com", promoCode: "WELCOME",
      }, authToken);
      if (status !== 201) return `status ${status}: ${JSON.stringify(body)}`;
      if (body.booking.discount <= 0) return `no discount applied: ${JSON.stringify(body.booking)}`;
      console.log(`       (seat: ${availableSeat}, discount: ₹${body.booking.discount})`);
    });
  }

  // --- Notifications ---
  console.log("\n🔔 Notifications");
  await test("GET /api/notifications requires auth", async () => {
    const { status } = await req("GET", "/api/notifications");
    if (status !== 401) return `expected 401, got ${status}`;
  });

  await test("GET /api/notifications returns notifications", async () => {
    const { status, body } = await req("GET", "/api/notifications", null, authToken);
    if (status !== 200) return `status ${status}`;
    if (!Array.isArray(body.notifications)) return "not array";
    console.log(`       (${body.notifications.length} notifications found)`);
  });

  // --- Account Preferences ---
  console.log("\n⚙️  Account Preferences");
  await test("PUT /api/account/preferences saves preferences", async () => {
    const { status, body } = await req("PUT", "/api/account/preferences", { preferences: ["window", "aisle"] }, authToken);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
  });

  await test("GET /api/account/preferences returns saved prefs", async () => {
    const { status, body } = await req("GET", "/api/account/preferences", null, authToken);
    if (status !== 200) return `status ${status}`;
    if (!Array.isArray(body.preferences)) return "not array";
  });

  // --- Admin Dashboard ---
  console.log("\n📊 Admin Dashboard");
  await test("GET /api/admin/dashboard returns stats", async () => {
    const { status, body } = await req("GET", "/api/admin/dashboard", null, adminToken);
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    if (!body.stats) return "no stats";
    console.log(`       (users:${body.stats.totalUsers} flights:${body.stats.totalFlights} bookings:${body.stats.totalBookings})`);
  });

  // --- Newsletter ---
  console.log("\n📰 Newsletter");
  await test("POST /api/newsletter subscribes email", async () => {
    const { status, body } = await req("POST", "/api/newsletter", { email: `news_${Date.now()}@test.com` });
    if (status !== 200) return `status ${status}: ${JSON.stringify(body)}`;
    if (!body.ok) return "ok=false";
  });

  // --- Chat ---
  console.log("\n💬 Chat");
  await test("POST /api/chat responds with reply", async () => {
    const { status, body } = await req("POST", "/api/chat", { message: "promo code" });
    if (status !== 200) return `status ${status}`;
    if (!body.reply) return "no reply";
  });

  // --- Fare Watches ---
  console.log("\n👁️  Fare Watches");
  await test("GET /api/fare-watches requires auth", async () => {
    const { status } = await req("GET", "/api/fare-watches");
    if (status !== 401) return `expected 401, got ${status}`;
  });

  if (flightId && authToken) {
    await test("POST /api/fare-watches creates watch", async () => {
      const { status, body } = await req("POST", "/api/fare-watches", { flightId, targetPrice: 3000 }, authToken);
      if (status === 201 || status === 409) return; // 409 = already watching, ok
      return `status ${status}: ${JSON.stringify(body)}`;
    });
  }

  // --- Travel Planner ---
  console.log("\n🗺️  Travel Planner");
  await test("GET /api/planner/destinations returns origins/destinations", async () => {
    const { status, body } = await req("GET", "/api/planner/destinations");
    if (status !== 200) return `status ${status}`;
    if (!body.origins?.length) return "no origins";
  });

  // --- Summary ---
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ✅ ${pass} passed | ❌ ${fail} failed | 📊 ${pass + fail} total`);
  console.log(`Status: ${fail === 0 ? "🎉 ALL TESTS PASSED" : `⚠️  ${fail} FAILURE(S)`}`);

  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch((e) => { console.error("SUITE ERROR:", e); process.exit(1); });
