/**
 * SkyBook database integrity check (read-only).
 * Reports duplicates, orphans, invalid airport codes, and seat-inventory drift.
 * Usage: node integrity-check.js
 */
const path = require("path");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "skybook",
    decimalNumbers: true,
  });

  const issues = [];
  const note = (label, rows) => {
    if (rows.length) issues.push({ label, count: rows.length, sample: rows.slice(0, 5) });
    console.log(`${rows.length ? "❌" : "✅"} ${label}: ${rows.length}`);
    if (rows.length) console.log("   sample:", JSON.stringify(rows.slice(0, 5)));
  };
  const q = async (sql, p = []) => (await pool.query(sql, p))[0];

  // 1. airports
  const airportRows = await q("SELECT COUNT(*) c FROM airports");
  const airportCount = airportRows[0];
  console.log(`\nairports: ${airportCount.c}`);
  note("duplicate airport codes", await q("SELECT code, COUNT(*) c FROM airports GROUP BY code HAVING c > 1"));
  note("airports with empty city/country", await q("SELECT code FROM airports WHERE city='' OR country='' OR airportName=''"));

  // 2. invalid origin/destination codes (flights store 'City (CODE)')
  const codes = await q("SELECT code FROM airports");
  const valid = new Set(codes.map(r => r.code));
  const flightRoutes = await q("SELECT DISTINCT origin, destination FROM flights");
  const extract = s => (String(s).match(/\(([A-Z]{3})\)/) || [])[1];
  const badRoutes = flightRoutes.filter(r => !valid.has(extract(r.origin)) || !valid.has(extract(r.destination)));
  note("flight routes with unknown airport code", badRoutes);

  // 3. duplicate flights
  note("duplicate flightNumber+date", await q("SELECT flightNumber, departureDate, COUNT(*) c FROM flights GROUP BY flightNumber, departureDate HAVING c > 1"));
  note("duplicate flightNumber+date+origin+dest", await q("SELECT flightNumber, departureDate, origin, destination, COUNT(*) c FROM flights GROUP BY flightNumber, departureDate, origin, destination HAVING c > 1"));

  // 4. orphaned rows
  note("seats with missing flight", await q("SELECT s.id FROM seats s LEFT JOIN flights f ON f.id=s.flightId WHERE f.id IS NULL LIMIT 100"));
  note("bookings with missing flight", await q("SELECT b.id FROM bookings b LEFT JOIN flights f ON f.id=b.flightId WHERE f.id IS NULL LIMIT 100"));
  note("bookings with missing user", await q("SELECT b.id FROM bookings b LEFT JOIN users u ON u.id=b.userId WHERE u.id IS NULL LIMIT 100"));
  note("admins with missing user", await q("SELECT a.id FROM admins a LEFT JOIN users u ON u.id=a.userId WHERE u.id IS NULL"));
  note("notifications with missing user", await q("SELECT n.id FROM notifications n LEFT JOIN users u ON u.id=n.userId WHERE u.id IS NULL LIMIT 100"));
  note("fare_watches with missing user/flight", await q("SELECT fw.id FROM fare_watches fw LEFT JOIN users u ON u.id=fw.userId LEFT JOIN flights f ON f.id=fw.flightId WHERE u.id IS NULL OR f.id IS NULL LIMIT 100"));
  note("fare_watch_snapshots with missing watch", await q("SELECT s.id FROM fare_watch_snapshots s LEFT JOIN fare_watches w ON w.id=s.fareWatchId WHERE w.id IS NULL LIMIT 100"));
  note("account_preferences with missing user", await q("SELECT p.userId FROM account_preferences p LEFT JOIN users u ON u.id=p.userId WHERE u.id IS NULL"));

  // 5. seat inventory drift
  note("duplicate seat rows per flight+date+seat", await q("SELECT flightId, travelDate, seatNumber, COUNT(*) c FROM seats GROUP BY flightId, travelDate, seatNumber HAVING c > 1 LIMIT 100"));
  // Seat-date mismatch is checked with an explicit count so a LIMIT cannot hide the total.
  const [seatDateMismatch] = await q(`
    SELECT COUNT(*) c FROM seats s JOIN flights f ON f.id=s.flightId
    WHERE DATE(s.travelDate) <> DATE(f.departureDate)`);
  if (Number(seatDateMismatch.c) > 0) {
    issues.push({ label: "seats travelDate != flight departureDate", count: Number(seatDateMismatch.c) });
    console.log(`❌ seats travelDate != flight departureDate: ${seatDateMismatch.c}`);
    console.log("   sample:", JSON.stringify(await q(`
      SELECT s.id, s.flightId, s.travelDate, f.departureDate
      FROM seats s JOIN flights f ON f.id=s.flightId
      WHERE DATE(s.travelDate) <> DATE(f.departureDate) LIMIT 5`)));
  } else {
    console.log("✅ seats travelDate != flight departureDate: 0");
  }
  note("flights where availableSeats != live available seat count", await q(`
    SELECT f.id, f.flightNumber, f.departureDate, f.availableSeats,
           (SELECT COUNT(*) FROM seats s WHERE s.flightId=f.id AND DATE(s.travelDate)=DATE(f.departureDate) AND s.status='available') live
    FROM flights f
    WHERE (SELECT COUNT(*) FROM seats s WHERE s.flightId=f.id AND DATE(s.travelDate)=DATE(f.departureDate)) > 0
    HAVING f.availableSeats <> live
    LIMIT 100`));
  const noSeatRows = await q(`
    SELECT COUNT(*) c FROM flights f
    WHERE (SELECT COUNT(*) FROM seats s WHERE s.flightId=f.id) = 0`);
  console.log(`\u2139\ufe0f  flights with no seat rows yet (lazily created, search uses the advertised count): ${noSeatRows[0].c}`);
  note("booked seats without bookingId", await q("SELECT id FROM seats WHERE status='booked' AND bookingId IS NULL LIMIT 100"));
  note("booked seats whose booking is cancelled/missing", await q(`
    SELECT s.id FROM seats s LEFT JOIN bookings b ON b.id=s.bookingId
    WHERE s.status='booked' AND (b.id IS NULL OR b.status='CANCELLED') LIMIT 100`));
  note("available seats still linked to a booking", await q("SELECT id FROM seats WHERE status='available' AND bookingId IS NOT NULL LIMIT 100"));
  note("bookings whose seat count != passengerCount", await q(`
    SELECT b.id, b.pnr, b.passengerCount, JSON_LENGTH(b.seatNumbers) seatCount
    FROM bookings b WHERE JSON_VALID(b.seatNumbers) AND JSON_LENGTH(b.seatNumbers) <> b.passengerCount LIMIT 100`));
  note("confirmed bookings with zero seats", await q("SELECT id, pnr FROM bookings WHERE status='CONFIRMED' AND (seatNumbers IS NULL OR seatNumbers='[]') LIMIT 100"));

  // 6. flight data sanity
  note("flights with negative/zero price", await q("SELECT id, flightNumber, price FROM flights WHERE price <= 0 LIMIT 100"));
  note("flights with negative availableSeats", await q("SELECT id, flightNumber, availableSeats FROM flights WHERE availableSeats < 0 LIMIT 100"));
  note("inactive flights with CONFIRMED bookings", await q("SELECT DISTINCT f.id, f.flightNumber FROM flights f JOIN bookings b ON b.flightId=f.id WHERE f.isActive=0 AND b.status='CONFIRMED' LIMIT 100"));
  const counts = (await q("SELECT (SELECT COUNT(*) FROM flights) flights, (SELECT COUNT(*) FROM seats) seats, (SELECT COUNT(*) FROM bookings) bookings, (SELECT COUNT(*) FROM users) users"))[0];
  console.log("\ncounts:", JSON.stringify(counts));

  await pool.end();
  console.log(`\n==== ${issues.length} issue group(s) found ====`);
  process.exit(0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
