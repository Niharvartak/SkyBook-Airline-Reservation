/**
 * SkyBook – Extend flight schedule to 30 days from today.
 * Safe to run multiple times (uses INSERT IGNORE).
 * Usage: node extend-flights.js
 */
const mysql = require("mysql2/promise");
const path  = require("path");
const fs    = require("fs");

// Load .env
function readEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  });
  return vars;
}
const env = { ...readEnv(path.join(__dirname, "../../.env")), ...readEnv(path.join(__dirname, ".env")) };

// Flight route template – each entry is repeated for every date
const ROUTES = [
  // Domestic – high frequency
  { flightNumber: "SK-101", airline: "SkyBook Airlines",     origin: "Mumbai (BOM)",     destination: "Delhi (DEL)",        departureTime: "08:00 AM", arrivalTime: "10:15 AM", price: 4999  },
  { flightNumber: "SK-102", airline: "SkyBook Express",      origin: "Mumbai (BOM)",     destination: "Delhi (DEL)",        departureTime: "01:30 PM", arrivalTime: "03:45 PM", price: 5499  },
  { flightNumber: "SK-201", airline: "SkyBook Airlines",     origin: "Delhi (DEL)",      destination: "Mumbai (BOM)",       departureTime: "07:00 AM", arrivalTime: "09:20 AM", price: 4500  },
  { flightNumber: "SK-202", airline: "SkyBook Airlines",     origin: "Delhi (DEL)",      destination: "Goa (GOI)",          departureTime: "11:30 AM", arrivalTime: "02:00 PM", price: 3499  },
  { flightNumber: "SK-203", airline: "SkyBook Express",      origin: "Delhi (DEL)",      destination: "Bengaluru (BLR)",    departureTime: "06:00 AM", arrivalTime: "09:00 AM", price: 5200  },
  { flightNumber: "SK-204", airline: "SkyBook Airlines",     origin: "Delhi (DEL)",      destination: "Chennai (MAA)",      departureTime: "02:00 PM", arrivalTime: "04:30 PM", price: 4800  },
  { flightNumber: "SK-301", airline: "SkyBook Airlines",     origin: "Mumbai (BOM)",     destination: "Dubai (DXB)",        departureTime: "09:00 PM", arrivalTime: "11:30 PM", price: 12500 },
  { flightNumber: "SK-302", airline: "SkyBook International",origin: "Mumbai (BOM)",     destination: "Singapore (SIN)",    departureTime: "10:00 PM", arrivalTime: "06:30 AM", price: 18000 },
  { flightNumber: "SK-303", airline: "SkyBook Airlines",     origin: "Mumbai (BOM)",     destination: "Goa (GOI)",          departureTime: "07:30 AM", arrivalTime: "08:45 AM", price: 2999  },
  { flightNumber: "SK-304", airline: "SkyBook Airlines",     origin: "Mumbai (BOM)",     destination: "Bengaluru (BLR)",    departureTime: "06:00 AM", arrivalTime: "07:30 AM", price: 3800  },
  { flightNumber: "SK-305", airline: "SkyBook International",origin: "Mumbai (BOM)",     destination: "Bangkok (BKK)",      departureTime: "11:00 PM", arrivalTime: "05:30 AM", price: 15500 },
  { flightNumber: "SK-401", airline: "SkyBook Airlines",     origin: "Bengaluru (BLR)",  destination: "Delhi (DEL)",        departureTime: "05:30 AM", arrivalTime: "08:30 AM", price: 5100  },
  { flightNumber: "SK-402", airline: "SkyBook Express",      origin: "Bengaluru (BLR)",  destination: "Mumbai (BOM)",       departureTime: "09:00 AM", arrivalTime: "10:30 AM", price: 3700  },
  { flightNumber: "SK-403", airline: "SkyBook Airlines",     origin: "Bengaluru (BLR)",  destination: "Hyderabad (HYD)",    departureTime: "12:00 PM", arrivalTime: "01:00 PM", price: 2200  },
  { flightNumber: "SK-501", airline: "SkyBook Airlines",     origin: "Hyderabad (HYD)",  destination: "Delhi (DEL)",        departureTime: "06:00 AM", arrivalTime: "08:30 AM", price: 4800  },
  { flightNumber: "SK-502", airline: "SkyBook Express",      origin: "Hyderabad (HYD)",  destination: "Mumbai (BOM)",       departureTime: "10:00 AM", arrivalTime: "11:30 AM", price: 3300  },
  { flightNumber: "SK-601", airline: "SkyBook Airlines",     origin: "Goa (GOI)",        destination: "Mumbai (BOM)",       departureTime: "10:00 AM", arrivalTime: "11:15 AM", price: 3100  },
  { flightNumber: "SK-602", airline: "SkyBook Airlines",     origin: "Goa (GOI)",        destination: "Delhi (DEL)",        departureTime: "03:00 PM", arrivalTime: "05:30 PM", price: 4200  },
  { flightNumber: "SK-701", airline: "SkyBook Airlines",     origin: "Chennai (MAA)",    destination: "Delhi (DEL)",        departureTime: "07:00 AM", arrivalTime: "09:30 AM", price: 5300  },
  { flightNumber: "SK-702", airline: "SkyBook Express",      origin: "Chennai (MAA)",    destination: "Mumbai (BOM)",       departureTime: "11:00 AM", arrivalTime: "12:45 PM", price: 3600  },
  { flightNumber: "SK-703", airline: "SkyBook Airlines",     origin: "Chennai (MAA)",    destination: "Bengaluru (BLR)",    departureTime: "04:00 PM", arrivalTime: "05:10 PM", price: 2100  },
  { flightNumber: "SK-801", airline: "SkyBook Airlines",     origin: "Kolkata (CCU)",    destination: "Mumbai (BOM)",       departureTime: "06:00 AM", arrivalTime: "09:00 AM", price: 5500  },
  { flightNumber: "SK-802", airline: "SkyBook Airlines",     origin: "Kolkata (CCU)",    destination: "Delhi (DEL)",        departureTime: "09:00 AM", arrivalTime: "11:30 AM", price: 4300  },
  { flightNumber: "SK-803", airline: "SkyBook Express",      origin: "Kolkata (CCU)",    destination: "Bengaluru (BLR)",    departureTime: "03:00 PM", arrivalTime: "06:00 PM", price: 5800  },
  // International
  { flightNumber: "SK-901", airline: "SkyBook International",origin: "Delhi (DEL)",      destination: "London (LHR)",       departureTime: "08:00 PM", arrivalTime: "01:00 AM", price: 45000 },
  { flightNumber: "SK-902", airline: "SkyBook International",origin: "Mumbai (BOM)",     destination: "New York (JFK)",     departureTime: "10:00 PM", arrivalTime: "05:30 AM", price: 65000 },
  { flightNumber: "SK-903", airline: "SkyBook International",origin: "Delhi (DEL)",      destination: "Paris (CDG)",        departureTime: "09:30 PM", arrivalTime: "02:30 AM", price: 48000 },
  { flightNumber: "SK-904", airline: "SkyBook International",origin: "Mumbai (BOM)",     destination: "Kuala Lumpur (KUL)", departureTime: "08:00 AM", arrivalTime: "04:00 PM", price: 22000 },
];

// Days to generate (today + DAYS_AHEAD)
const DAYS_AHEAD = 30;
// Match the canonical cabin used by seed-airports-flights.js (180 seats).
const SEAT_COLS  = ["A","B","C","D","E","F"];
const SEAT_ROWS  = 30;

function dateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  // Use the machine's calendar date (matches MySQL CURDATE()), not the UTC date.
  const pad = value => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function main() {
  const pool = mysql.createPool({
    host    : env.MYSQL_HOST     || "127.0.0.1",
    port    : Number(env.MYSQL_PORT) || 3306,
    user    : env.MYSQL_USER     || "skybook_app",
    password: env.MYSQL_PASSWORD || "",
    database: env.MYSQL_DATABASE || "skybook",
    multipleStatements: false,
  });

  let inserted = 0, skipped = 0;

  for (let day = 0; day <= DAYS_AHEAD; day++) {
    const date = dateStr(day);
    for (const route of ROUTES) {
      try {
        const [result] = await pool.query(
          `INSERT IGNORE INTO flights (flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, price, status, availableSeats, isActive)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'On Time', 180, 1)`,
          [route.flightNumber, route.airline, route.origin, route.destination,
           date, route.departureTime, route.arrivalTime, route.price]
        );
        if (result.affectedRows > 0) {
          inserted++;
          // Pre-create seat inventory for this flight+date
          const [flightRow] = await pool.query(
            "SELECT id FROM flights WHERE flightNumber = ? AND departureDate = ?",
            [route.flightNumber, date]
          );
          if (flightRow[0]) {
            const flightId = flightRow[0].id;
            const seatRows = [];
            for (let r = 1; r <= SEAT_ROWS; r++)
              for (const c of SEAT_COLS)
                seatRows.push([flightId, date, `${c}${r}`, "available"]);
            await pool.query(
              "INSERT IGNORE INTO seats (flightId, travelDate, seatNumber, status) VALUES ?",
              [seatRows]
            );
          }
        } else {
          skipped++;
        }
      } catch (e) {
        console.error(`  ⚠️  ${route.flightNumber} ${date}: ${e.message}`);
      }
    }
  }

  console.log(`✅ Done. Inserted: ${inserted} flights, Skipped (already exist): ${skipped}`);

  const [[{total}]] = await pool.query("SELECT COUNT(*) AS total FROM flights WHERE departureDate >= CURDATE()");
  const [[{seats}]] = await pool.query("SELECT COUNT(*) AS seats FROM seats");
  const [[{minD}]]  = await pool.query("SELECT MIN(departureDate) AS minD FROM flights");
  const [[{maxD}]]  = await pool.query("SELECT MAX(departureDate) AS maxD FROM flights");
  console.log(`📊 Active flights from today: ${total}`);
  console.log(`🪑 Total seats: ${seats}`);
  console.log(`📅 Date range: ${minD?.toISOString()?.slice(0,10)} → ${maxD?.toISOString()?.slice(0,10)}`);

  await pool.end();
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
