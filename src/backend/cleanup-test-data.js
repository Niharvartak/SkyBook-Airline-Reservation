/**
 * Removes clearly-labelled QA/test accounts and their dependent rows.
 * Genuine users (admin@skybook.com, demo@skybook.com, etc.) are never matched.
 *
 * Usage: node cleanup-test-data.js --dry-run   (default: list what would go)
 *        node cleanup-test-data.js --apply     (delete)
 */
const path = require("path");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config();

const APPLY = process.argv.includes("--apply");
const PATTERNS = ["test\\_%@skybook.com", "qa.journey.%@skybook-test.com", "qa.browser.%@skybook-test.com", "e2e\\_%@test.com", "test\\_%@test.com"];

(async () => {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "skybook",
  });
  const q = async (s, a = []) => (await pool.query(s, a))[0];

  const where = PATTERNS.map(() => "email LIKE ?").join(" OR ");
  const users = await q(`SELECT id, email FROM users WHERE ${where}`, PATTERNS);
  console.log(`Matched ${users.length} test user(s):`);
  users.forEach(u => console.log(`  #${u.id} ${u.email}`));

  if (users.length) {
    const ids = users.map(u => u.id);
    const bookings = await q(`SELECT COUNT(*) c FROM bookings WHERE userId IN (?)`, [ids]);
    const confirmed = await q(`SELECT COUNT(*) c FROM bookings WHERE userId IN (?) AND status='CONFIRMED'`, [ids]);
    console.log(`Dependent bookings: ${bookings[0].c} (${confirmed[0].c} confirmed)`);
    const perFlight = await q(
      `SELECT b.flightId, COUNT(*) c FROM seats s JOIN bookings b ON b.id = s.bookingId
       WHERE b.userId IN (?) AND b.status='CONFIRMED' GROUP BY b.flightId`, [ids]);
    console.log(`Booked seats to release across ${perFlight.length} flight(s)`);
    if (APPLY) {
      // 1. release seats held by confirmed test bookings, 2. restore flight counters
      await q(`UPDATE seats s JOIN bookings b ON b.id = s.bookingId
               SET s.status='available', s.bookingId=NULL WHERE b.userId IN (?)`, [ids]);
      for (const r of perFlight) await q(`UPDATE flights SET availableSeats = availableSeats + ? WHERE id = ?`, [r.c, r.flightId]);
      // 3. remove bookings, then users (notifications/fare_watches/admins/prefs cascade)
      await q(`DELETE FROM bookings WHERE userId IN (?)`, [ids]);
      await q(`DELETE FROM users WHERE id IN (?)`, [ids]);
      console.log("Deleted test users and their dependent rows.");
    } else {
      console.log("Dry run only. Re-run with --apply to delete.");
    }
  }
  // Deactivated throwaway flights created by the automated suites (cascade removes seats).
  const testFlights = await q(`SELECT id, flightNumber FROM flights WHERE isActive = 0 AND (flightNumber LIKE 'SK-E2E%' OR flightNumber LIKE 'SK-QA%')`);
  console.log(`Matched ${testFlights.length} deactivated test flight(s).`);
  if (APPLY && testFlights.length) {
    await q(`DELETE FROM flights WHERE id IN (?)`, [testFlights.map(f => f.id)]);
    console.log("Deleted test flights.");
  }

  const countsRows = await q("SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM bookings) b, (SELECT COUNT(*) FROM flights) f");
  const counts = countsRows[0];
  console.log(`Remaining: users=${counts.u} bookings=${counts.b} flights=${counts.f}`);
  await pool.end();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
