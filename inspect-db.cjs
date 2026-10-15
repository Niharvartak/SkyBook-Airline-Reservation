const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'src', 'backend', 'skybook.db');
console.log('DB Path:', DB_PATH);

const fs = require('fs');
if (!fs.existsSync(DB_PATH)) {
  console.error('DATABASE FILE DOES NOT EXIST!');
  process.exit(1);
} else {
  const stat = fs.statSync(DB_PATH);
  console.log('DB File Size:', (stat.size / 1024).toFixed(1), 'KB');
  console.log('DB Last Modified:', stat.mtime.toISOString());
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('FAILED TO OPEN DB:', err.message);
    process.exit(1);
  }
  console.log('\n✅ Database opened successfully\n');
});

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function run() {
  // 1. Show all tables
  console.log('=== TABLE SCHEMAS ===');
  const tables = await all("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name");
  tables.forEach(t => {
    console.log(`\n[TABLE: ${t.name}]`);
    console.log(t.sql);
  });

  // 2. Show indexes
  console.log('\n=== INDEXES ===');
  const indexes = await all("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' ORDER BY tbl_name");
  indexes.forEach(i => {
    console.log(`  ${i.tbl_name}.${i.name}: ${i.sql || '(auto)'}`);
  });

  // 3. Count rows
  console.log('\n=== ROW COUNTS ===');
  for (const t of tables) {
    const count = await all(`SELECT COUNT(*) as cnt FROM "${t.name}"`);
    console.log(`  ${t.name}: ${count[0].cnt} rows`);
  }

  // 4. Sample users
  console.log('\n=== SAMPLE USERS (first 5) ===');
  const users = await all('SELECT id, name, email, createdAt FROM users LIMIT 5');
  users.forEach(u => console.log(`  [${u.id}] ${u.name} <${u.email}> created: ${u.createdAt}`));

  // 5. Sample flights
  console.log('\n=== SAMPLE FLIGHTS (first 5) ===');
  const flights = await all('SELECT id, flightNumber, airline, origin, destination, departureDate, price, status FROM flights LIMIT 5');
  flights.forEach(f => console.log(`  [${f.id}] ${f.flightNumber} | ${f.origin} -> ${f.destination} | ${f.departureDate} | ₹${f.price} | ${f.status}`));

  // 6. Seat status breakdown
  console.log('\n=== SEAT AVAILABILITY BREAKDOWN ===');
  const seatStats = await all('SELECT status, COUNT(*) as cnt FROM seats GROUP BY status');
  seatStats.forEach(s => console.log(`  ${s.status}: ${s.cnt}`));

  // 7. Sample bookings
  console.log('\n=== SAMPLE BOOKINGS (last 5) ===');
  const bookings = await all(`
    SELECT b.id, b.pnr, b.passengerName, b.passengerCount, b.seatNumbers, b.totalPrice, b.status, b.createdAt,
           f.flightNumber, f.origin, f.destination, f.departureDate
    FROM bookings b
    JOIN flights f ON f.id = b.flightId
    ORDER BY b.createdAt DESC LIMIT 5
  `);
  bookings.forEach(b => {
    console.log(`  [${b.id}] PNR:${b.pnr} | ${b.flightNumber} | ${b.origin}->${b.destination} | ${b.departureDate}`);
    console.log(`        Passenger: ${b.passengerName} | Seats: ${b.seatNumbers} | ₹${b.totalPrice} | ${b.status}`);
  });

  // 8. Check for data integrity issues
  console.log('\n=== INTEGRITY CHECKS ===');

  // Bookings referencing non-existent flights
  const orphanBookings = await all('SELECT COUNT(*) as cnt FROM bookings b WHERE NOT EXISTS (SELECT 1 FROM flights f WHERE f.id = b.flightId)');
  console.log(`  Orphan bookings (no flight): ${orphanBookings[0].cnt}`);

  // Seats referencing non-existent flights
  const orphanSeats = await all('SELECT COUNT(*) as cnt FROM seats s WHERE NOT EXISTS (SELECT 1 FROM flights f WHERE f.id = s.flightId)');
  console.log(`  Orphan seats (no flight): ${orphanSeats[0].cnt}`);

  // Booked seats with no booking reference
  const unboundBooked = await all("SELECT COUNT(*) as cnt FROM seats WHERE status = 'booked' AND bookingId IS NULL");
  console.log(`  Booked seats with NULL bookingId: ${unboundBooked[0].cnt}`);

  // Confirmed bookings with all booked seats released
  const missingSeats = await all(`
    SELECT COUNT(*) as cnt FROM bookings b
    WHERE b.status = 'CONFIRMED'
    AND NOT EXISTS (SELECT 1 FROM seats s WHERE s.bookingId = b.id AND s.status = 'booked')
  `);
  console.log(`  Confirmed bookings with no booked seats: ${missingSeats[0].cnt}`);

  // Duplicate PNRs
  const dupPnr = await all('SELECT pnr, COUNT(*) as cnt FROM bookings GROUP BY pnr HAVING cnt > 1');
  console.log(`  Duplicate PNRs: ${dupPnr.length}`);

  // Duplicate emails
  const dupEmail = await all('SELECT email, COUNT(*) as cnt FROM users GROUP BY email HAVING cnt > 1');
  console.log(`  Duplicate user emails: ${dupEmail.length}`);

  // 9. Foreign key pragma
  console.log('\n=== PRAGMA CHECKS ===');
  const fkEnabled = await all('PRAGMA foreign_keys');
  console.log(`  foreign_keys: ${fkEnabled[0]?.foreign_keys || 0} (should be 1 for enforcement)`);
  const journalMode = await all('PRAGMA journal_mode');
  console.log(`  journal_mode: ${journalMode[0]?.journal_mode}`);
  const walMode = await all('PRAGMA wal_checkpoint');
  console.log(`  WAL checkpoint: ${JSON.stringify(walMode[0])}`);

  db.close();
  console.log('\n✅ Database inspection complete\n');
}

run().catch(e => {
  console.error('INSPECTION FAILED:', e.message);
  db.close();
});
