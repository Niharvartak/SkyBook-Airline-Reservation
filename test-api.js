// Test script for SkyBook API endpoints
const BASE_URL = process.env.TEST_URL || 'http://localhost:5000';
const ORIGIN = 'http://localhost:5173';

console.log(`=== Testing SkyBook API at ${BASE_URL} (Simulated Origin: ${ORIGIN}) ===\n`);

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  PASS: ${testName} ${detail ? '(' + detail + ')' : ''}`);
    testsPassed++;
  } else {
    console.error(`  FAIL: ${testName} ${detail ? '(' + detail + ')' : ''}`);
    testsFailed++;
  }
}

async function runTests() {
  // 1. CORS Preflight
  console.log('[1] Testing CORS Preflight');
  const corsRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'OPTIONS',
    headers: {
      'Origin': ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, Authorization',
    },
  });
  const allowOrigin = corsRes.headers.get('access-control-allow-origin');
  const allowMethods = corsRes.headers.get('access-control-allow-methods');
  const allowHeaders = corsRes.headers.get('access-control-allow-headers');
  assert(corsRes.status === 200 || corsRes.status === 204, 'OPTIONS /api/login status', `status: ${corsRes.status}`);
  assert(allowOrigin === ORIGIN || allowOrigin === '*', 'CORS Allow-Origin header', `got: ${allowOrigin}`);
  assert(allowMethods && allowMethods.includes('POST'), 'CORS Allow-Methods header', `got: ${allowMethods}`);

  // 2. Health check
  console.log('\n[2] Testing Health Endpoint');
  const healthRes = await fetch(`${BASE_URL}/api/health`, { headers: { 'Origin': ORIGIN } });
  const healthData = await healthRes.json();
  assert(healthRes.status === 200, 'GET /api/health status 200');
  assert(healthData.ok === true, 'Health check ok: true');

  // 3. Login with Demo User
  console.log('\n[3] Testing Login Endpoint');
  const badLoginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
    body: JSON.stringify({ email: 'demo@skybook.com', password: 'wrongpassword' }),
  });
  assert(badLoginRes.status === 401, 'POST /api/login with bad password returns 401');

  const loginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
    body: JSON.stringify({ email: 'demo@skybook.com', password: 'password123' }),
  });
  const loginData = await loginRes.json();
  assert(loginRes.status === 200, 'POST /api/login with valid demo returns 200');
  assert(typeof loginData.token === 'string' && loginData.token.length > 20, 'Login response contains JWT token');
  assert(loginData.user && loginData.user.email === 'demo@skybook.com', 'Login response contains user object');
  const authToken = loginData.token;

  // 4. Registration of a new user
  console.log('\n[4] Testing Registration Endpoint');
  const testEmail = `tester_${Date.now()}@skybook.com`;
  const regRes = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
    body: JSON.stringify({ name: 'Automated Tester', email: testEmail, password: 'password123' }),
  });
  const regData = await regRes.json();
  assert(regRes.status === 201, 'POST /api/register returns 201 Created');
  assert(typeof regData.token === 'string', 'Register response contains JWT token');
  assert(regData.user?.email === testEmail, 'Register response contains user object');

  // 5. User profile (/api/me)
  console.log('\n[5] Testing Auth Protected /api/me Endpoint');
  const meUnauthorized = await fetch(`${BASE_URL}/api/me`, { headers: { 'Origin': ORIGIN } });
  assert(meUnauthorized.status === 401, 'GET /api/me without token returns 401');

  const meRes = await fetch(`${BASE_URL}/api/me`, {
    headers: { 'Authorization': `Bearer ${authToken}`, 'Origin': ORIGIN },
  });
  const meData = await meRes.json();
  assert(meRes.status === 200, 'GET /api/me with Bearer token returns 200');
  assert(meData.user && meData.user.email === 'demo@skybook.com', 'GET /api/me returns correct user');

  // 6. Flight Search
  console.log('\n[6] Testing Flight Search Endpoint');
  const allFlightsRes = await fetch(`${BASE_URL}/api/flights/search`, { headers: { 'Origin': ORIGIN } });
  const allFlightsData = await allFlightsRes.json();
  assert(allFlightsRes.status === 200, 'GET /api/flights/search returns 200');
  assert(Array.isArray(allFlightsData.flights) && allFlightsData.flights.length > 0, 'Found flights in database', `count: ${allFlightsData.flights?.length}`);

  // Search Mumbai -> Delhi
  const bomDelRes = await fetch(`${BASE_URL}/api/flights/search?from=Mumbai&to=Delhi`, { headers: { 'Origin': ORIGIN } });
  const bomDelData = await bomDelRes.json();
  assert(bomDelRes.status === 200, 'GET /api/flights/search?from=Mumbai&to=Delhi returns 200');
  assert(bomDelData.flights.length > 0, 'Found Mumbai to Delhi flights', `count: ${bomDelData.flights.length}`);
  assert(bomDelData.flights.every(f => f.origin.includes('BOM') && f.destination.includes('DEL')), 'All results match route BOM -> DEL');

  // Search by code BOM -> DEL
  const codeRes = await fetch(`${BASE_URL}/api/flights/search?from=BOM&to=DEL`, { headers: { 'Origin': ORIGIN } });
  const codeData = await codeRes.json();
  assert(codeData.flights.length > 0, 'Search by airport code (BOM -> DEL) returns flights');

  // Search Goa -> Mumbai
  const goiBomRes = await fetch(`${BASE_URL}/api/flights/search?from=Goa&to=Mumbai`, { headers: { 'Origin': ORIGIN } });
  const goiBomData = await goiBomRes.json();
  assert(goiBomData.flights.length > 0, 'Search Goa -> Mumbai returns return flights', `count: ${goiBomData.flights.length}`);

  // Search International: Dubai -> Delhi
  const dxbDelRes = await fetch(`${BASE_URL}/api/flights/search?from=Dubai&to=Delhi`, { headers: { 'Origin': ORIGIN } });
  const dxbDelData = await dxbDelRes.json();
  assert(dxbDelData.flights.length > 0, 'Search Dubai -> Delhi returns international flights', `count: ${dxbDelData.flights.length}`);

  // 7. Flight Status
  console.log('\n[7] Testing Flight Status Endpoint');
  const statusRes = await fetch(`${BASE_URL}/api/flights/status?flightNumber=SK-101`, { headers: { 'Origin': ORIGIN } });
  const statusData = await statusRes.json();
  assert(statusRes.status === 200, 'GET /api/flights/status?flightNumber=SK-101 returns 200');
  assert(statusData.flight && statusData.flight.flightNumber === 'SK-101', 'Flight status returns SK-101 data');

  // Status search with just digits
  const digitStatusRes = await fetch(`${BASE_URL}/api/flights/status?flightNumber=101`, { headers: { 'Origin': ORIGIN } });
  const digitStatusData = await digitStatusRes.json();
  assert(digitStatusRes.status === 200, 'GET /api/flights/status?flightNumber=101 resolves to SK-101');

  // Status not found
  const notFoundStatusRes = await fetch(`${BASE_URL}/api/flights/status?flightNumber=INVALID999`, { headers: { 'Origin': ORIGIN } });
  assert(notFoundStatusRes.status === 404, 'GET /api/flights/status with non-existent flight returns 404');

  // 8. Flight Details & Seat Map
  console.log('\n[8] Testing Flight Details & Seat Map');
  const targetFlight = bomDelData.flights[0];
  const flightDetailsRes = await fetch(`${BASE_URL}/api/flights/${targetFlight.id}`, { headers: { 'Origin': ORIGIN } });
  const flightDetailsData = await flightDetailsRes.json();
  assert(flightDetailsRes.status === 200, `GET /api/flights/${targetFlight.id} returns 200`);
  assert(flightDetailsData.flight && Array.isArray(flightDetailsData.flight.seats), 'Flight details includes seats array');
  const seats = flightDetailsData.flight.seats;
  assert(seats.length === 32, 'Flight has complete 32-seat map (8 rows x 4 seats)', `got: ${seats.length}`);
  const sampleSeat = seats[0];
  assert(
    sampleSeat.seatNumber &&
    sampleSeat.status &&
    typeof sampleSeat.row === 'number' &&
    typeof sampleSeat.col === 'string' &&
    typeof sampleSeat.isWindow === 'boolean' &&
    typeof sampleSeat.isAisle === 'boolean' &&
    typeof sampleSeat.cabinClass === 'string',
    'Seat object has all required properties for UI seat map'
  );

  // 9. Booking Creation
  console.log('\n[9] Testing Booking Creation');
  const availableSeats = seats.filter(s => s.status === 'available').slice(0, 2).map(s => s.seatNumber);
  assert(availableSeats.length === 2, 'Found 2 available seats for booking test', `seats: ${availableSeats.join(', ')}`);

  const bookingPayload = {
    flightId: targetFlight.id,
    travelDate: targetFlight.departureDate,
    passengerName: 'Aarav Sharma, Priya Sharma',
    passengers: [
      { title: 'Mr', name: 'Aarav Sharma', gender: 'Adult' },
      { title: 'Mrs', name: 'Priya Sharma', gender: 'Adult' },
    ],
    contactEmail: 'aarav@example.com',
    contactPhone: '+91 98765 43210',
    seatNumbers: availableSeats,
    travelers: 2,
    promoCode: 'FLYINDIA',
  };

  const bookingRes = await fetch(`${BASE_URL}/api/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'Origin': ORIGIN,
    },
    body: JSON.stringify(bookingPayload),
  });
  const bookingData = await bookingRes.json();
  assert(bookingRes.status === 201, 'POST /api/bookings returns 201 Created', `status: ${bookingRes.status}`);
  assert(bookingData.booking && typeof bookingData.booking.pnr === 'string', 'Booking returned with valid PNR', `PNR: ${bookingData.booking?.pnr}`);
  assert(bookingData.booking.discount > 0, 'Promo code discount successfully applied', `discount: ₹${bookingData.booking?.discount}`);
  const createdBookingId = bookingData.booking.id;
  const createdPnr = bookingData.booking.pnr;

  // 10. Conflict Check (Duplicate Seat Booking)
  console.log('\n[10] Testing Conflict / Duplicate Seat Booking');
  const duplicateBookingRes = await fetch(`${BASE_URL}/api/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      'Origin': ORIGIN,
    },
    body: JSON.stringify(bookingPayload),
  });
  assert(duplicateBookingRes.status === 409 || duplicateBookingRes.status === 400, 'Duplicate seat booking returns conflict status (409/400)', `status: ${duplicateBookingRes.status}`);

  // 11. My Bookings
  console.log('\n[11] Testing My Bookings');
  const myBookingsRes = await fetch(`${BASE_URL}/api/bookings`, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Origin': ORIGIN,
    },
  });
  const myBookingsData = await myBookingsRes.json();
  assert(myBookingsRes.status === 200, 'GET /api/bookings returns 200');
  assert(Array.isArray(myBookingsData.bookings), 'Response contains bookings array');
  const foundBooking = myBookingsData.bookings.find(b => b.id === createdBookingId);
  assert(Boolean(foundBooking), 'Newly created booking found in user bookings list');
  assert(Array.isArray(foundBooking?.seatNumbers) && foundBooking.seatNumbers.length === 2, 'Seat numbers are parsed as array');

  // 12. PNR Lookup
  console.log('\n[12] Testing PNR Lookup');
  const pnrRes = await fetch(`${BASE_URL}/api/bookings/${createdPnr}`, { headers: { 'Origin': ORIGIN } });
  const pnrData = await pnrRes.json();
  assert(pnrRes.status === 200, `GET /api/bookings/${createdPnr} returns 200`);
  assert(pnrData.booking && pnrData.booking.pnr === createdPnr, 'PNR lookup returns correct booking details');

  // 13. Booking Cancellation
  console.log('\n[13] Testing Booking Cancellation');
  const cancelRes = await fetch(`${BASE_URL}/api/bookings/${createdBookingId}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Origin': ORIGIN,
    },
  });
  const cancelData = await cancelRes.json();
  assert(cancelRes.status === 200, 'POST /api/bookings/:id/cancel returns 200');
  assert(cancelData.booking?.status === 'CANCELLED', 'Booking status changed to CANCELLED');

  // Verify seats were released back to available
  const updatedFlightRes = await fetch(`${BASE_URL}/api/flights/${targetFlight.id}`, { headers: { 'Origin': ORIGIN } });
  const updatedFlightData = await updatedFlightRes.json();
  const seatsReleased = updatedFlightData.flight.seats
    .filter(s => availableSeats.includes(s.seatNumber))
    .every(s => s.status === 'available');
  assert(seatsReleased, 'Cancelled seats were successfully released back to available status');

  // 14. AI Chat
  console.log('\n[14] Testing AI Chat Concierge');
  const chatRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
    body: JSON.stringify({ message: 'What is your cancellation policy?' }),
  });
  const chatData = await chatRes.json();
  assert(chatRes.status === 200, 'POST /api/chat returns 200');
  assert(typeof chatData.reply === 'string' && chatData.reply.length > 10, 'AI returns helpful text response');

  // 15. Newsletter
  console.log('\n[15] Testing Newsletter Subscription');
  const newsEmail = `newsletter_${Date.now()}@skybook.com`;
  const newsRes = await fetch(`${BASE_URL}/api/newsletter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
    body: JSON.stringify({ email: newsEmail }),
  });
  assert(newsRes.status === 201, 'POST /api/newsletter returns 201 Created');

  // Duplicate email
  const dupNewsRes = await fetch(`${BASE_URL}/api/newsletter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': ORIGIN },
    body: JSON.stringify({ email: newsEmail }),
  });
  assert(dupNewsRes.status === 409, 'Duplicate newsletter subscription returns 409 Conflict');

  console.log(`\n================================`);
  console.log(`Test Summary: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`================================\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
