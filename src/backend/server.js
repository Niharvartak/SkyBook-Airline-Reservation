const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "skybook.db");
const JWT_SECRET = process.env.JWT_SECRET || "skybook-default-secret-change-in-production";
const JWT_EXPIRES = "7d";

const db = new Database(DB_PATH);

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

// --------------------------------------------------
// AUTH MIDDLEWARE
// --------------------------------------------------

function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, message: "Authentication required. Please log in." });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Session expired or invalid. Please log in again." });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ ok: false, message: "Access denied. Admin role required." });
    }
    next();
  });
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function generatePNR() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pnr = "SKB-";
  for (let i = 0; i < 6; i++) pnr += chars[Math.floor(Math.random() * chars.length)];
  return pnr;
}

function getUserById(id) {
  const user = db.prepare("SELECT id, name, email, createdAt FROM users WHERE id = ?").get(id);
  if (!user) return null;
  const isAdmin = db.prepare("SELECT id FROM admins WHERE userId = ?").get(id);
  return { ...user, role: isAdmin ? "ADMIN" : "USER" };
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  const tableCount = db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().c;
  res.json({ ok: true, message: "SkyBook backend is running.", tables: tableCount, time: new Date().toISOString() });
});

// --------------------------------------------------
// AUTH ROUTES
// --------------------------------------------------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim()) return res.status(400).json({ ok: false, message: "Full name is required." });
    if (!email?.trim()) return res.status(400).json({ ok: false, message: "Email is required." });
    if (!password || password.length < 6) return res.status(400).json({ ok: false, message: "Password must be at least 6 characters." });

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.trim().toLowerCase());
    if (existing) return res.status(409).json({ ok: false, message: "An account with this email already exists." });

    const passwordHash = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (name, email, passwordHash) VALUES (?, ?, ?)").run(
      name.trim(),
      email.trim().toLowerCase(),
      passwordHash
    );

    const user = getUserById(result.lastInsertRowid);
    res.status(201).json({ ok: true, message: "Account created successfully.", user });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ ok: false, message: "Registration failed. Please try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ ok: false, message: "Email and password are required." });

    const row = db.prepare("SELECT id, name, email, passwordHash FROM users WHERE email = ?").get(email.trim().toLowerCase());
    if (!row) return res.status(401).json({ ok: false, message: "Invalid email or password." });

    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) return res.status(401).json({ ok: false, message: "Invalid email or password." });

    const user = getUserById(row.id);
    const token = jwt.sign({ id: row.id, email: row.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({ ok: true, message: "Login successful.", token, user });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ ok: false, message: "Login failed. Please try again." });
  }
});

// Legacy login endpoint for backward compatibility
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ ok: false, message: "Email and password are required." });

    const row = db.prepare("SELECT id, name, email, passwordHash FROM users WHERE email = ?").get(email.trim().toLowerCase());
    if (!row) return res.status(401).json({ ok: false, message: "Invalid email or password." });

    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) return res.status(401).json({ ok: false, message: "Invalid email or password." });

    const user = getUserById(row.id);
    const token = jwt.sign({ id: row.id, email: row.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ ok: true, token, user });
  } catch {
    res.status(500).json({ ok: false, message: "Login failed." });
  }
});

app.post("/api/register", async (req, res) => {
  req.url = "/api/auth/register";
  // redirect internally
  const { name, email, password } = req.body;
  try {
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ ok: false, message: "Name, email and password are required." });
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.trim().toLowerCase());
    if (existing) return res.status(409).json({ ok: false, message: "Email already registered." });
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (name, email, passwordHash) VALUES (?, ?, ?)").run(name.trim(), email.trim().toLowerCase(), hash);
    const user = getUserById(result.lastInsertRowid);
    res.status(201).json({ ok: true, message: "Registration successful.", user });
  } catch {
    res.status(500).json({ ok: false, message: "Registration failed." });
  }
});

app.get("/api/auth/profile", requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: "User not found." });
  res.json({ ok: true, user });
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: "User not found." });
  res.json({ ok: true, user });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: "User not found." });
  res.json({ ok: true, user });
});

// --------------------------------------------------
// DESTINATIONS (new comprehensive list)
// --------------------------------------------------

const DESTINATIONS = [
  // Indian Domestic
  { code: "BOM", city: "Mumbai", name: "Mumbai (BOM)", airport: "Chhatrapati Shivaji Maharaj International Airport", country: "India", region: "domestic", description: "India's financial capital and entertainment hub", emoji: "🌊" },
  { code: "DEL", city: "Delhi", name: "Delhi (DEL)", airport: "Indira Gandhi International Airport", country: "India", region: "domestic", description: "India's capital with historic monuments", emoji: "🏛️" },
  { code: "BLR", city: "Bengaluru", name: "Bengaluru (BLR)", airport: "Kempegowda International Airport", country: "India", region: "domestic", description: "India's Silicon Valley and garden city", emoji: "🌿" },
  { code: "HYD", city: "Hyderabad", name: "Hyderabad (HYD)", airport: "Rajiv Gandhi International Airport", country: "India", region: "domestic", description: "City of Nizams and tech corridors", emoji: "🕌" },
  { code: "MAA", city: "Chennai", name: "Chennai (MAA)", airport: "Chennai International Airport", country: "India", region: "domestic", description: "Gateway to South India and cultural hub", emoji: "🏖️" },
  { code: "CCU", city: "Kolkata", name: "Kolkata (CCU)", airport: "Netaji Subhas Chandra Bose International Airport", country: "India", region: "domestic", description: "City of joy and cultural heritage", emoji: "🎭" },
  { code: "PNQ", city: "Pune", name: "Pune (PNQ)", airport: "Pune International Airport", country: "India", region: "domestic", description: "Oxford of the East and tech hub", emoji: "📚" },
  { code: "GOI", city: "Goa", name: "Goa (GOI)", airport: "Dabolim Airport", country: "India", region: "domestic", description: "Beach paradise of India", emoji: "🌴" },
  { code: "COK", city: "Kochi", name: "Kochi (COK)", airport: "Cochin International Airport", country: "India", region: "domestic", description: "Queen of the Arabian Sea", emoji: "🚢" },
  { code: "AMD", city: "Ahmedabad", name: "Ahmedabad (AMD)", airport: "Sardar Vallabhbhai Patel International Airport", country: "India", region: "domestic", description: "Heritage city and business centre", emoji: "🏺" },
  { code: "JAI", city: "Jaipur", name: "Jaipur (JAI)", airport: "Jaipur International Airport", country: "India", region: "domestic", description: "Pink City of royal heritage", emoji: "🏰" },
  { code: "LKO", city: "Lucknow", name: "Lucknow (LKO)", airport: "Chaudhary Charan Singh International Airport", country: "India", region: "domestic", description: "City of nawabs and tehzeeb", emoji: "🌹" },
  { code: "SXR", city: "Srinagar", name: "Srinagar (SXR)", airport: "Sheikh ul-Alam International Airport", country: "India", region: "domestic", description: "Paradise on earth in Kashmir", emoji: "🏔️" },
  { code: "VNS", city: "Varanasi", name: "Varanasi (VNS)", airport: "Lal Bahadur Shastri International Airport", country: "India", region: "domestic", description: "Spiritual capital of India", emoji: "🕯️" },
  // International
  { code: "DXB", city: "Dubai", name: "Dubai (DXB)", airport: "Dubai International Airport", country: "UAE", region: "international", description: "City of the future and luxury", emoji: "🏙️" },
  { code: "SIN", city: "Singapore", name: "Singapore (SIN)", airport: "Changi Airport", country: "Singapore", region: "international", description: "Garden city and global hub", emoji: "🌿" },
  { code: "BKK", city: "Bangkok", name: "Bangkok (BKK)", airport: "Suvarnabhumi Airport", country: "Thailand", region: "international", description: "City of angels and temples", emoji: "🛕" },
  { code: "LHR", city: "London", name: "London (LHR)", airport: "Heathrow Airport", country: "UK", region: "international", description: "Historic capital of the world", emoji: "💂" },
  { code: "CDG", city: "Paris", name: "Paris (CDG)", airport: "Charles de Gaulle Airport", country: "France", region: "international", description: "City of love and culture", emoji: "🗼" },
  { code: "KUL", city: "Kuala Lumpur", name: "Kuala Lumpur (KUL)", airport: "Kuala Lumpur International Airport", country: "Malaysia", region: "international", description: "Twin towers and vibrant culture", emoji: "🗼" },
  { code: "JFK", city: "New York", name: "New York (JFK)", airport: "John F. Kennedy International Airport", country: "USA", region: "international", description: "The city that never sleeps", emoji: "🗽" },
];

app.get("/api/destinations", (req, res) => {
  res.json({ ok: true, destinations: DESTINATIONS });
});

// --------------------------------------------------
// FLIGHT SEARCH
// --------------------------------------------------

app.get("/api/flights/search", (req, res) => {
  try {
    const { from, to, departureDate, passengers = "1" } = req.query;

    if (!from || !to) {
      return res.status(400).json({ ok: false, message: "Origin and destination are required.", flights: [] });
    }

    if (from.trim().toLowerCase() === to.trim().toLowerCase()) {
      return res.status(400).json({ ok: false, message: "Origin and destination must be different.", flights: [] });
    }

    let sql = `
      SELECT f.id, f.flightNumber, f.airline, f.origin, f.destination,
             f.departureDate, f.departureTime, f.arrivalTime, f.price, f.status,
             f.availableSeats, f.isActive,
             (SELECT COUNT(*) FROM seats s WHERE s.flightId = f.id AND s.travelDate = f.departureDate AND s.status = 'available') AS liveSeats
      FROM flights f
      WHERE LOWER(f.origin) LIKE LOWER(?)
        AND LOWER(f.destination) LIKE LOWER(?)
        AND f.isActive = 1
    `;
    const params = [`%${from.trim()}%`, `%${to.trim()}%`];

    if (departureDate) {
      sql += ` AND DATE(f.departureDate) = DATE(?)`;
      params.push(departureDate);
    } else {
      // Default: show flights from today onwards
      sql += ` AND DATE(f.departureDate) >= DATE('now')`;
    }

    sql += ` ORDER BY f.departureDate ASC, f.departureTime ASC LIMIT 50`;

    let flights = db.prepare(sql).all(...params);

    // Use liveSeats if available, else availableSeats
    flights = flights.map(f => ({
      ...f,
      availableSeats: f.liveSeats ?? f.availableSeats ?? 32,
      liveSeats: undefined,
    }));

    res.json({ ok: true, flights });
  } catch (error) {
    console.error("FLIGHT SEARCH ERROR:", error);
    res.status(500).json({ ok: false, message: "Flight search failed.", flights: [] });
  }
});

// Flight catalog (all active flights)
app.get("/api/flights/catalog", (req, res) => {
  try {
    const flights = db.prepare(`
      SELECT id, flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, price, status,
             availableSeats, isActive
      FROM flights
      WHERE isActive = 1 AND DATE(departureDate) >= DATE('now')
      ORDER BY departureDate ASC, flightNumber ASC
      LIMIT 200
    `).all();
    res.json({ ok: true, flights });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load flight catalog.", flights: [] });
  }
});

// Flight status lookup
app.get("/api/flights/status", (req, res) => {
  try {
    const { flightNumber } = req.query;
    if (!flightNumber) return res.status(400).json({ ok: false, message: "Flight number is required." });

    // Find the most recent / upcoming instance of this flight
    const flight = db.prepare(`
      SELECT id, flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, status
      FROM flights
      WHERE LOWER(flightNumber) = LOWER(?)
      ORDER BY ABS(JULIANDAY(departureDate) - JULIANDAY('now')) ASC
      LIMIT 1
    `).get(flightNumber.trim());

    if (!flight) {
      return res.status(404).json({ ok: false, message: `Flight ${flightNumber} was not found in the SkyBook schedule.` });
    }

    res.json({
      ok: true,
      flight: {
        ...flight,
        terminal: null,
        gate: null,
        baggageBelt: null,
        statusSource: "Schedule data from the SkyBook catalog. Not a live airline operational feed.",
      },
    });
  } catch (error) {
    console.error("STATUS ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to look up flight status." });
  }
});

// Flight details with seat map
app.get("/api/flights/:id", (req, res) => {
  try {
    const flightId = Number(req.params.id);
    const flight = db.prepare("SELECT * FROM flights WHERE id = ?").get(flightId);
    if (!flight) return res.status(404).json({ ok: false, message: "Flight not found." });

    // Get or generate seats for this flight
    const travelDate = flight.departureDate;
    let seats = db.prepare("SELECT * FROM seats WHERE flightId = ? AND travelDate = ?").all(flightId, travelDate);

    if (seats.length === 0) {
      // Auto-generate seats
      const insertSeat = db.prepare("INSERT OR IGNORE INTO seats (flightId, travelDate, seatNumber, status) VALUES (?, ?, ?, 'available')");
      const cols = ["A", "B", "C", "D"];
      const generateSeats = db.transaction(() => {
        for (let row = 1; row <= 8; row++) {
          for (const col of cols) {
            insertSeat.run(flightId, travelDate, `${col}${row}`);
          }
        }
      });
      generateSeats();
      seats = db.prepare("SELECT * FROM seats WHERE flightId = ? AND travelDate = ?").all(flightId, travelDate);
    }

    const seatMap = seats.map(s => ({
      seatNumber: s.seatNumber,
      status: s.status,
      row: parseInt(s.seatNumber.replace(/\D/g, ""), 10),
      col: s.seatNumber.replace(/\d/g, ""),
      isWindow: s.seatNumber.startsWith("A") || s.seatNumber.startsWith("D"),
      isAisle: s.seatNumber.startsWith("B") || s.seatNumber.startsWith("C"),
      cabinClass: parseInt(s.seatNumber.replace(/\D/g, ""), 10) <= 2 ? "Business" : "Economy",
    }));

    res.json({ ok: true, flight: { ...flight, seats: seatMap, availableSeats: seats.filter(s => s.status === "available").length } });
  } catch (error) {
    console.error("FLIGHT DETAILS ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to load flight details." });
  }
});

// --------------------------------------------------
// BOOKINGS
// --------------------------------------------------

app.get("/api/bookings", requireAuth, (req, res) => {
  try {
    const bookings = db.prepare(`
      SELECT b.id, b.pnr, b.travelDate AS departureDate, b.passengerName, b.passengerCount,
             b.seatNumbers, b.totalPrice, b.status, b.createdAt, b.contactEmail, b.contactPhone, b.passengers, b.promo_code AS promoCode,
             f.flightNumber, f.airline, f.origin, f.destination, f.departureTime, f.arrivalTime
      FROM bookings b
      LEFT JOIN flights f ON f.id = b.flightId
      WHERE b.userId = ?
      ORDER BY b.id DESC
    `).all(req.user.id);

    const mapped = bookings.map(b => ({
      ...b,
      seatNumbers: (() => {
        try { return JSON.parse(b.seatNumbers || "[]"); } catch { return [b.seatNumbers].filter(Boolean); }
      })(),
      passengers: (() => {
        try { return JSON.parse(b.passengers || "null"); } catch { return null; }
      })(),
    }));

    res.json({ ok: true, bookings: mapped });
  } catch (error) {
    console.error("BOOKINGS ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to load bookings.", bookings: [] });
  }
});

app.post("/api/bookings", requireAuth, (req, res) => {
  try {
    const {
      flightId, travelDate, passengerName, passengers,
      contactEmail, contactPhone, seatNumbers, travelers,
      promoCode,
    } = req.body;

    if (!flightId) return res.status(400).json({ ok: false, message: "Flight ID is required." });
    if (!travelDate) return res.status(400).json({ ok: false, message: "Travel date is required." });
    if (!passengerName) return res.status(400).json({ ok: false, message: "Passenger name is required." });

    const flight = db.prepare("SELECT * FROM flights WHERE id = ?").get(Number(flightId));
    if (!flight) return res.status(404).json({ ok: false, message: "Flight not found." });

    const seatsArray = Array.isArray(seatNumbers) ? seatNumbers : (seatNumbers ? JSON.parse(seatNumbers) : []);
    const travelerCount = Number(travelers) || seatsArray.length || 1;

    // Check seat availability
    for (const seat of seatsArray) {
      const seatRow = db.prepare("SELECT status FROM seats WHERE flightId = ? AND travelDate = ? AND seatNumber = ?").get(Number(flightId), travelDate, seat);
      if (seatRow && seatRow.status !== "available") {
        return res.status(409).json({ ok: false, message: `Seat ${seat} is no longer available. Please select a different seat.` });
      }
    }

    // Calculate price with promo
    let totalPrice = flight.price * travelerCount;
    let discount = 0;
    const code = (promoCode || "").trim().toUpperCase();

    const isInternational = `${flight.origin} ${flight.destination}`.toUpperCase().includes("DXB") ||
      `${flight.origin} ${flight.destination}`.toUpperCase().includes("SIN") ||
      `${flight.origin} ${flight.destination}`.toUpperCase().includes("BKK") ||
      `${flight.origin} ${flight.destination}`.toUpperCase().includes("LHR") ||
      `${flight.origin} ${flight.destination}`.toUpperCase().includes("CDG") ||
      `${flight.origin} ${flight.destination}`.toUpperCase().includes("KUL") ||
      `${flight.origin} ${flight.destination}`.toUpperCase().includes("JFK") ||
      `${flight.origin} ${flight.destination}`.toUpperCase().includes("DUBAI") ||
      `${flight.origin} ${flight.destination}`.toUpperCase().includes("SINGAPORE") ||
      `${flight.origin} ${flight.destination}`.toUpperCase().includes("LONDON") ||
      `${flight.origin} ${flight.destination}`.toUpperCase().includes("PARIS");

    if (code === "FLYINDIA" && !isInternational) {
      discount = Math.round(totalPrice * 0.3);
    } else if (code === "WELCOME") {
      discount = Math.min(1000, totalPrice);
    } else if (code === "WORLD20" && isInternational) {
      discount = Math.round(totalPrice * 0.2);
    }

    totalPrice = Math.max(0, totalPrice - discount);

    // Generate unique PNR
    let pnr;
    let attempts = 0;
    do {
      pnr = generatePNR();
      const existing = db.prepare("SELECT id FROM bookings WHERE pnr = ?").get(pnr);
      if (!existing) break;
    } while (++attempts < 10);

    // Create booking
    const result = db.prepare(`
      INSERT INTO bookings (userId, flightId, travelDate, passengerName, passengerCount, seatNumbers, totalPrice, pnr, status, contactEmail, contactPhone, passengers, promo_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?)
    `).run(
      req.user.id, Number(flightId), travelDate, passengerName,
      travelerCount, JSON.stringify(seatsArray), totalPrice,
      pnr, contactEmail || null, contactPhone || null,
      typeof passengers === "string" ? passengers : JSON.stringify(passengers || null),
      code || null
    );

    // Mark seats as booked
    const bookingId = result.lastInsertRowid;
    const updateSeat = db.prepare("UPDATE seats SET status = 'booked', bookingId = ? WHERE flightId = ? AND travelDate = ? AND seatNumber = ?");
    const bookSeats = db.transaction(() => {
      for (const seat of seatsArray) {
        updateSeat.run(bookingId, Number(flightId), travelDate, seat);
      }
    });
    bookSeats();

    // Update flight availableSeats
    db.prepare("UPDATE flights SET availableSeats = MAX(0, availableSeats - ?) WHERE id = ?").run(seatsArray.length, Number(flightId));

    // Create notification
    try {
      db.prepare(`
        INSERT INTO notifications (userId, title, message, type)
        VALUES (?, ?, ?, 'booking')
      `).run(
        req.user.id,
        "Booking Confirmed",
        `Your booking ${pnr} for ${flight.flightNumber} (${flight.origin} → ${flight.destination}) on ${travelDate} has been confirmed.`
      );
    } catch {}

    const booking = {
      id: bookingId,
      pnr,
      flightId: Number(flightId),
      flightNumber: flight.flightNumber,
      airline: flight.airline,
      origin: flight.origin,
      destination: flight.destination,
      departureDate: travelDate,
      departureTime: flight.departureTime,
      arrivalTime: flight.arrivalTime,
      passengerName,
      passengerCount: travelerCount,
      seatNumbers: seatsArray,
      totalPrice,
      discount,
      promoCode: code || null,
      status: "CONFIRMED",
      createdAt: new Date().toISOString(),
    };

    res.status(201).json({ ok: true, message: "Booking confirmed!", booking });
  } catch (error) {
    console.error("CREATE BOOKING ERROR:", error);
    res.status(500).json({ ok: false, message: "Booking failed. Please try again." });
  }
});

app.post("/api/bookings/:id/cancel", requireAuth, (req, res) => {
  try {
    const bookingId = Number(req.params.id);
    const booking = db.prepare("SELECT * FROM bookings WHERE id = ? AND userId = ?").get(bookingId, req.user.id);

    if (!booking) return res.status(404).json({ ok: false, message: "Booking not found." });
    if (booking.status === "CANCELLED") return res.status(400).json({ ok: false, message: "Booking is already cancelled." });

    db.prepare("UPDATE bookings SET status = 'CANCELLED' WHERE id = ?").run(bookingId);

    // Release seats
    const seatsArray = (() => { try { return JSON.parse(booking.seatNumbers || "[]"); } catch { return []; } })();
    const releaseSeat = db.prepare("UPDATE seats SET status = 'available', bookingId = NULL WHERE flightId = ? AND travelDate = ? AND seatNumber = ?");
    db.transaction(() => { for (const s of seatsArray) releaseSeat.run(booking.flightId, booking.travelDate, s); })();

    // Update available seats count
    db.prepare("UPDATE flights SET availableSeats = availableSeats + ? WHERE id = ?").run(seatsArray.length, booking.flightId);

    // Notification
    try {
      db.prepare(`INSERT INTO notifications (userId, title, message, type) VALUES (?, ?, ?, 'cancellation')`).run(
        req.user.id, "Booking Cancelled", `Your booking ${booking.pnr} has been cancelled and seats released.`
      );
    } catch {}

    res.json({ ok: true, message: "Booking cancelled and seats released." });
  } catch (error) {
    console.error("CANCEL ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to cancel booking." });
  }
});

// --------------------------------------------------
// FARE WATCHES
// --------------------------------------------------

app.get("/api/fare-watches", requireAuth, (req, res) => {
  try {
    const watches = db.prepare(`
      SELECT fw.*, f.flightNumber, f.airline, f.origin AS routeOrigin, f.destination AS routeDestination,
             f.departureDate, f.departureTime, f.arrivalTime
      FROM fare_watches fw
      LEFT JOIN flights f ON f.id = fw.flightId
      WHERE fw.userId = ?
      ORDER BY fw.id DESC
    `).all(req.user.id);

    const result = watches.map(w => {
      const snapshots = db.prepare("SELECT price, observedAt FROM fare_watch_snapshots WHERE fareWatchId = ? ORDER BY observedAt DESC LIMIT 10").all(w.id);
      return { ...w, snapshots };
    });

    res.json({ ok: true, fareWatches: result });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load fare watches.", fareWatches: [] });
  }
});

app.post("/api/fare-watches", requireAuth, (req, res) => {
  try {
    const { flightId, targetPrice } = req.body;
    if (!flightId) return res.status(400).json({ ok: false, message: "Flight ID is required." });

    const flight = db.prepare("SELECT * FROM flights WHERE id = ?").get(Number(flightId));
    if (!flight) return res.status(404).json({ ok: false, message: "Flight not found." });

    const existing = db.prepare("SELECT id FROM fare_watches WHERE userId = ? AND flightId = ?").get(req.user.id, Number(flightId));
    if (existing) return res.status(409).json({ ok: false, message: "You are already watching this flight." });

    const result = db.prepare(`
      INSERT INTO fare_watches (userId, flightId, currentPrice, targetPrice, trend, updatedAt)
      VALUES (?, ?, ?, ?, 'stable', datetime('now'))
    `).run(req.user.id, Number(flightId), flight.price, targetPrice ? Number(targetPrice) : null);

    db.prepare("INSERT INTO fare_watch_snapshots (fareWatchId, price) VALUES (?, ?)").run(result.lastInsertRowid, flight.price);

    res.status(201).json({ ok: true, message: "Fare watch created." });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to create fare watch." });
  }
});

app.post("/api/fare-watches/check", requireAuth, (req, res) => {
  try {
    const watches = db.prepare("SELECT fw.*, f.price AS latestPrice FROM fare_watches fw LEFT JOIN flights f ON f.id = fw.flightId WHERE fw.userId = ?").all(req.user.id);
    const update = db.prepare("UPDATE fare_watches SET previousPrice = currentPrice, currentPrice = ?, priceChange = ? - currentPrice, trend = ?, alertTriggered = ?, updatedAt = datetime('now') WHERE id = ?");
    const snap = db.prepare("INSERT INTO fare_watch_snapshots (fareWatchId, price) VALUES (?, ?)");

    const doCheck = db.transaction(() => {
      for (const w of watches) {
        const newPrice = w.latestPrice || w.currentPrice;
        const change = newPrice - w.currentPrice;
        const trend = change > 0 ? "up" : change < 0 ? "down" : "stable";
        const triggered = w.targetPrice ? newPrice <= w.targetPrice : 0;
        update.run(newPrice, newPrice, trend, triggered ? 1 : 0, w.id);
        snap.run(w.id, newPrice);
      }
    });
    doCheck();

    const updated = db.prepare(`
      SELECT fw.*, f.flightNumber, f.airline, f.origin AS routeOrigin, f.destination AS routeDestination, f.departureDate, f.departureTime, f.arrivalTime
      FROM fare_watches fw LEFT JOIN flights f ON f.id = fw.flightId WHERE fw.userId = ? ORDER BY fw.id DESC
    `).all(req.user.id).map(w => ({ ...w, snapshots: db.prepare("SELECT price, observedAt FROM fare_watch_snapshots WHERE fareWatchId = ? ORDER BY observedAt DESC LIMIT 10").all(w.id) }));

    res.json({ ok: true, message: "Fare observations updated from current SkyBook flight prices.", fareWatches: updated });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to check fares." });
  }
});

app.delete("/api/fare-watches/:id", requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const w = db.prepare("SELECT id FROM fare_watches WHERE id = ? AND userId = ?").get(id, req.user.id);
    if (!w) return res.status(404).json({ ok: false, message: "Fare watch not found." });
    db.prepare("DELETE FROM fare_watch_snapshots WHERE fareWatchId = ?").run(id);
    db.prepare("DELETE FROM fare_watches WHERE id = ?").run(id);
    res.json({ ok: true, message: "Fare watch removed." });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to remove fare watch." });
  }
});

// --------------------------------------------------
// NOTIFICATIONS
// --------------------------------------------------

app.get("/api/notifications", requireAuth, (req, res) => {
  try {
    const items = db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY id DESC LIMIT 50").all(req.user.id);
    res.json({ ok: true, notifications: items });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to load notifications.", notifications: [] });
  }
});

app.put("/api/notifications/:id/read", requireAuth, (req, res) => {
  try {
    db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND userId = ?").run(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to update notification." });
  }
});

app.put("/api/notifications/read-all", requireAuth, (req, res) => {
  try {
    db.prepare("UPDATE notifications SET read = 1 WHERE userId = ?").run(req.user.id);
    res.json({ ok: true, message: "All notifications marked as read." });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to update notifications." });
  }
});

// --------------------------------------------------
// ACCOUNT PREFERENCES
// --------------------------------------------------

app.get("/api/account/preferences", requireAuth, (req, res) => {
  try {
    const row = db.prepare("SELECT preferences FROM account_preferences WHERE userId = ?").get(req.user.id);
    const preferences = row ? JSON.parse(row.preferences || "[]") : [];
    res.json({ ok: true, preferences });
  } catch {
    res.status(500).json({ ok: false, preferences: [] });
  }
});

app.put("/api/account/preferences", requireAuth, (req, res) => {
  try {
    const { preferences = [] } = req.body;
    db.prepare("INSERT OR REPLACE INTO account_preferences (userId, preferences, updatedAt) VALUES (?, ?, datetime('now'))").run(req.user.id, JSON.stringify(preferences));
    res.json({ ok: true, message: "Preferences saved." });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to save preferences." });
  }
});

// --------------------------------------------------
// TRAVEL PLANNER
// --------------------------------------------------

app.get("/api/planner/destinations", (req, res) => {
  try {
    const origins = db.prepare("SELECT DISTINCT origin FROM flights WHERE isActive = 1 AND DATE(departureDate) >= DATE('now') ORDER BY origin").all().map(r => r.origin);
    const destinations = db.prepare("SELECT DISTINCT destination FROM flights WHERE isActive = 1 AND DATE(departureDate) >= DATE('now') ORDER BY destination").all().map(r => r.destination);
    res.json({ ok: true, origins, destinations });
  } catch {
    res.status(500).json({ ok: false, origins: [], destinations: [] });
  }
});

app.post("/api/planner/recommend", (req, res) => {
  try {
    const { origin, destination, departureDate, returnDate, travelers = 1, budget, preferences = [] } = req.body;

    if (!origin || !destination) return res.status(400).json({ ok: false, message: "Origin and destination are required." });
    if (!departureDate) return res.status(400).json({ ok: false, message: "Departure date is required." });

    let sql = `
      SELECT f.id AS flightId, f.flightNumber, f.airline, f.origin, f.destination,
             f.departureDate, f.departureTime, f.arrivalTime,
             f.price AS pricePerPerson, f.price * ? AS totalCost,
             f.status, f.availableSeats
      FROM flights f
      WHERE LOWER(f.origin) LIKE LOWER(?)
        AND LOWER(f.destination) LIKE LOWER(?)
        AND DATE(f.departureDate) = DATE(?)
        AND f.isActive = 1
        AND f.availableSeats >= ?
    `;
    const params = [Number(travelers), `%${origin}%`, `%${destination}%`, departureDate, Number(travelers)];

    if (budget) {
      sql += ` AND (f.price * ?) <= ?`;
      params.push(Number(travelers), Number(budget));
    }

    if (preferences.includes("morning")) {
      sql += ` AND (f.departureTime LIKE '%AM%' AND CAST(SUBSTR(f.departureTime, 1, 2) AS INTEGER) < 12)`;
    } else if (preferences.includes("evening")) {
      sql += ` AND (f.departureTime LIKE '%PM%' AND CAST(SUBSTR(f.departureTime, 1, 2) AS INTEGER) >= 4)`;
    }

    sql += ` ORDER BY f.price ASC, f.departureTime ASC LIMIT 10`;

    const recommendations = db.prepare(sql).all(...params);

    const message = recommendations.length === 0
      ? `No flights found from ${origin} to ${destination} on ${departureDate}.`
      : `Found ${recommendations.length} recommended flight(s) for ${travelers} traveler(s).`;

    res.json({
      ok: true,
      message,
      recommendations,
      disclaimer: "Recommendations are rule-based using SkyBook flight catalog data. Prices are sample fares from the application database, not live airline market pricing.",
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to generate recommendations.", recommendations: [] });
  }
});

// --------------------------------------------------
// NEWSLETTER
// --------------------------------------------------

app.post("/api/newsletter", (req, res) => {
  try {
    const { email } = req.body;
    if (!email?.trim()) return res.status(400).json({ ok: false, message: "Email is required." });

    try {
      db.prepare("INSERT INTO newsletter_subscribers (email) VALUES (?)").run(email.trim().toLowerCase());
      res.json({ ok: true, message: "You're subscribed to SkyBook updates! Note: Email delivery is not configured in this demo." });
    } catch {
      res.json({ ok: true, message: "This email is already subscribed. Thank you!" });
    }
  } catch {
    res.status(500).json({ ok: false, message: "Unable to subscribe. Please try again." });
  }
});

// --------------------------------------------------
// CHAT / ASSISTANT
// --------------------------------------------------

app.post("/api/chat", (req, res) => {
  const { message = "" } = req.body;
  const msg = message.toLowerCase().trim();

  let reply = "I can help with flight bookings, seat selection, promo codes, and travel information! What would you like to know?";

  if (msg.includes("promo") || msg.includes("discount") || msg.includes("code") || msg.includes("offer")) {
    reply = "Active promo codes: 🎫 FLYINDIA (30% off domestic routes) | 🎫 WELCOME (₹1,000 off any flight) | 🎫 WORLD20 (20% off international routes to Dubai, Singapore, Bangkok, London, Paris, KL, New York). Enter the code during booking!";
  } else if (msg.includes("baggage") || msg.includes("luggage")) {
    reply = "SkyBook allows 15 kg check-in + 7 kg cabin baggage (Economy) and 30 kg check-in + 10 kg cabin (Business). Charges for excess baggage vary by route. This is sample policy — not real airline rules.";
  } else if (msg.includes("status") || msg.includes("track") || msg.includes("flight status")) {
    reply = "To track a flight, use the Flight Status section on the home page or visit /flight-status. Enter your SkyBook flight number (e.g. SK-101) to see schedule details.";
  } else if (msg.includes("cancel") || msg.includes("refund")) {
    reply = "To cancel a booking, find it in the My Bookings section and click 'Cancel Booking'. Seats will be released immediately. Note: Payment refund is not integrated in this demo.";
  } else if (msg.includes("seat") || msg.includes("cabin")) {
    reply = "Select a flight and use our interactive seat map to choose your preferred window or aisle seat. Rows 1-2 are Business class. No additional charge for seat selection in the SkyBook demo system.";
  } else if (msg.includes("find") || msg.includes("search") || msg.includes("book") || msg.includes("flight")) {
    reply = "Use the flight search at the top of the page! Enter your origin, destination, date, and number of travelers. Available routes include Mumbai, Delhi, Goa, Bengaluru, Hyderabad, Dubai, Singapore, Bangkok, and many more!";
  } else if (msg.includes("destination") || msg.includes("where")) {
    reply = "SkyBook connects 20+ destinations! India: Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Goa, Kochi, Ahmedabad, Jaipur, Lucknow, Srinagar, Varanasi. International: Dubai, Singapore, Bangkok, London, Paris, Kuala Lumpur, New York.";
  } else if (msg.includes("check in") || msg.includes("check-in")) {
    reply = "Online check-in is not available in SkyBook (demo platform). In a real system, check-in opens 48 hours before departure. Contact the actual airline for check-in services.";
  } else if (msg.includes("payment") || msg.includes("pay")) {
    reply = "SkyBook is a reservation demo — payment processing is not integrated. Bookings are confirmed with a PNR reference, but no actual payment is collected.";
  } else if (msg.includes("fare watch")) {
    reply = "Use Fare Watch (/fare-watches) to monitor price changes for specific flights. You'll receive a notification when a flight reaches your target price!";
  }

  res.json({ ok: true, reply });
});

// --------------------------------------------------
// ADMIN ROUTES
// --------------------------------------------------

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const row = db.prepare("SELECT id, passwordHash FROM users WHERE email = ?").get(email?.trim().toLowerCase());
    if (!row) return res.status(401).json({ ok: false, message: "Invalid credentials." });
    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) return res.status(401).json({ ok: false, message: "Invalid credentials." });
    const user = getUserById(row.id);
    if (user.role !== "ADMIN") return res.status(403).json({ ok: false, message: "Not authorized for admin access." });
    const token = jwt.sign({ id: row.id, email: row.email, role: "ADMIN" }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ ok: true, token, user });
  } catch {
    res.status(500).json({ ok: false, message: "Login failed." });
  }
});

// Admin dashboard
app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const sd = startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const ed = endDate || new Date().toISOString().slice(0, 10);

    const stats = {
      totalUsers: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
      totalFlights: db.prepare("SELECT COUNT(*) AS c FROM flights WHERE isActive = 1").get().c,
      activeFlights: db.prepare("SELECT COUNT(*) AS c FROM flights WHERE isActive = 1 AND DATE(departureDate) >= DATE('now')").get().c,
      totalBookings: db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE DATE(createdAt) BETWEEN ? AND ?").get(sd, ed).c,
      totalCancellations: db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE status = 'CANCELLED' AND DATE(createdAt) BETWEEN ? AND ?").get(sd, ed).c,
      totalRevenue: db.prepare("SELECT SUM(totalPrice) AS rev FROM bookings WHERE status = 'CONFIRMED' AND DATE(createdAt) BETWEEN ? AND ?").get(sd, ed).rev || 0,
      bookingStatusDistribution: {},
    };

    const statusDist = db.prepare("SELECT status, COUNT(*) AS c FROM bookings WHERE DATE(createdAt) BETWEEN ? AND ? GROUP BY status").all(sd, ed);
    statusDist.forEach(row => { stats.bookingStatusDistribution[row.status] = row.c; });

    const bookingTrend = db.prepare(`
      SELECT DATE(createdAt) AS date, COUNT(*) AS count
      FROM bookings WHERE DATE(createdAt) BETWEEN ? AND ?
      GROUP BY DATE(createdAt) ORDER BY date ASC
    `).all(sd, ed);

    const revenueTrend = db.prepare(`
      SELECT DATE(createdAt) AS date, SUM(totalPrice) AS revenue
      FROM bookings WHERE status = 'CONFIRMED' AND DATE(createdAt) BETWEEN ? AND ?
      GROUP BY DATE(createdAt) ORDER BY date ASC
    `).all(sd, ed);

    const popularDestinations = db.prepare(`
      SELECT f.destination, COUNT(b.id) AS bookingCount
      FROM bookings b LEFT JOIN flights f ON f.id = b.flightId
      WHERE DATE(b.createdAt) BETWEEN ? AND ?
      GROUP BY f.destination ORDER BY bookingCount DESC LIMIT 10
    `).all(sd, ed);

    const flights = db.prepare(`
      SELECT id, flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, price, status, availableSeats,
             CASE WHEN isActive = 1 THEN 1 ELSE 0 END AS isActive
      FROM flights ORDER BY departureDate DESC LIMIT 50
    `).all();

    const users = db.prepare("SELECT id, name, email, createdAt FROM users ORDER BY id DESC LIMIT 50").all().map(u => {
      const isAdmin = db.prepare("SELECT id FROM admins WHERE userId = ?").get(u.id);
      return { ...u, role: isAdmin ? "ADMIN" : "USER" };
    });

    const bookings = db.prepare(`
      SELECT b.id, b.pnr, b.passengerName AS passengerName, b.totalPrice, b.status, b.createdAt,
             f.origin, f.destination, u.name AS bookedByName
      FROM bookings b
      LEFT JOIN flights f ON f.id = b.flightId
      LEFT JOIN users u ON u.id = b.userId
      WHERE DATE(b.createdAt) BETWEEN ? AND ?
      ORDER BY b.id DESC LIMIT 100
    `).all(sd, ed);

    const cancellations = db.prepare(`
      SELECT b.id, b.pnr, b.status, b.createdAt,
             u.name AS bookedByName,
             f.origin, f.destination
      FROM bookings b
      LEFT JOIN flights f ON f.id = b.flightId
      LEFT JOIN users u ON u.id = b.userId
      WHERE b.status = 'CANCELLED' AND DATE(b.createdAt) BETWEEN ? AND ?
      ORDER BY b.id DESC LIMIT 50
    `).all(sd, ed);

    res.json({
      ok: true,
      stats, bookingTrend, revenueTrend, popularDestinations,
      flights, users, bookings, cancellations,
    });
  } catch (error) {
    console.error("ADMIN DASHBOARD ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to load admin dashboard." });
  }
});

app.post("/api/admin/flights", requireAdmin, (req, res) => {
  try {
    const { flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, price, status } = req.body;
    if (!flightNumber || !origin || !destination || !departureDate) {
      return res.status(400).json({ ok: false, message: "Flight number, origin, destination, and date are required." });
    }

    const result = db.prepare(`
      INSERT INTO flights (flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, price, status, availableSeats, isActive)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 32, 1)
    `).run(flightNumber, airline || "SkyBook Airlines", origin, destination, departureDate, departureTime || "08:00 AM", arrivalTime || "10:00 AM", Number(price) || 4999, status || "On Time");

    // Auto-generate seats
    const flightId = result.lastInsertRowid;
    const insertSeat = db.prepare("INSERT OR IGNORE INTO seats (flightId, travelDate, seatNumber, status) VALUES (?, ?, ?, 'available')");
    const cols = ["A", "B", "C", "D"];
    db.transaction(() => { for (let r = 1; r <= 8; r++) for (const c of cols) insertSeat.run(flightId, departureDate, `${c}${r}`); })();

    res.status(201).json({ ok: true, message: "Flight created with seat inventory.", flightId });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) return res.status(409).json({ ok: false, message: "A flight with this number and date already exists." });
    res.status(500).json({ ok: false, message: "Unable to create flight." });
  }
});

app.delete("/api/admin/flights/:id", requireAdmin, (req, res) => {
  try {
    db.prepare("UPDATE flights SET isActive = 0 WHERE id = ?").run(Number(req.params.id));
    res.json({ ok: true, message: "Flight deactivated." });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to deactivate flight." });
  }
});

// Dashboard stats (for non-admin My Dashboard widget)
app.get("/api/dashboard/stats", requireAuth, (req, res) => {
  try {
    const totalBookings = db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE userId = ?").get(req.user.id).c;
    const confirmedBookings = db.prepare("SELECT COUNT(*) AS c FROM bookings WHERE userId = ? AND status = 'CONFIRMED'").get(req.user.id).c;
    const totalFlights = db.prepare("SELECT COUNT(*) AS c FROM flights WHERE isActive = 1").get().c;
    res.json({ ok: true, totalBookings, confirmedBookings, totalFlights });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to load stats." });
  }
});

// --------------------------------------------------
// 404 / ERROR
// --------------------------------------------------

app.use("/api", (req, res) => {
  res.status(404).json({ ok: false, message: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.use((error, req, res, _next) => {
  console.error("SERVER ERROR:", error);
  res.status(500).json({ ok: false, message: "Internal server error." });
});

// --------------------------------------------------
// START
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(`🚀 SkyBook backend running on http://localhost:${PORT}`);
  console.log(`📦 Database: ${DB_PATH}`);
  console.log(`🔑 JWT auth: enabled`);
});

process.on("SIGINT", () => { db.close(); process.exit(0); });
process.on("SIGTERM", () => { db.close(); process.exit(0); });