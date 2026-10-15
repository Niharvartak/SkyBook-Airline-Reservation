/**
 * SkyBook Flight Database Migration
 * Adds new destinations, routes, and future flight data.
 * Run: node migrate-flights.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'src/backend/skybook.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// 1. Add new columns + tables (safe: IF NOT EXISTS / ALTER OR IGNORE)
// ---------------------------------------------------------------------------

const execSafe = (sql) => {
  try { db.exec(sql); } catch (e) { console.warn('SKIP:', e.message.slice(0, 80)); }
};

// Add `availableSeats` column to flights if missing
execSafe(`ALTER TABLE flights ADD COLUMN availableSeats INTEGER DEFAULT 32`);
// Add `isActive` column to flights if missing
execSafe(`ALTER TABLE flights ADD COLUMN isActive INTEGER DEFAULT 1`);

// Create new tables if needed
execSafe(`
  CREATE TABLE IF NOT EXISTS fare_watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    flightId INTEGER NOT NULL,
    targetPrice REAL,
    currentPrice REAL NOT NULL,
    previousPrice REAL,
    priceChange REAL DEFAULT 0,
    alertTriggered INTEGER DEFAULT 0,
    trend TEXT DEFAULT 'stable',
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id),
    FOREIGN KEY(flightId) REFERENCES flights(id)
  )
`);

execSafe(`
  CREATE TABLE IF NOT EXISTS fare_watch_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fareWatchId INTEGER NOT NULL,
    price REAL NOT NULL,
    observedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(fareWatchId) REFERENCES fare_watches(id)
  )
`);

execSafe(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    read INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  )
`);

execSafe(`
  CREATE TABLE IF NOT EXISTS account_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL UNIQUE,
    preferences TEXT DEFAULT '[]',
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES users(id)
  )
`);

execSafe(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL UNIQUE,
    FOREIGN KEY(userId) REFERENCES users(id)
  )
`);

// ---------------------------------------------------------------------------
// 2. Ensure admin user exists
// ---------------------------------------------------------------------------

const existingAdmin = db.prepare(`SELECT id FROM users WHERE email = 'admin@skybook.com'`).get();
let adminUserId;
if (!existingAdmin) {
  // bcrypt hash of "Admin@123" (pre-computed, rounds=10)
  const ADMIN_HASH = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // password
  const result = db.prepare(`INSERT INTO users (name, email, passwordHash) VALUES (?, ?, ?)`).run('SkyBook Admin', 'admin@skybook.com', ADMIN_HASH);
  adminUserId = result.lastInsertRowid;
  console.log('✅ Created admin user: admin@skybook.com / password');
} else {
  adminUserId = existingAdmin.id;
  console.log('ℹ️  Admin user already exists');
}

// Ensure admin record
execSafe(`INSERT OR IGNORE INTO admins (userId) VALUES (${adminUserId})`);

// ---------------------------------------------------------------------------
// 3. Ensure demo user exists
// ---------------------------------------------------------------------------

const existingDemo = db.prepare(`SELECT id FROM users WHERE email = 'demo@skybook.com'`).get();
if (!existingDemo) {
  const DEMO_HASH = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // password
  db.prepare(`INSERT INTO users (name, email, passwordHash) VALUES (?, ?, ?)`).run('Demo Traveler', 'demo@skybook.com', DEMO_HASH);
  console.log('✅ Created demo user: demo@skybook.com / password');
}

// ---------------------------------------------------------------------------
// 4. Add future flights for new destinations
// ---------------------------------------------------------------------------

const routes = [
  // Domestic India routes
  { fn: 'SK-101', airline: 'SkyBook Airlines',   from: 'Mumbai (BOM)',     to: 'Delhi (DEL)',      dep: '08:00 AM', arr: '10:15 AM', price: 4999 },
  { fn: 'SK-102', airline: 'SkyBook Express',     from: 'Mumbai (BOM)',     to: 'Delhi (DEL)',      dep: '01:30 PM', arr: '03:45 PM', price: 5499 },
  { fn: 'SK-201', airline: 'SkyBook Airlines',    from: 'Delhi (DEL)',      to: 'Mumbai (BOM)',     dep: '07:00 AM', arr: '09:20 AM', price: 4500 },
  { fn: 'SK-202', airline: 'SkyBook Airlines',    from: 'Delhi (DEL)',      to: 'Goa (GOI)',        dep: '11:30 AM', arr: '02:00 PM', price: 3499 },
  { fn: 'SK-203', airline: 'SkyBook Express',     from: 'Delhi (DEL)',      to: 'Bengaluru (BLR)',  dep: '06:00 AM', arr: '09:00 AM', price: 5200 },
  { fn: 'SK-301', airline: 'SkyBook Airlines',    from: 'Mumbai (BOM)',     to: 'Dubai (DXB)',      dep: '09:00 PM', arr: '11:30 PM', price: 12500 },
  { fn: 'SK-302', airline: 'SkyBook International', from: 'Mumbai (BOM)',   to: 'Singapore (SIN)',  dep: '10:00 PM', arr: '06:30 AM', price: 18000 },
  { fn: 'SK-303', airline: 'SkyBook Airlines',    from: 'Mumbai (BOM)',     to: 'Goa (GOI)',        dep: '07:30 AM', arr: '08:45 AM', price: 2999 },
  { fn: 'SK-304', airline: 'SkyBook Airlines',    from: 'Mumbai (BOM)',     to: 'Bengaluru (BLR)',  dep: '06:00 AM', arr: '07:30 AM', price: 3800 },
  { fn: 'SK-305', airline: 'SkyBook International', from: 'Mumbai (BOM)',   to: 'Bangkok (BKK)',    dep: '11:00 PM', arr: '05:30 AM', price: 15500 },
  { fn: 'SK-401', airline: 'SkyBook Airlines',    from: 'Bengaluru (BLR)',  to: 'Mumbai (BOM)',     dep: '07:00 AM', arr: '08:30 AM', price: 3600 },
  { fn: 'SK-402', airline: 'SkyBook Airlines',    from: 'Bengaluru (BLR)',  to: 'Delhi (DEL)',      dep: '09:00 AM', arr: '12:00 PM', price: 5400 },
  { fn: 'SK-403', airline: 'SkyBook Express',     from: 'Bengaluru (BLR)',  to: 'Hyderabad (HYD)', dep: '01:00 PM', arr: '02:15 PM', price: 2200 },
  { fn: 'SK-501', airline: 'SkyBook Airlines',    from: 'Goa (GOI)',        to: 'Mumbai (BOM)',     dep: '01:15 PM', arr: '02:45 PM', price: 3100 },
  { fn: 'SK-502', airline: 'SkyBook Airlines',    from: 'Goa (GOI)',        to: 'Delhi (DEL)',      dep: '10:30 AM', arr: '01:30 PM', price: 4200 },
  { fn: 'SK-601', airline: 'SkyBook Airlines',    from: 'Hyderabad (HYD)', to: 'Mumbai (BOM)',     dep: '08:00 AM', arr: '09:30 AM', price: 3500 },
  { fn: 'SK-602', airline: 'SkyBook Airlines',    from: 'Hyderabad (HYD)', to: 'Delhi (DEL)',      dep: '10:00 AM', arr: '12:30 PM', price: 4800 },
  { fn: 'SK-603', airline: 'SkyBook Airlines',    from: 'Hyderabad (HYD)', to: 'Bengaluru (BLR)',  dep: '04:00 PM', arr: '05:15 PM', price: 2100 },
  { fn: 'SK-701', airline: 'SkyBook Airlines',    from: 'Chennai (MAA)',   to: 'Mumbai (BOM)',     dep: '07:30 AM', arr: '09:15 AM', price: 3700 },
  { fn: 'SK-702', airline: 'SkyBook Airlines',    from: 'Chennai (MAA)',   to: 'Delhi (DEL)',      dep: '09:00 AM', arr: '12:00 PM', price: 5100 },
  { fn: 'SK-703', airline: 'SkyBook Express',     from: 'Chennai (MAA)',   to: 'Bengaluru (BLR)',  dep: '12:00 PM', arr: '01:15 PM', price: 1900 },
  { fn: 'SK-801', airline: 'SkyBook Airlines',    from: 'Kochi (COK)',     to: 'Mumbai (BOM)',     dep: '06:30 AM', arr: '08:30 AM', price: 4100 },
  { fn: 'SK-802', airline: 'SkyBook Airlines',    from: 'Kochi (COK)',     to: 'Delhi (DEL)',      dep: '11:00 AM', arr: '02:00 PM', price: 5600 },
  { fn: 'SK-803', airline: 'SkyBook International', from: 'Kochi (COK)',   to: 'Dubai (DXB)',      dep: '08:00 PM', arr: '10:00 PM', price: 11000 },
  { fn: 'SK-901', airline: 'SkyBook Airlines',    from: 'Pune (PNQ)',      to: 'Delhi (DEL)',      dep: '07:00 AM', arr: '09:30 AM', price: 4600 },
  { fn: 'SK-902', airline: 'SkyBook Airlines',    from: 'Pune (PNQ)',      to: 'Bengaluru (BLR)',  dep: '01:00 PM', arr: '02:30 PM', price: 2900 },
  { fn: 'SK-1001', airline: 'SkyBook Airlines',   from: 'Kolkata (CCU)',   to: 'Mumbai (BOM)',     dep: '06:00 AM', arr: '09:00 AM', price: 5500 },
  { fn: 'SK-1002', airline: 'SkyBook Airlines',   from: 'Kolkata (CCU)',   to: 'Delhi (DEL)',      dep: '09:00 AM', arr: '11:30 AM', price: 4300 },
  { fn: 'SK-1003', airline: 'SkyBook Express',    from: 'Kolkata (CCU)',   to: 'Bengaluru (BLR)',  dep: '03:00 PM', arr: '06:00 PM', price: 5800 },
  { fn: 'SK-1101', airline: 'SkyBook Airlines',   from: 'Ahmedabad (AMD)', to: 'Mumbai (BOM)',     dep: '08:00 AM', arr: '09:15 AM', price: 2800 },
  { fn: 'SK-1102', airline: 'SkyBook Airlines',   from: 'Ahmedabad (AMD)', to: 'Delhi (DEL)',      dep: '11:00 AM', arr: '01:00 PM', price: 4200 },
  { fn: 'SK-1201', airline: 'SkyBook Airlines',   from: 'Jaipur (JAI)',    to: 'Mumbai (BOM)',     dep: '09:00 AM', arr: '11:15 AM', price: 4100 },
  { fn: 'SK-1202', airline: 'SkyBook Airlines',   from: 'Jaipur (JAI)',    to: 'Delhi (DEL)',      dep: '12:00 PM', arr: '01:00 PM', price: 1800 },
  { fn: 'SK-1301', airline: 'SkyBook International', from: 'Delhi (DEL)',  to: 'Dubai (DXB)',      dep: '02:00 AM', arr: '05:00 AM', price: 13000 },
  { fn: 'SK-1302', airline: 'SkyBook International', from: 'Delhi (DEL)',  to: 'Singapore (SIN)',  dep: '11:30 PM', arr: '07:00 AM', price: 19500 },
  { fn: 'SK-1303', airline: 'SkyBook International', from: 'Delhi (DEL)',  to: 'London (LHR)',     dep: '09:00 PM', arr: '02:00 AM', price: 45000 },
  { fn: 'SK-1304', airline: 'SkyBook International', from: 'Delhi (DEL)',  to: 'Kuala Lumpur (KUL)', dep: '06:00 AM', arr: '12:30 PM', price: 16500 },
  { fn: 'SK-1401', airline: 'SkyBook International', from: 'Mumbai (BOM)', to: 'London (LHR)',     dep: '10:30 PM', arr: '04:00 AM', price: 48000 },
  { fn: 'SK-1402', airline: 'SkyBook International', from: 'Mumbai (BOM)', to: 'New York (JFK)',   dep: '01:30 AM', arr: '09:00 AM', price: 62000 },
  { fn: 'SK-1403', airline: 'SkyBook International', from: 'Mumbai (BOM)', to: 'Paris (CDG)',      dep: '11:00 PM', arr: '06:30 AM', price: 52000 },
  { fn: 'SK-1501', airline: 'SkyBook International', from: 'Dubai (DXB)',  to: 'Mumbai (BOM)',     dep: '07:00 AM', arr: '11:30 AM', price: 11500 },
  { fn: 'SK-1502', airline: 'SkyBook International', from: 'Dubai (DXB)',  to: 'Delhi (DEL)',      dep: '10:00 AM', arr: '02:30 PM', price: 12000 },
  { fn: 'SK-1601', airline: 'SkyBook International', from: 'Singapore (SIN)', to: 'Mumbai (BOM)', dep: '08:00 AM', arr: '11:30 AM', price: 17000 },
  { fn: 'SK-1602', airline: 'SkyBook International', from: 'Singapore (SIN)', to: 'Delhi (DEL)',  dep: '01:00 PM', arr: '05:30 PM', price: 18500 },
  // Lucknow, Srinagar, Varanasi
  { fn: 'SK-1701', airline: 'SkyBook Airlines',   from: 'Lucknow (LKO)',   to: 'Mumbai (BOM)',     dep: '06:00 AM', arr: '08:00 AM', price: 4300 },
  { fn: 'SK-1702', airline: 'SkyBook Airlines',   from: 'Lucknow (LKO)',   to: 'Delhi (DEL)',      dep: '10:00 AM', arr: '11:15 AM', price: 2000 },
  { fn: 'SK-1801', airline: 'SkyBook Airlines',   from: 'Srinagar (SXR)',  to: 'Delhi (DEL)',      dep: '07:00 AM', arr: '08:45 AM', price: 3200 },
  { fn: 'SK-1802', airline: 'SkyBook Airlines',   from: 'Srinagar (SXR)',  to: 'Mumbai (BOM)',     dep: '12:00 PM', arr: '02:30 PM', price: 5800 },
  { fn: 'SK-1901', airline: 'SkyBook Airlines',   from: 'Varanasi (VNS)',  to: 'Delhi (DEL)',      dep: '08:00 AM', arr: '09:30 AM', price: 2500 },
  { fn: 'SK-1902', airline: 'SkyBook Airlines',   from: 'Varanasi (VNS)',  to: 'Mumbai (BOM)',     dep: '02:00 PM', arr: '04:30 PM', price: 4900 },
];

// Generate dates for the next 60 days
const insertFlight = db.prepare(`
  INSERT OR IGNORE INTO flights (flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, price, status, availableSeats, isActive)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'On Time', 32, 1)
`);

const insertSeats = db.transaction((flightId, travelDate) => {
  const seatInsert = db.prepare(`
    INSERT OR IGNORE INTO seats (flightId, travelDate, seatNumber, status)
    VALUES (?, ?, ?, 'available')
  `);
  const cols = ['A', 'B', 'C', 'D'];
  for (let row = 1; row <= 8; row++) {
    for (const col of cols) {
      seatInsert.run(flightId, travelDate, `${col}${row}`);
    }
  }
});

const today = new Date();
let flightsAdded = 0;
let seatsAdded = 0;

const addFutureFlights = db.transaction(() => {
  for (let dayOffset = 1; dayOffset <= 60; dayOffset++) {
    const d = new Date(today);
    d.setDate(d.getDate() + dayOffset);
    const dateStr = d.toISOString().slice(0, 10);

    for (const route of routes) {
      const result = insertFlight.run(route.fn, route.airline, route.from, route.to, dateStr, route.dep, route.arr, route.price);
      if (result.changes > 0) {
        flightsAdded++;
        const flightId = result.lastInsertRowid;
        insertSeats(flightId, dateStr);
        seatsAdded += 32;
      }
    }
  }
});

addFutureFlights();

console.log(`✅ Added ${flightsAdded} future flights and ${seatsAdded} seats`);
console.log('Migration complete!');

db.close();
