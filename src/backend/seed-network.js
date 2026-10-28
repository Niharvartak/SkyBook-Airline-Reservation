/**
 * SkyBook – network expansion seeder.
 *
 * Adds sample flights for the airports introduced by the platform upgrade
 * (Leh, Port Blair, Tiruchirappalli, Madurai, Chhatrapati Sambhajinagar,
 * Shirdi, Phuket, Rome, San Francisco, Los Angeles, Chicago, Toronto,
 * Vancouver, Auckland, Shanghai, Beijing).
 *
 * - Idempotent (INSERT IGNORE on flights + seats).
 * - Never deletes or modifies existing bookings/users.
 * - Creates the canonical 180-seat cabin for each new flight.
 *
 * Usage: node src/backend/seed-network.js
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { ensureSchema } = require("./db-schema");

function readEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach(line => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) vars[match[1]] = match[2].trim();
  });
  return vars;
}

const env = { ...readEnv(path.join(__dirname, "../../.env")), ...readEnv(path.join(__dirname, ".env")) };

// Each route is generated in both directions over the schedule window.
const ROUTES = [
  // Domestic additions
  { from: "BOM", to: "IXL", price: 6499, dep: "06:10 AM", arr: "08:40 AM", airline: "SkyBook Airlines" },
  { from: "DEL", to: "IXL", price: 5999, dep: "07:00 AM", arr: "08:35 AM", airline: "SkyBook Express" },
  { from: "BOM", to: "IXZ", price: 7499, dep: "08:30 AM", arr: "11:15 AM", airline: "SkyBook Airlines" },
  { from: "DEL", to: "IXZ", price: 8299, dep: "09:15 AM", arr: "12:40 PM", airline: "SkyBook Express" },
  { from: "BLR", to: "TRZ", price: 3299, dep: "07:20 AM", arr: "08:30 AM", airline: "SkyBook Express" },
  { from: "MAA", to: "TRZ", price: 2499, dep: "06:45 AM", arr: "07:40 AM", airline: "SkyBook Airlines" },
  { from: "BLR", to: "IXM", price: 3499, dep: "01:10 PM", arr: "02:25 PM", airline: "SkyBook Express" },
  { from: "MAA", to: "IXM", price: 2299, dep: "04:20 PM", arr: "05:25 PM", airline: "SkyBook Airlines" },
  { from: "BOM", to: "IXU", price: 3199, dep: "10:00 AM", arr: "11:05 AM", airline: "SkyBook Express" },
  { from: "DEL", to: "IXU", price: 4299, dep: "12:30 PM", arr: "02:20 PM", airline: "SkyBook Airlines" },
  { from: "BOM", to: "SAG", price: 2899, dep: "07:40 AM", arr: "08:40 AM", airline: "SkyBook Express" },
  { from: "DEL", to: "SAG", price: 3999, dep: "09:50 AM", arr: "11:45 AM", airline: "SkyBook Airlines" },

  // International additions
  { from: "BOM", to: "HKT", price: 18999, dep: "11:30 PM", arr: "05:45 AM", airline: "SkyBook International" },
  { from: "DEL", to: "HKT", price: 20999, dep: "10:45 PM", arr: "05:20 AM", airline: "SkyBook International" },
  { from: "BOM", to: "FCO", price: 48999, dep: "01:20 AM", arr: "07:10 AM", airline: "SkyBook International" },
  { from: "DEL", to: "FCO", price: 46999, dep: "02:10 AM", arr: "07:55 AM", airline: "SkyBook International" },
  { from: "BOM", to: "SFO", price: 62999, dep: "11:50 PM", arr: "06:40 AM", airline: "SkyBook International" },
  { from: "DEL", to: "SFO", price: 64999, dep: "10:30 PM", arr: "05:10 AM", airline: "SkyBook International" },
  { from: "BOM", to: "LAX", price: 59999, dep: "09:40 PM", arr: "05:00 AM", airline: "SkyBook International" },
  { from: "DEL", to: "LAX", price: 61999, dep: "11:10 PM", arr: "06:35 AM", airline: "SkyBook International" },
  { from: "BOM", to: "ORD", price: 57999, dep: "10:20 PM", arr: "05:45 AM", airline: "SkyBook International" },
  { from: "DEL", to: "ORD", price: 55999, dep: "11:55 PM", arr: "06:50 AM", airline: "SkyBook International" },
  { from: "BOM", to: "YYZ", price: 58999, dep: "09:15 PM", arr: "05:30 AM", airline: "SkyBook International" },
  { from: "DEL", to: "YYZ", price: 56999, dep: "10:05 PM", arr: "06:15 AM", airline: "SkyBook International" },
  { from: "BOM", to: "YVR", price: 60999, dep: "08:50 PM", arr: "05:20 AM", airline: "SkyBook International" },
  { from: "DEL", to: "YVR", price: 62999, dep: "09:45 PM", arr: "06:30 AM", airline: "SkyBook International" },
  { from: "BOM", to: "AKL", price: 68999, dep: "07:30 PM", arr: "07:10 AM", airline: "SkyBook International" },
  { from: "DEL", to: "AKL", price: 70999, dep: "08:20 PM", arr: "08:15 AM", airline: "SkyBook International" },
  { from: "BOM", to: "PVG", price: 32999, dep: "10:40 PM", arr: "07:20 AM", airline: "SkyBook International" },
  { from: "DEL", to: "PVG", price: 34999, dep: "11:20 PM", arr: "08:05 AM", airline: "SkyBook International" },
  { from: "BOM", to: "PEK", price: 31999, dep: "09:55 PM", arr: "06:40 AM", airline: "SkyBook International" },
  { from: "DEL", to: "PEK", price: 33999, dep: "10:35 PM", arr: "07:25 AM", airline: "SkyBook International" },
];

const COLS = ["A", "B", "C", "D", "E", "F"];
const ROWS = 30;
const CAPACITY = COLS.length * ROWS;
const DAYS_AHEAD = 30;

function dateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  // Use the machine's calendar date (matches MySQL CURDATE()), not the UTC date.
  const pad = value => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function minutesBetween(dep, arr) {
  const parse = value => {
    const match = String(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return null;
    let h = Number(match[1]);
    const m = Number(match[2]);
    if (match[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (match[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + m;
  };
  const a = parse(dep), b = parse(arr);
  if (a == null || b == null) return null;
  let diff = b - a;
  if (diff <= 0) diff += 1440;
  return diff;
}

function addMinutes(time, minutes) {
  const match = String(time).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "12:00 PM";
  let h = Number(match[1]);
  const m = Number(match[2]);
  if (match[3].toUpperCase() === "PM" && h !== 12) h += 12;
  if (match[3].toUpperCase() === "AM" && h === 12) h = 0;
  let total = (h * 60 + m + minutes) % 1440;
  if (total < 0) total += 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  const suffix = hh >= 12 ? "PM" : "AM";
  let display = hh % 12;
  if (display === 0) display = 12;
  return `${String(display).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${suffix}`;
}

async function main() {
  const pool = mysql.createPool({
    host: env.MYSQL_HOST || "127.0.0.1",
    port: Number(env.MYSQL_PORT) || 3306,
    user: env.MYSQL_USER || "skybook_app",
    password: env.MYSQL_PASSWORD || "",
    database: env.MYSQL_DATABASE || "skybook",
    waitForConnections: true,
    connectionLimit: 5,
    charset: "utf8mb4",
    decimalNumbers: true,
    // Keep DATE columns as YYYY-MM-DD strings so seat dates cannot shift by timezone.
    dateStrings: true,
  });

  await ensureSchema(pool);

  const [airports] = await pool.query("SELECT code, city FROM airports");
  const byCode = new Map(airports.map(a => [a.code, a.city]));
  const missing = ROUTES.flatMap(r => [r.from, r.to]).filter(code => !byCode.has(code));
  if (missing.length) {
    console.error("❌ Missing airports in catalogue:", [...new Set(missing)].join(", "));
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const directions = [];
  for (const route of ROUTES) {
    const back = addMinutes(route.dep, 14 * 60); // return ~14h later (same clock time next day)
    directions.push({
      ...route,
      origin: `${byCode.get(route.from)} (${route.from})`,
      destination: `${byCode.get(route.to)} (${route.to})`,
      flightNumber: "",
      durationMinutes: minutesBetween(route.dep, route.arr),
    });
    directions.push({
      ...route,
      origin: `${byCode.get(route.to)} (${route.to})`,
      destination: `${byCode.get(route.from)} (${route.from})`,
      dep: back,
      arr: addMinutes(back, minutesBetween(route.dep, route.arr) || 180),
      flightNumber: "",
    });
  }

  // Reserve a stable flight number per direction (SK-7001..).
  directions.forEach((route, index) => { route.flightNumber = `SK-${7001 + index}`; });

  let insertedFlights = 0;
  let insertedSeats = 0;

  for (let day = 0; day <= DAYS_AHEAD; day++) {
    const date = dateStr(day);
    const flightRows = directions.map(route => [
      route.flightNumber, route.airline, route.origin, route.destination, date,
      route.dep, route.arr, route.price, "On Time", CAPACITY, 1,
      route.durationMinutes, 0, CAPACITY >= 180 ? "Airbus A320neo" : "Airbus A320",
      "Economy,Business", "15kg check-in + 7kg cabin",
    ]);

    const [result] = await pool.query(
      `INSERT IGNORE INTO flights
        (flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime,
         price, status, availableSeats, isActive, durationMinutes, stops, aircraft,
         cabinClasses, baggageAllowance)
       VALUES ?`,
      [flightRows]
    );
    insertedFlights += result.affectedRows;

    const [created] = await pool.query(
      "SELECT id, departureDate FROM flights WHERE departureDate = ? AND flightNumber IN (?)",
      [date, directions.map(route => route.flightNumber)]
    );

    const seatRows = [];
    for (const flight of created) {
      const dayValue = String(flight.departureDate).slice(0, 10);
      for (let r = 1; r <= ROWS; r++) {
        for (const c of COLS) seatRows.push([flight.id, dayValue, `${c}${r}`, "available"]);
      }
    }
    for (let i = 0; i < seatRows.length; i += 5000) {
      const chunk = seatRows.slice(i, i + 5000);
      const [seatResult] = await pool.query(
        "INSERT IGNORE INTO seats (flightId, travelDate, seatNumber, status) VALUES ?",
        [chunk]
      );
      insertedSeats += seatResult.affectedRows;
    }
    process.stdout.write(`\r  day ${day + 1}/${DAYS_AHEAD + 1} · flights +${insertedFlights} · seats +${insertedSeats}`);
  }
  process.stdout.write("\n");

  const [[total]] = await pool.query(
    "SELECT COUNT(*) AS c FROM flights WHERE isActive = 1 AND departureDate >= CURDATE()"
  );
  const [[routes]] = await pool.query(
    "SELECT COUNT(DISTINCT CONCAT(origin, '→', destination)) AS c FROM flights WHERE isActive = 1"
  );
  console.log(`✅ Network seed complete.`);
  console.log(`   New flights inserted: ${insertedFlights}`);
  console.log(`   New seat rows inserted: ${insertedSeats}`);
  console.log(`   Active flights from today: ${total.c}`);
  console.log(`   Distinct active routes: ${routes.c}`);

  await pool.end();
}

main().catch(error => {
  console.error("\n❌ Seed failed:", error.message);
  process.exit(1);
});
