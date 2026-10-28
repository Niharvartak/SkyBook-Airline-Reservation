/**
 * SkyBook – Express backend (MySQL / MariaDB edition)
 * Replaces the previous better-sqlite3 backend.
 * All API routes and response shapes are preserved.
 */

const express = require("express");
const cors    = require("cors");
const dotenv  = require("dotenv");
const path    = require("path");
const mysql   = require("mysql2/promise");
const jwt     = require("jsonwebtoken");
const bcrypt  = require("bcryptjs");
const { createRateLimiter } = require("./rate-limit");
const { ensureSchema, getUserById: getUserByIdDb } = require("./db-schema");
const { registerExtensions, minutesBetween, parseTimeToMinutes } = require("./extensions");
const { buildDbConfig } = require("./db-config");

// ─── Config ──────────────────────────────────────────────────────────────────
// Load project-root .env first, then local .env (local wins)
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config();

const app  = express();
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const SERVE_FRONTEND = /^(1|true|yes|on)$/i.test(String(process.env.SERVE_FRONTEND || ""));
const FRONTEND_DIST = path.join(__dirname, "../../dist");

const JWT_SECRET  = process.env.JWT_SECRET  || "skybook-default-secret-change-in-production";
const JWT_EXPIRES = "7d";

// Development-only administrator seed. Production bootstrap uses
// SKYBOOK_ADMIN_EMAIL / SKYBOOK_ADMIN_PASSWORD instead (see db-schema.js).
const DEV_ADMIN_EMAIL = "admin@skybook.com";
const DEV_ADMIN_PASSWORD = process.env.SKYBOOK_DEV_ADMIN_PASSWORD || "Admin@123";
const DEMO_CUSTOMER_PASSWORD = "demo123";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Calendar date in the server's timezone, matching MySQL CURDATE().
function localDateOnly(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

if (process.env.NODE_ENV === "production") {
  if (!process.env.JWT_SECRET || JWT_SECRET === "skybook-default-secret-change-in-production" || JWT_SECRET.length < 32) {
    console.error("❌ Refusing to start: set a strong JWT_SECRET (at least 32 characters) before running in production.");
    process.exit(1);
  }
}

// ─── MySQL Connection Pool ────────────────────────────────────────────────────
const pool = mysql.createPool(buildDbConfig({
  waitForConnections: true,
  connectionLimit   : 10,
  queueLimit        : 0,
}));

// Verify DB connection on startup
pool.getConnection()
  .then(conn => {
    console.log("✅ MySQL connected to database:", process.env.MYSQL_DATABASE || "skybook");
    conn.release();
  })
  .catch(err => {
    console.error("❌ MySQL connection FAILED:", err.message);
    console.error("   Check MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE in .env");
    process.exit(1);
  });

// ─── Middleware ───────────────────────────────────────────────────────────────
const corsOrigins = String(process.env.SKYBOOK_CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGIN || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
if (corsOrigins.length) {
  app.use(cors({ origin: corsOrigins }));
} else if (process.env.NODE_ENV === "production") {
  // Same-origin deployment (Nginx proxy): no cross-origin browser access by default.
  app.use(cors({ origin: false }));
} else {
  app.use(cors());
}
if (String(process.env.TRUST_PROXY || "") === "1") app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Brute-force protection for credential endpoints (single-process store).
app.use("/api/auth/register",        createRateLimiter({ windowMs: 60_000, max: 10 }));
app.use("/api/auth/login",           createRateLimiter({ windowMs: 60_000, max: 20 }));
app.use("/api/admin/login",          createRateLimiter({ windowMs: 60_000, max: 15 }));
app.use("/api/auth/forgot-password", createRateLimiter({ windowMs: 60_000, max: 5 }));
app.use("/api/auth/reset-password",  createRateLimiter({ windowMs: 60_000, max: 10 }));

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parsePositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function generatePNR() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pnr = "SKB-";
  for (let i = 0; i < 6; i++) pnr += chars[Math.floor(Math.random() * chars.length)];
  return pnr;
}

// Canonical cabin layouts. The main seeder builds a 180-seat cabin
// (6 columns × 30 rows) while legacy flights use 32 seats (4 columns × 8 rows).
// New seat rows follow whatever size the flight row already advertises so the
// seat map, the search availability count and the seats table stay in sync.
function seatLayout(totalSeats) {
  const total = Number(totalSeats) || 32;
  if (total >= 180) return { cols: ["A", "B", "C", "D", "E", "F"], rows: 30, total: 180 };
  return { cols: ["A", "B", "C", "D"], rows: 8, total: 32 };
}

async function getUserById(id) {
  return getUserByIdDb(pool, id);
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, message: "Authentication required. Please log in." });
  }
  const token = authHeader.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ ok: false, message: "Session expired or invalid. Please log in again." });
  }
  try {
    const user = await getUserById(payload.id);
    if (!user) return res.status(401).json({ ok: false, message: "Account not found. Please sign in again." });
    if (!user.isActive) return res.status(403).json({ ok: false, message: "This account has been deactivated. Contact support." });
    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (error) {
    console.error("AUTH LOOKUP ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to verify your session." });
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

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  try {
    const [[{ tableCount }]] = await pool.query(
      "SELECT COUNT(*) AS tableCount FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"
    );
    res.json({ ok: true, message: "SkyBook backend is running.", tables: tableCount, time: new Date().toISOString(), db: "mysql" });
  } catch (err) {
    console.error("HEALTH CHECK ERROR:", err);
    res.status(500).json({ ok: false, message: "Database error." });
  }
});

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (cleanName.length < 2 || cleanName.length > 120)
      return res.status(400).json({ ok: false, message: "Full name must be between 2 and 120 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail))
      return res.status(400).json({ ok: false, message: "Enter a valid email address." });
    if (!password || password.length < 6)
      return res.status(400).json({ ok: false, message: "Password must be at least 6 characters." });

    const [[existing]] = await pool.query("SELECT id FROM users WHERE email = ?", [cleanEmail]);
    if (existing) return res.status(409).json({ ok: false, message: "An account with this email already exists." });

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (name, email, passwordHash, isActive) VALUES (?, ?, ?, 1)",
      [cleanName, cleanEmail, passwordHash]
    );
    const user = await getUserById(result.insertId);
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

    const [[row]] = await pool.query(
      "SELECT id, name, email, passwordHash, isActive FROM users WHERE email = ?",
      [String(email).trim().toLowerCase()]
    );
    if (!row) return res.status(401).json({ ok: false, message: "Invalid email or password." });

    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) return res.status(401).json({ ok: false, message: "Invalid email or password." });
    if (!row.isActive) return res.status(403).json({ ok: false, message: "This account has been deactivated. Please contact support." });

    await pool.query("UPDATE users SET lastLogin = NOW() WHERE id = ?", [row.id]);
    const user  = await getUserById(row.id);
    const token = jwt.sign({ id: row.id, email: row.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ ok: true, message: "Login successful.", token, user });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ ok: false, message: "Login failed. Please try again." });
  }
});

// Legacy aliases
app.post("/api/login",    (req, res, next) => { req.url = "/api/auth/login";    next(); });
app.post("/api/register", (req, res, next) => { req.url = "/api/auth/register"; next(); });

app.get("/api/auth/profile", requireAuth, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: "User not found." });
  res.json({ ok: true, user });
});
app.get("/api/me",       requireAuth, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: "User not found." });
  res.json({ ok: true, user });
});
app.get("/api/auth/me",  requireAuth, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: "User not found." });
  res.json({ ok: true, user });
});

// ─── DESTINATIONS + AIRPORTS (static seed, DB-enrichable) ────────────────────
const DESTINATIONS = [
  // ── Indian Domestic ─────────────────────────────────────────────────────
  { code:"BOM", city:"Mumbai",              name:"Mumbai (BOM)",              airport:"Chhatrapati Shivaji Maharaj International Airport",  country:"India",       region:"domestic",      description:"India's financial capital and entertainment hub", emoji:"🌊" },
  { code:"DEL", city:"Delhi",               name:"Delhi (DEL)",               airport:"Indira Gandhi International Airport",                 country:"India",       region:"domestic",      description:"India's capital with iconic historic monuments",  emoji:"🏛️" },
  { code:"BLR", city:"Bengaluru",           name:"Bengaluru (BLR)",           airport:"Kempegowda International Airport",                   country:"India",       region:"domestic",      description:"Silicon Valley of India and garden city",         emoji:"🌿" },
  { code:"HYD", city:"Hyderabad",           name:"Hyderabad (HYD)",           airport:"Rajiv Gandhi International Airport",                 country:"India",       region:"domestic",      description:"City of Nizams and tech corridors",               emoji:"🕌" },
  { code:"MAA", city:"Chennai",             name:"Chennai (MAA)",             airport:"Chennai International Airport",                      country:"India",       region:"domestic",      description:"Gateway to South India and cultural hub",         emoji:"🏖️" },
  { code:"CCU", city:"Kolkata",             name:"Kolkata (CCU)",             airport:"Netaji Subhas Chandra Bose International Airport",   country:"India",       region:"domestic",      description:"City of joy and cultural heritage",               emoji:"🎭" },
  { code:"PNQ", city:"Pune",               name:"Pune (PNQ)",               airport:"Pune International Airport",                         country:"India",       region:"domestic",      description:"Oxford of the East and rising tech hub",          emoji:"📚" },
  { code:"AMD", city:"Ahmedabad",           name:"Ahmedabad (AMD)",           airport:"Sardar Vallabhbhai Patel International Airport",     country:"India",       region:"domestic",      description:"Heritage city and commercial centre of Gujarat",  emoji:"🏺" },
  { code:"GOI", city:"Goa",               name:"Goa (GOI)",               airport:"Goa International Airport (Dabolim)",                country:"India",       region:"domestic",      description:"Beach paradise and carnival capital of India",    emoji:"🌴" },
  { code:"COK", city:"Kochi",               name:"Kochi (COK)",               airport:"Cochin International Airport",                       country:"India",       region:"domestic",      description:"Queen of the Arabian Sea",                        emoji:"🚢" },
  { code:"JAI", city:"Jaipur",             name:"Jaipur (JAI)",             airport:"Jaipur International Airport",                       country:"India",       region:"domestic",      description:"Pink City of royal palaces and heritage",         emoji:"🏰" },
  { code:"LKO", city:"Lucknow",             name:"Lucknow (LKO)",             airport:"Chaudhary Charan Singh International Airport",       country:"India",       region:"domestic",      description:"City of nawabs, biryani and tehzeeb",             emoji:"🌹" },
  { code:"IXC", city:"Chandigarh",          name:"Chandigarh (IXC)",          airport:"Chandigarh Airport",                                 country:"India",       region:"domestic",      description:"City Beautiful in the foothills of Shivaliks",    emoji:"🌄" },
  { code:"IDR", city:"Indore",             name:"Indore (IDR)",             airport:"Devi Ahilyabai Holkar Airport",                      country:"India",       region:"domestic",      description:"Commercial capital of Madhya Pradesh",            emoji:"🏙️" },
  { code:"NAG", city:"Nagpur",             name:"Nagpur (NAG)",             airport:"Dr. Babasaheb Ambedkar International Airport",       country:"India",       region:"domestic",      description:"Orange city and zero mile of India",              emoji:"🍊" },
  { code:"SXR", city:"Srinagar",           name:"Srinagar (SXR)",           airport:"Sheikh ul-Alam International Airport",               country:"India",       region:"domestic",      description:"Paradise on earth in the Kashmir Valley",         emoji:"🏔️" },
  { code:"VNS", city:"Varanasi",           name:"Varanasi (VNS)",           airport:"Lal Bahadur Shastri International Airport",          country:"India",       region:"domestic",      description:"Spiritual capital on the banks of Ganga",         emoji:"🕯️" },
  { code:"BBI", city:"Bhubaneswar",         name:"Bhubaneswar (BBI)",         airport:"Biju Patnaik International Airport",                 country:"India",       region:"domestic",      description:"Temple city and IT hub of Odisha",                emoji:"🛕" },
  { code:"GAU", city:"Guwahati",           name:"Guwahati (GAU)",           airport:"Lokpriya Gopinath Bordoloi International Airport",   country:"India",       region:"domestic",      description:"Gateway to the North-East and Brahmaputra city",  emoji:"🌿" },
  { code:"PAT", city:"Patna",               name:"Patna (PAT)",               airport:"Jay Prakash Narayan International Airport",          country:"India",       region:"domestic",      description:"Ancient city of Pataliputra on the Ganga",        emoji:"🌊" },
  { code:"CJB", city:"Coimbatore",          name:"Coimbatore (CJB)",          airport:"Coimbatore International Airport",                   country:"India",       region:"domestic",      description:"Manchester of South India and textile hub",       emoji:"🏭" },
  { code:"TRV", city:"Thiruvananthapuram",  name:"Thiruvananthapuram (TRV)",  airport:"Trivandrum International Airport",                   country:"India",       region:"domestic",      description:"Capital of Kerala, space and IT city",            emoji:"🚀" },
  { code:"IXE", city:"Mangaluru",           name:"Mangaluru (IXE)",           airport:"Mangaluru International Airport",                    country:"India",       region:"domestic",      description:"Gateway to coastal Karnataka and coffee land",     emoji:"☕" },
  { code:"VTZ", city:"Visakhapatnam",       name:"Visakhapatnam (VTZ)",       airport:"Visakhapatnam Airport",                              country:"India",       region:"domestic",      description:"Jewel of the east coast and naval city",          emoji:"⚓" },
  { code:"ATQ", city:"Amritsar",           name:"Amritsar (ATQ)",           airport:"Sri Guru Ram Dass Jee International Airport",        country:"India",       region:"domestic",      description:"City of the Golden Temple and Wagah border",      emoji:"✨" },
  { code:"DED", city:"Dehradun",           name:"Dehradun (DED)",           airport:"Jolly Grant Airport",                                country:"India",       region:"domestic",      description:"Gateway to Uttarakhand hills and Mussoorie",      emoji:"🏔️" },
  { code:"IXR", city:"Ranchi",             name:"Ranchi (IXR)",             airport:"Birsa Munda Airport",                                country:"India",       region:"domestic",      description:"Capital of Jharkhand and city of waterfalls",     emoji:"💦" },
  { code:"RPR", city:"Raipur",             name:"Raipur (RPR)",             airport:"Swami Vivekananda Airport",                          country:"India",       region:"domestic",      description:"Capital of Chhattisgarh and the rice bowl",       emoji:"🌾" },
  { code:"STV", city:"Surat",               name:"Surat (STV)",               airport:"Surat Airport",                                      country:"India",       region:"domestic",      description:"Diamond city and textile export hub of India",     emoji:"💎" },
  { code:"BDQ", city:"Vadodara",           name:"Vadodara (BDQ)",           airport:"Vadodara Airport",                                   country:"India",       region:"domestic",      description:"Cultural capital of Gujarat",                      emoji:"🎨" },
  // ── International ───────────────────────────────────────────────────────
  { code:"DXB", city:"Dubai",               name:"Dubai (DXB)",               airport:"Dubai International Airport",                        country:"UAE",         region:"international", description:"City of the future and global luxury hub",        emoji:"🏙️" },
  { code:"AUH", city:"Abu Dhabi",           name:"Abu Dhabi (AUH)",           airport:"Abu Dhabi International Airport",                    country:"UAE",         region:"international", description:"Capital of UAE and Formula 1 host city",          emoji:"🏎️" },
  { code:"SIN", city:"Singapore",           name:"Singapore (SIN)",           airport:"Singapore Changi Airport",                          country:"Singapore",   region:"international", description:"Garden city and world's best aviation hub",       emoji:"✨" },
  { code:"BKK", city:"Bangkok",             name:"Bangkok (BKK)",             airport:"Suvarnabhumi Airport",                               country:"Thailand",    region:"international", description:"City of Angels with magnificent temples",          emoji:"🛕" },
  { code:"KUL", city:"Kuala Lumpur",        name:"Kuala Lumpur (KUL)",        airport:"Kuala Lumpur International Airport",                 country:"Malaysia",    region:"international", description:"Twin Towers and vibrant multicultural capital",    emoji:"🗼" },
  { code:"LHR", city:"London",             name:"London (LHR)",             airport:"Heathrow Airport",                                   country:"UK",          region:"international", description:"Historic capital and global financial powerhouse", emoji:"💂" },
  { code:"CDG", city:"Paris",               name:"Paris (CDG)",               airport:"Charles de Gaulle Airport",                          country:"France",      region:"international", description:"City of love, art and haute cuisine",             emoji:"🗼" },
  { code:"JFK", city:"New York",           name:"New York (JFK)",           airport:"John F. Kennedy International Airport",              country:"USA",         region:"international", description:"The city that never sleeps",                      emoji:"🗽" },
  { code:"FRA", city:"Frankfurt",           name:"Frankfurt (FRA)",           airport:"Frankfurt Airport",                                  country:"Germany",     region:"international", description:"Financial capital of Europe",                      emoji:"🏦" },
  { code:"DOH", city:"Doha",               name:"Doha (DOH)",               airport:"Hamad International Airport",                        country:"Qatar",       region:"international", description:"FIFA World Cup city and Middle East hub",          emoji:"⚽" },
  { code:"MCT", city:"Muscat",             name:"Muscat (MCT)",             airport:"Muscat International Airport",                       country:"Oman",        region:"international", description:"Ancient capital of the Sultanate of Oman",        emoji:"🏛️" },
  { code:"CMB", city:"Colombo",             name:"Colombo (CMB)",             airport:"Bandaranaike International Airport",                 country:"Sri Lanka",   region:"international", description:"Pearl of the Indian Ocean",                        emoji:"💎" },
  { code:"KTM", city:"Kathmandu",           name:"Kathmandu (KTM)",           airport:"Tribhuvan International Airport",                    country:"Nepal",       region:"international", description:"Gateway to the Himalayas and Mount Everest",      emoji:"🏔️" },
  { code:"MLE", city:"Male",               name:"Male (MLE)",               airport:"Velana International Airport",                       country:"Maldives",    region:"international", description:"Tropical paradise of turquoise lagoons",          emoji:"🏖️" },
  { code:"HKG", city:"Hong Kong",           name:"Hong Kong (HKG)",           airport:"Hong Kong International Airport",                    country:"Hong Kong",   region:"international", description:"Asia's world city and financial powerhouse",      emoji:"🌃" },
  { code:"HND", city:"Tokyo",               name:"Tokyo (HND)",               airport:"Tokyo Haneda Airport",                               country:"Japan",       region:"international", description:"Land of the rising sun and bullet trains",        emoji:"🗻" },
  { code:"ICN", city:"Seoul",               name:"Seoul (ICN)",               airport:"Incheon International Airport",                      country:"South Korea", region:"international", description:"K-pop capital and tech powerhouse",               emoji:"🎵" },
  { code:"IST", city:"Istanbul",           name:"Istanbul (IST)",           airport:"Istanbul Airport",                                   country:"Turkey",      region:"international", description:"Bridge between East and West civilisations",      emoji:"🕌" },
  { code:"ZRH", city:"Zurich",             name:"Zurich (ZRH)",             airport:"Zurich Airport",                                     country:"Switzerland", region:"international", description:"Pristine Alpine city and global banking hub",     emoji:"🏔️" },
  { code:"AMS", city:"Amsterdam",           name:"Amsterdam (AMS)",           airport:"Amsterdam Schiphol Airport",                         country:"Netherlands", region:"international", description:"City of canals and world-class museums",          emoji:"🌷" },
  { code:"JED", city:"Jeddah",             name:"Jeddah (JED)",             airport:"King Abdulaziz International Airport",               country:"Saudi Arabia", region:"international", description:"Gateway to Makkah and Red Sea city",              emoji:"🕌" },
  { code:"RUH", city:"Riyadh",             name:"Riyadh (RUH)",             airport:"King Khalid International Airport",                  country:"Saudi Arabia", region:"international", description:"Capital of Saudi Arabia and NEOM gateway",        emoji:"🏙️" },
  { code:"MRU", city:"Mauritius",           name:"Mauritius (MRU)",           airport:"Sir Seewoosagur Ramgoolam International Airport",    country:"Mauritius",   region:"international", description:"Island paradise of white beaches and coral reefs",emoji:"🌊" },
  { code:"PER", city:"Perth",               name:"Perth (PER)",               airport:"Perth Airport",                                      country:"Australia",   region:"international", description:"Sunniest Australian city on the Indian Ocean",    emoji:"☀️" },
  { code:"SYD", city:"Sydney",             name:"Sydney (SYD)",             airport:"Sydney Kingsford Smith Airport",                     country:"Australia",   region:"international", description:"Opera House city and Harbour of wonders",         emoji:"🎭" },
  { code:"MEL", city:"Melbourne",           name:"Melbourne (MEL)",           airport:"Melbourne Airport",                                  country:"Australia",   region:"international", description:"Cultural capital and coffee city of Australia",    emoji:"☕" },
];
app.get("/api/destinations", async (_req, res) => {
  try {
    const [airports] = await pool.query(
      `SELECT code, city, airportName AS airport, country, region, description, emoji
       FROM airports WHERE isActive = 1 ORDER BY region DESC, city ASC`
    );
    if (airports.length === 0) return res.json({ ok: true, destinations: DESTINATIONS, fallback: true });
    res.json({
      ok: true,
      destinations: airports.map(a => {
        const dest = DESTINATIONS.find(d => d.code === a.code);
        return { ...a, name: `${a.city} (${a.code})`, description: a.description || dest?.description || "", emoji: a.emoji || dest?.emoji || "✈️" };
      }),
    });
  } catch {
    res.json({ ok: true, destinations: DESTINATIONS, fallback: true });
  }
});

// ─── AIRPORTS (DB-backed with static fallback) ────────────────────────────────
app.get("/api/airports", async (req, res) => {
  try {
    const { region } = req.query;
    const params = [];
    let sql = `SELECT code, city, airportName AS airport, country, timezone, region, description, emoji
               FROM airports WHERE isActive = 1 ORDER BY region DESC, country ASC, city ASC`;
    if (region) {
      sql = `SELECT code, city, airportName AS airport, country, timezone, region, description, emoji
             FROM airports WHERE isActive = 1 AND region = ? ORDER BY country ASC, city ASC`;
      params.push(region);
    }
    const [airports] = await pool.query(sql, params);
    if (airports.length === 0) {
      // Table exists but is empty (e.g. fresh Docker seed) — fall back to static list
      const fallback = DESTINATIONS
        .filter(d => !region || d.region === region)
        .map(d => ({ code: d.code, city: d.city, airport: d.airport, country: d.country,
                     timezone: "UTC", region: d.region, name: d.name, emoji: d.emoji, description: d.description }));
      return res.json({ ok: true, airports: fallback, fallback: true });
    }
    const enriched = airports.map(a => {
      const dest = DESTINATIONS.find(d => d.code === a.code);
      return {
        ...a,
        name       : `${a.city} (${a.code})`,
        emoji      : a.emoji       || dest?.emoji       || "✈️",
        description: a.description || dest?.description || "",
      };
    });
    res.json({ ok: true, airports: enriched });
  } catch {
    // Fallback to static DESTINATIONS when airports table not available
    const enriched = DESTINATIONS
      .filter(d => !region || d.region === region)
      .map(d => ({ code: d.code, city: d.city, airport: d.airport, country: d.country,
                   timezone: "UTC", region: d.region, name: d.name, emoji: d.emoji, description: d.description }));
    res.json({ ok: true, airports: enriched, fallback: true });
  }
});

// ─── FLIGHT SEARCH ────────────────────────────────────────────────────────────
app.get("/api/flights/search", async (req, res) => {
  try {
    const { from, to, departureDate, passengers = "1" } = req.query;
    if (!from || !to) return res.status(400).json({ ok: false, message: "Origin and destination are required.", flights: [] });
    if (from.trim().toLowerCase() === to.trim().toLowerCase())
      return res.status(400).json({ ok: false, message: "Origin and destination must be different.", flights: [] });

    let sql = `
      SELECT f.id, f.flightNumber, f.airline, f.origin, f.destination,
             f.departureDate, f.departureTime, f.arrivalTime, f.price, f.status,
             f.availableSeats, f.isActive, f.durationMinutes, f.stops, f.aircraft,
             f.baggageAllowance, f.cabinClasses, f.terminal, f.gate, f.baggageBelt,
             (SELECT COUNT(*) FROM seats s WHERE s.flightId = f.id AND s.travelDate = f.departureDate) AS seatRowCount,
             (SELECT COUNT(*) FROM seats s WHERE s.flightId = f.id AND s.travelDate = f.departureDate AND s.status = 'available') AS liveSeats
      FROM flights f
      WHERE f.origin LIKE ? AND f.destination LIKE ? AND f.isActive = 1
    `;
    const params = [`%${from.trim()}%`, `%${to.trim()}%`];

    if (departureDate) {
      sql += " AND DATE(f.departureDate) = DATE(?)";
      params.push(departureDate);
    } else {
      sql += " AND f.departureDate >= CURDATE()";
    }
    sql += " ORDER BY f.departureDate ASC, f.departureTime ASC LIMIT 50";

    const [rows] = await pool.query(sql, params);
    const flights = rows.map(f => {
      const durationMinutes = Number(f.durationMinutes) || minutesBetween(f.departureTime, f.arrivalTime) || null;
      return {
        ...f,
        durationMinutes,
        stops: Number(f.stops) || 0,
        // When a flight has no seat rows yet, trust the denormalised column
        // instead of the (empty) live count, otherwise it looks sold out.
        availableSeats: f.seatRowCount > 0 ? f.liveSeats : (f.availableSeats ?? 32),
        cabinPrices: {
          Economy: Number(f.price),
          Business: Math.round(Number(f.price) * 2.5),
        },
        liveSeats: undefined,
        seatRowCount: undefined,
      };
    });
    res.json({ ok: true, flights });
  } catch (error) {
    console.error("FLIGHT SEARCH ERROR:", error);
    res.status(500).json({ ok: false, message: "Flight search failed.", flights: [] });
  }
});

// Flight catalog
app.get("/api/flights/catalog", async (req, res) => {
  try {
    const [flights] = await pool.query(`
      SELECT id, flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime,
             price, status, availableSeats, isActive, durationMinutes, stops, aircraft,
             baggageAllowance, cabinClasses
      FROM flights WHERE isActive = 1 AND departureDate >= CURDATE()
      ORDER BY departureDate ASC, flightNumber ASC LIMIT 500
    `);
    res.json({ ok: true, flights });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load flight catalog.", flights: [] });
  }
});

// Flight status
app.get("/api/flights/status", async (req, res) => {
  try {
    const { flightNumber } = req.query;
    if (!flightNumber) return res.status(400).json({ ok: false, message: "Flight number is required." });
    const [[flight]] = await pool.query(`
      SELECT id, flightNumber, airline, origin, destination, departureDate, departureTime,
             arrivalTime, status, terminal, gate, baggageBelt
      FROM flights WHERE flightNumber = ?
      ORDER BY ABS(DATEDIFF(departureDate, CURDATE())) ASC LIMIT 1
    `, [flightNumber.trim()]);
    if (!flight) return res.status(404).json({ ok: false, message: `Flight ${flightNumber} was not found.` });
    res.json({ ok: true, flight: { ...flight, statusSource: "SkyBook schedule data. Gate, terminal and belt are shown only when set by operations." } });
  } catch (error) {
    console.error("STATUS ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to look up flight status." });
  }
});

// Flight details + seat map
app.get("/api/flights/:id", async (req, res) => {
  try {
    const flightId = parsePositiveId(req.params.id);
    if (!flightId) return res.status(400).json({ ok: false, message: "Flight id must be a positive integer." });
    const [[flight]] = await pool.query("SELECT * FROM flights WHERE id = ?", [flightId]);
    if (!flight) return res.status(404).json({ ok: false, message: "Flight not found." });

    const travelDate = flight.departureDate instanceof Date
      ? flight.departureDate.toISOString().slice(0, 10)
      : String(flight.departureDate);

    let [seats] = await pool.query("SELECT * FROM seats WHERE flightId = ? AND travelDate = ?", [flightId, travelDate]);

    if (seats.length === 0) {
      const layout = seatLayout(flight.availableSeats);
      const rows = [];
      for (let r = 1; r <= layout.rows; r++) for (const c of layout.cols) rows.push([flightId, travelDate, `${c}${r}`, "available"]);
      await pool.query("INSERT IGNORE INTO seats (flightId, travelDate, seatNumber, status) VALUES ?", [rows]);
      [seats] = await pool.query("SELECT * FROM seats WHERE flightId = ? AND travelDate = ?", [flightId, travelDate]);
    }

    const seatCols = [...new Set(seats.map(s => String(s.seatNumber).replace(/\d/g, "")))].sort();
    const firstCol = seatCols[0], lastCol = seatCols[seatCols.length - 1];
    const midIdx = Math.ceil(seatCols.length / 2);
    const leftAisle = seatCols[midIdx - 1], rightAisle = seatCols[midIdx];

    const seatMap = seats.map(s => {
      const row = parseInt(String(s.seatNumber).replace(/\D/g, ""), 10);
      const col = String(s.seatNumber).replace(/\d/g, "");
      return {
        seatNumber: s.seatNumber,
        status: s.status,
        row,
        col,
        isWindow: col === firstCol || col === lastCol,
        isAisle: col === leftAisle || col === rightAisle,
        cabinClass: row <= 2 ? "Business" : "Economy",
      };
    });

    res.json({ ok: true, flight: { ...flight, seats: seatMap, availableSeats: seats.filter(s => s.status === "available").length } });
  } catch (error) {
    console.error("FLIGHT DETAILS ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to load flight details." });
  }
});

// ─── BOOKINGS ─────────────────────────────────────────────────────────────────
app.get("/api/bookings", requireAuth, async (req, res) => {
  try {
    const [bookings] = await pool.query(`
      SELECT b.id, b.pnr, b.travelDate AS departureDate, b.passengerName, b.passengerCount,
             b.seatNumbers, b.totalPrice, b.status, b.createdAt, b.contactEmail, b.contactPhone,
             b.passengers, b.promoCode, b.cabinClass, b.baseFare, b.taxes, b.discountAmount,
             b.cancelledAt, b.cancelledBy,
             f.flightNumber, f.airline, f.origin, f.destination, f.departureTime, f.arrivalTime
      FROM bookings b LEFT JOIN flights f ON f.id = b.flightId
      WHERE b.userId = ? ORDER BY b.id DESC
    `, [req.user.id]);

    const mapped = bookings.map(b => ({
      ...b,
      seatNumbers: (() => { try { return typeof b.seatNumbers === "string" ? JSON.parse(b.seatNumbers || "[]") : (b.seatNumbers || []); } catch { return []; } })(),
      passengers:  (() => { try { return typeof b.passengers  === "string" ? JSON.parse(b.passengers  || "null") : (b.passengers || null); } catch { return null; } })(),
    }));
    res.json({ ok: true, bookings: mapped });
  } catch (error) {
    console.error("BOOKINGS ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to load bookings.", bookings: [] });
  }
});

app.post("/api/bookings", requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  const release = () => { try { conn.release(); } catch {} };
  try {
    await conn.beginTransaction();
    const {
      flightId, travelDate: travelDateRaw, passengerName, passengers, contactEmail, contactPhone,
      seatNumbers, travelers, promoCode, cabinClass,
    } = req.body;

    // Accept both "YYYY-MM-DD" and full ISO timestamps, but always query the DATE column with a date.
    const travelDate = String(travelDateRaw || "").slice(0, 10);
    if (!flightId)    { await conn.rollback(); return res.status(400).json({ ok: false, message: "Flight ID is required." }); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
      await conn.rollback();
      return res.status(400).json({ ok: false, message: "Enter a valid travel date." });
    }
    if (!passengerName || !String(passengerName).trim()) {
      await conn.rollback();
      return res.status(400).json({ ok: false, message: "Passenger name is required." });
    }
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(contactEmail).trim())) {
      await conn.rollback();
      return res.status(400).json({ ok: false, message: "Enter a valid contact email address." });
    }
    if (contactPhone && !/^[+\d][\d\s()-]{6,24}$/.test(String(contactPhone).trim())) {
      await conn.rollback();
      return res.status(400).json({ ok: false, message: "Enter a valid contact phone number." });
    }

    const [[flight]] = await conn.query("SELECT * FROM flights WHERE id = ? FOR UPDATE", [Number(flightId)]);
    if (!flight) { await conn.rollback(); return res.status(404).json({ ok: false, message: "Flight not found." }); }
    if (!flight.isActive) { await conn.rollback(); return res.status(409).json({ ok: false, message: "This flight is no longer available." }); }

    const flightDay = flight.departureDate instanceof Date
      ? flight.departureDate.toISOString().slice(0, 10)
      : String(flight.departureDate).slice(0, 10);
    if (String(travelDate).slice(0, 10) !== flightDay) {
      await conn.rollback();
      return res.status(400).json({ ok: false, message: "Travel date must match the selected flight's departure date." });
    }

    const requestedCabin = String(cabinClass || "Economy").trim();
    const cabin = requestedCabin.toLowerCase() === "business" ? "Business" : "Economy";
    const cabinMultiplier = cabin === "Business" ? 2.5 : 1;

    const seatsArray = Array.isArray(seatNumbers)
      ? seatNumbers.map(String)
      : (() => { try { return seatNumbers ? JSON.parse(seatNumbers) : []; } catch { return []; } })();
    const travelerCount = Math.max(1, Math.min(9, Number(travelers) || seatsArray.length || 1));
    if (!seatsArray.length) {
      await conn.rollback();
      return res.status(400).json({ ok: false, message: "Select at least one seat." });
    }
    if (seatsArray.length !== travelerCount) {
      await conn.rollback();
      return res.status(400).json({ ok: false, message: `Select exactly ${travelerCount} seat(s) for ${travelerCount} traveller(s).` });
    }
    if (new Set(seatsArray).size !== seatsArray.length) {
      await conn.rollback();
      return res.status(400).json({ ok: false, message: "Duplicate seats are not allowed." });
    }

    const [[liveSeatRow]] = await conn.query(
      `SELECT COUNT(*) AS c FROM seats
       WHERE flightId = ? AND travelDate = ? AND status = 'available'`,
      [Number(flightId), travelDate]
    );
    if (Number(liveSeatRow.c) < seatsArray.length) {
      await conn.rollback();
      return res.status(409).json({ ok: false, message: "Not enough seats are available on this flight." });
    }

    // Seat availability check (row locks prevent two concurrent bookings)
    for (const seat of seatsArray) {
      const [[seatRow]] = await conn.query(
        "SELECT status FROM seats WHERE flightId = ? AND travelDate = ? AND seatNumber = ? FOR UPDATE",
        [Number(flightId), travelDate, seat]
      );
      if (!seatRow) {
        await conn.rollback();
        return res.status(409).json({ ok: false, message: `Seat ${seat} does not exist on this flight.` });
      }
      if (seatRow.status !== "available") {
        await conn.rollback();
        return res.status(409).json({ ok: false, message: `Seat ${seat} is no longer available.` });
      }
      const seatCabin = parseInt(String(seat).replace(/\D/g, ""), 10) <= 2 ? "Business" : "Economy";
      if (seatCabin !== cabin) {
        await conn.rollback();
        return res.status(400).json({ ok: false, message: `Seat ${seat} is in ${seatCabin}, but ${cabin} was selected.` });
      }
    }

    const baseFare = Math.round(Number(flight.price) * cabinMultiplier * travelerCount);

    const promo = String(promoCode || "").trim().toUpperCase();
    let discount = 0;
    let isIntl = false;
    const codes = [...`${flight.origin} ${flight.destination}`.matchAll(/\(([A-Z]{3})\)/g)].map(m => m[1]);
    if (codes.length) {
      const [airportRows] = await conn.query(
        "SELECT region FROM airports WHERE code IN (?)",
        [codes]
      );
      isIntl = airportRows.some(row => row.region === "international");
    }

    if      (promo === "FLYINDIA" && !isIntl) discount = Math.round(baseFare * 0.3);
    else if (promo === "WELCOME")             discount = Math.min(1000, baseFare);
    else if (promo === "WORLD20" && isIntl)   discount = Math.round(baseFare * 0.2);
    const taxable = Math.max(0, baseFare - discount);
    const taxes = 0; // fares are advertised as all-inclusive sample fares
    const totalPrice = Math.max(0, taxable + taxes);

    let pnr, attempts = 0;
    do {
      pnr = generatePNR();
      const [[ex]] = await conn.query("SELECT id FROM bookings WHERE pnr = ?", [pnr]);
      if (!ex) break;
    } while (++attempts < 10);
    if (!pnr) { await conn.rollback(); return res.status(500).json({ ok: false, message: "Unable to generate a booking reference." }); }

    const [result] = await conn.query(`
      INSERT INTO bookings
        (userId, flightId, travelDate, passengerName, passengerCount, seatNumbers, totalPrice,
         pnr, status, contactEmail, contactPhone, passengers, promoCode, cabinClass,
         baseFare, taxes, discountAmount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.user.id, Number(flightId), travelDate, String(passengerName).trim(), travelerCount,
        JSON.stringify(seatsArray), totalPrice, pnr,
        contactEmail ? String(contactEmail).trim() : null,
        contactPhone ? String(contactPhone).trim() : null,
        typeof passengers === "string" ? passengers : JSON.stringify(passengers || null),
        promo || null, cabin, baseFare, taxes, discount]);

    const bookingId = result.insertId;

    for (const seat of seatsArray) {
      const [seatUpdate] = await conn.query(
        "UPDATE seats SET status = 'booked', bookingId = ? WHERE flightId = ? AND travelDate = ? AND seatNumber = ? AND status = 'available'",
        [bookingId, Number(flightId), travelDate, seat]
      );
      if (seatUpdate.affectedRows !== 1) {
        await conn.rollback();
        return res.status(409).json({ ok: false, message: `Seat ${seat} was taken while booking. Please choose another seat.` });
      }
    }

    await conn.query(
      "UPDATE flights SET availableSeats = GREATEST(0, availableSeats - ?) WHERE id = ?",
      [seatsArray.length, Number(flightId)]
    );

    try {
      await conn.query(
        "INSERT INTO notifications (userId, title, message, type, link) VALUES (?, ?, ?, 'booking', ?)",
        [req.user.id, "Booking Confirmed",
         `Your booking ${pnr} for ${flight.flightNumber} (${flight.origin} → ${flight.destination}) on ${flightDay} has been confirmed.`,
         "/dashboard"]
      );
    } catch {}

    await conn.commit();

    res.status(201).json({
      ok: true,
      message: "Booking confirmed!",
      booking: {
        id: bookingId, pnr, flightId: Number(flightId),
        flightNumber: flight.flightNumber, airline: flight.airline,
        origin: flight.origin, destination: flight.destination,
        departureDate: flightDay, departureTime: flight.departureTime, arrivalTime: flight.arrivalTime,
        passengerName, passengerCount: travelerCount, seatNumbers: seatsArray,
        totalPrice, discount, promoCode: promo || null, cabinClass: cabin, status: "CONFIRMED",
        fareBreakdown: { baseFare, taxes, discount, total: totalPrice, cabinClass: cabin },
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    console.error("CREATE BOOKING ERROR:", error);
    res.status(500).json({ ok: false, message: "Booking failed. Please try again." });
  } finally {
    release();
  }
});

app.post("/api/bookings/:id/cancel", requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const bookingId = Number(req.params.id);
    await conn.beginTransaction();
    const [[booking]] = await conn.query(
      `SELECT b.*, f.departureTime, f.flightNumber, f.origin, f.destination
       FROM bookings b LEFT JOIN flights f ON f.id = b.flightId
       WHERE b.id = ? AND b.userId = ? FOR UPDATE`,
      [bookingId, req.user.id]
    );
    if (!booking) { await conn.rollback(); return res.status(404).json({ ok: false, message: "Booking not found." }); }
    if (booking.status === "CANCELLED") { await conn.rollback(); return res.status(400).json({ ok: false, message: "Booking is already cancelled." }); }
    if (booking.status === "COMPLETED") { await conn.rollback(); return res.status(400).json({ ok: false, message: "Completed trips cannot be cancelled." }); }

    const [[settingRow]] = await conn.query(
      "SELECT settingValue FROM app_settings WHERE settingKey = 'cancellation_window_hours' LIMIT 1"
    );
    const windowHours = Math.max(0, Number(settingRow?.settingValue ?? 2) || 0);
    const day = booking.travelDate instanceof Date
      ? booking.travelDate.toISOString().slice(0, 10)
      : String(booking.travelDate).slice(0, 10);
    const minutes = parseTimeToMinutes(booking.departureTime);
    const departure = minutes == null ? null : new Date(`${day}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`);
    if (!departure || Number.isNaN(departure.getTime())) {
      await conn.rollback();
      return res.status(409).json({ ok: false, message: "The departure time for this booking is unavailable. Please contact support." });
    }
    const hoursUntilDeparture = (departure.getTime() - Date.now()) / 3_600_000;
    if (hoursUntilDeparture <= 0) {
      await conn.rollback();
      return res.status(409).json({ ok: false, message: "This flight has already departed and cannot be cancelled online." });
    }
    if (hoursUntilDeparture < windowHours) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        message: `Online cancellation closes ${windowHours} hour(s) before departure. Please contact support.`,
        hoursUntilDeparture: Math.round(hoursUntilDeparture * 100) / 100,
        cancellationWindowHours: windowHours,
      });
    }

    await conn.query(
      "UPDATE bookings SET status = 'CANCELLED', cancelledAt = NOW(), cancelledBy = 'CUSTOMER' WHERE id = ?",
      [bookingId]
    );

    const seatsArray = (() => { try { return typeof booking.seatNumbers === "string" ? JSON.parse(booking.seatNumbers || "[]") : (booking.seatNumbers || []); } catch { return []; } })();
    for (const seat of seatsArray) {
      await conn.query(
        "UPDATE seats SET status = 'available', bookingId = NULL WHERE flightId = ? AND travelDate = ? AND seatNumber = ?",
        [booking.flightId, booking.travelDate, seat]
      );
    }
    if (seatsArray.length) {
      await conn.query("UPDATE flights SET availableSeats = availableSeats + ? WHERE id = ?", [seatsArray.length, booking.flightId]);
    }

    try {
      await conn.query(
        "INSERT INTO notifications (userId, title, message, type, link) VALUES (?, ?, ?, 'cancellation', ?)",
        [req.user.id, "Booking Cancelled", `Your booking ${booking.pnr} has been cancelled and seats released.`, "/dashboard"]
      );
    } catch {}

    await conn.commit();
    res.json({
      ok: true,
      message: "Booking cancelled and seats released.",
      refund: {
        status: "not-applicable",
        reason: "No payment was collected because no payment gateway is integrated.",
      },
    });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    console.error("CANCEL ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to cancel booking." });
  } finally {
    conn.release();
  }
});

// ─── FARE WATCHES ─────────────────────────────────────────────────────────────
app.get("/api/fare-watches", requireAuth, async (req, res) => {
  try {
    const [watches] = await pool.query(`
      SELECT fw.*, f.flightNumber, f.airline, f.origin AS routeOrigin, f.destination AS routeDestination,
             f.departureDate, f.departureTime, f.arrivalTime
      FROM fare_watches fw LEFT JOIN flights f ON f.id = fw.flightId
      WHERE fw.userId = ? ORDER BY fw.id DESC
    `, [req.user.id]);

    const result = await Promise.all(watches.map(async w => {
      const [snapshots] = await pool.query(
        "SELECT price, observedAt FROM fare_watch_snapshots WHERE fareWatchId = ? ORDER BY observedAt DESC LIMIT 10", [w.id]
      );
      return { ...w, snapshots };
    }));
    res.json({ ok: true, fareWatches: result });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load fare watches.", fareWatches: [] });
  }
});

app.post("/api/fare-watches", requireAuth, async (req, res) => {
  try {
    const { flightId, targetPrice } = req.body;
    if (!flightId) return res.status(400).json({ ok: false, message: "Flight ID is required." });
    const [[flight]] = await pool.query("SELECT * FROM flights WHERE id = ?", [Number(flightId)]);
    if (!flight) return res.status(404).json({ ok: false, message: "Flight not found." });
    const [[existing]] = await pool.query("SELECT id FROM fare_watches WHERE userId = ? AND flightId = ?", [req.user.id, Number(flightId)]);
    if (existing) return res.status(409).json({ ok: false, message: "You are already watching this flight." });

    const [result] = await pool.query(
      "INSERT INTO fare_watches (userId, flightId, currentPrice, targetPrice, trend) VALUES (?, ?, ?, ?, 'stable')",
      [req.user.id, Number(flightId), flight.price, targetPrice ? Number(targetPrice) : null]
    );
    await pool.query("INSERT INTO fare_watch_snapshots (fareWatchId, price) VALUES (?, ?)", [result.insertId, flight.price]);
    res.status(201).json({ ok: true, message: "Fare watch created." });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to create fare watch." });
  }
});

app.post("/api/fare-watches/check", requireAuth, async (req, res) => {
  try {
    const [watches] = await pool.query(
      "SELECT fw.*, f.price AS latestPrice FROM fare_watches fw LEFT JOIN flights f ON f.id = fw.flightId WHERE fw.userId = ?",
      [req.user.id]
    );
    for (const w of watches) {
      const newPrice = w.latestPrice || w.currentPrice;
      const change   = newPrice - w.currentPrice;
      const trend    = change > 0 ? "up" : change < 0 ? "down" : "stable";
      const triggered = w.targetPrice ? newPrice <= w.targetPrice : 0;
      await pool.query(
        "UPDATE fare_watches SET previousPrice = currentPrice, currentPrice = ?, priceChange = ?, trend = ?, alertTriggered = ? WHERE id = ?",
        [newPrice, change, trend, triggered ? 1 : 0, w.id]
      );
      await pool.query("INSERT INTO fare_watch_snapshots (fareWatchId, price) VALUES (?, ?)", [w.id, newPrice]);
    }
    const [updated] = await pool.query(`
      SELECT fw.*, f.flightNumber, f.airline, f.origin AS routeOrigin, f.destination AS routeDestination, f.departureDate, f.departureTime, f.arrivalTime
      FROM fare_watches fw LEFT JOIN flights f ON f.id = fw.flightId WHERE fw.userId = ? ORDER BY fw.id DESC
    `, [req.user.id]);
    const result = await Promise.all(updated.map(async w => {
      const [snapshots] = await pool.query("SELECT price, observedAt FROM fare_watch_snapshots WHERE fareWatchId = ? ORDER BY observedAt DESC LIMIT 10", [w.id]);
      return { ...w, snapshots };
    }));
    res.json({ ok: true, message: "Fare observations updated.", fareWatches: result });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to check fares." });
  }
});

app.delete("/api/fare-watches/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[w]] = await pool.query("SELECT id FROM fare_watches WHERE id = ? AND userId = ?", [id, req.user.id]);
    if (!w) return res.status(404).json({ ok: false, message: "Fare watch not found." });
    await pool.query("DELETE FROM fare_watch_snapshots WHERE fareWatchId = ?", [id]);
    await pool.query("DELETE FROM fare_watches WHERE id = ?", [id]);
    res.json({ ok: true, message: "Fare watch removed." });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to remove fare watch." });
  }
});

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const [items] = await pool.query("SELECT * FROM notifications WHERE userId = ? ORDER BY id DESC LIMIT 50", [req.user.id]);
    res.json({ ok: true, notifications: items });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to load notifications.", notifications: [] });
  }
});
app.put("/api/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    await pool.query("UPDATE notifications SET `read` = 1 WHERE id = ? AND userId = ?", [Number(req.params.id), req.user.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ ok: false }); }
});
app.put("/api/notifications/read-all", requireAuth, async (req, res) => {
  try {
    await pool.query("UPDATE notifications SET `read` = 1 WHERE userId = ?", [req.user.id]);
    res.json({ ok: true, message: "All notifications marked as read." });
  } catch { res.status(500).json({ ok: false }); }
});

// ─── ACCOUNT PREFERENCES ─────────────────────────────────────────────────────
app.get("/api/account/preferences", requireAuth, async (req, res) => {
  try {
    const [[row]] = await pool.query("SELECT preferences FROM account_preferences WHERE userId = ?", [req.user.id]);
    const preferences = row ? (typeof row.preferences === "string" ? JSON.parse(row.preferences || "[]") : (row.preferences || [])) : [];
    res.json({ ok: true, preferences });
  } catch { res.status(500).json({ ok: false, preferences: [] }); }
});
app.put("/api/account/preferences", requireAuth, async (req, res) => {
  try {
    const { preferences = [] } = req.body;
    await pool.query(
      "INSERT INTO account_preferences (userId, preferences) VALUES (?, ?) ON DUPLICATE KEY UPDATE preferences = VALUES(preferences)",
      [req.user.id, JSON.stringify(preferences)]
    );
    res.json({ ok: true, message: "Preferences saved." });
  } catch { res.status(500).json({ ok: false, message: "Unable to save preferences." }); }
});

// ─── TRAVEL PLANNER ───────────────────────────────────────────────────────────
app.get("/api/planner/destinations", async (req, res) => {
  try {
    const [o] = await pool.query("SELECT DISTINCT origin AS v FROM flights WHERE isActive = 1 AND departureDate >= CURDATE() ORDER BY origin");
    const [d] = await pool.query("SELECT DISTINCT destination AS v FROM flights WHERE isActive = 1 AND departureDate >= CURDATE() ORDER BY destination");
    res.json({ ok: true, origins: o.map(r => r.v), destinations: d.map(r => r.v) });
  } catch { res.status(500).json({ ok: false, origins: [], destinations: [] }); }
});

app.post("/api/planner/recommend", async (req, res) => {
  try {
    const { origin, destination, departureDate, returnDate, travelers = 1, budget, preferences = [] } = req.body;
    if (!origin || !destination) return res.status(400).json({ ok: false, message: "Origin and destination are required." });
    if (!departureDate)          return res.status(400).json({ ok: false, message: "Departure date is required." });

    let sql = `
      SELECT f.id AS flightId, f.flightNumber, f.airline, f.origin, f.destination,
             f.departureDate, f.departureTime, f.arrivalTime,
             f.price AS pricePerPerson, f.price * ? AS totalCost,
             f.status, f.availableSeats
      FROM flights f
      WHERE f.origin LIKE ? AND f.destination LIKE ?
        AND DATE(f.departureDate) = DATE(?) AND f.isActive = 1 AND f.availableSeats >= ?
    `;
    const params = [Number(travelers), `%${origin}%`, `%${destination}%`, departureDate, Number(travelers)];

    if (budget) { sql += " AND (f.price * ?) <= ?"; params.push(Number(travelers), Number(budget)); }
    if (preferences.includes("morning")) sql += " AND (f.departureTime LIKE '%AM%')";
    else if (preferences.includes("evening")) sql += " AND (f.departureTime LIKE '%PM%')";
    sql += " ORDER BY f.price ASC, f.departureTime ASC LIMIT 10";

    const [recommendations] = await pool.query(sql, params);
    const message = recommendations.length === 0
      ? `No flights found from ${origin} to ${destination} on ${departureDate}.`
      : `Found ${recommendations.length} recommended flight(s) for ${travelers} traveler(s).`;

    res.json({ ok: true, message, recommendations,
      disclaimer: "Recommendations are rule-based using SkyBook flight catalog data." });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to generate recommendations.", recommendations: [] });
  }
});

// ─── NEWSLETTER ───────────────────────────────────────────────────────────────
app.post("/api/newsletter", async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail) return res.status(400).json({ ok: false, message: "Email is required." });
    if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ ok: false, message: "Enter a valid email address." });
    try {
      await pool.query("INSERT INTO newsletter_subscribers (email) VALUES (?)", [cleanEmail]);
      res.json({ ok: true, message: "You're subscribed to SkyBook updates!" });
    } catch {
      res.json({ ok: true, message: "This email is already subscribed. Thank you!" });
    }
  } catch {
    res.status(500).json({ ok: false, message: "Unable to subscribe. Please try again." });
  }
});

// ─── CHAT / ASSISTANT ─────────────────────────────────────────────────────────
app.post("/api/chat", (req, res) => {
  const { message = "" } = req.body;
  const msg = message.toLowerCase().trim();
  let reply = "I can help with flight bookings, seat selection, promo codes, and travel information!";
  if      (msg.includes("promo") || msg.includes("discount") || msg.includes("code"))
    reply = "Active promo codes: 🎫 FLYINDIA (30% off domestic) | 🎫 WELCOME (₹1,000 off any flight) | 🎫 WORLD20 (20% off international routes).";
  else if (msg.includes("baggage") || msg.includes("luggage"))
    reply = "SkyBook allows 15 kg check-in + 7 kg cabin (Economy) and 30 kg + 10 kg (Business). Sample policy — not real airline rules.";
  else if (msg.includes("status") || msg.includes("track"))
    reply = "To track a flight, use the Flight Status section. Enter your SkyBook flight number (e.g. SK-101).";
  else if (msg.includes("cancel") || msg.includes("refund"))
    reply = "To cancel a booking, visit My Bookings and click 'Cancel Booking'. Seats are released immediately.";
  else if (msg.includes("seat"))
    reply = "Use our interactive seat map. Rows 1-2 are Business class.";
  else if (msg.includes("book") || msg.includes("flight") || msg.includes("search"))
    reply = "Use the flight search at the top! Enter origin, destination, date, and number of travelers.";
  else if (msg.includes("fare watch"))
    reply = "Use Fare Watch to monitor price changes. You'll be notified when a flight hits your target price!";
  res.json({ ok: true, reply });
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
app.post("/api/admin/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ ok: false, message: "Email and password are required." });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, message: "Enter a valid email address." });
    const [[row]] = await pool.query("SELECT id, passwordHash, isActive FROM users WHERE email = ?", [email]);
    if (!row) return res.status(401).json({ ok: false, message: "Invalid credentials." });
    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) return res.status(401).json({ ok: false, message: "Invalid credentials." });
    if (!row.isActive) return res.status(403).json({ ok: false, message: "This account has been deactivated." });
    const user = await getUserById(row.id);
    if (user.role !== "ADMIN") return res.status(403).json({ ok: false, message: "Not authorized for admin access." });
    await pool.query("UPDATE users SET lastLogin = NOW() WHERE id = ?", [row.id]);
    const token = jwt.sign({ id: row.id, email: user.email, role: "ADMIN" }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ ok: true, token, user });
  } catch {
    res.status(500).json({ ok: false, message: "Login failed." });
  }
});

app.get("/api/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const sd = startDate || localDateOnly(new Date(Date.now() - 30 * 86400000));
    const ed = endDate   || localDateOnly();

    const [[tu]] = await pool.query("SELECT COUNT(*) AS c FROM users");
    const [[tf]] = await pool.query("SELECT COUNT(*) AS c FROM flights WHERE isActive = 1");
    const [[af]] = await pool.query("SELECT COUNT(*) AS c FROM flights WHERE isActive = 1 AND departureDate >= CURDATE()");
    const [[tb]] = await pool.query("SELECT COUNT(*) AS c FROM bookings WHERE DATE(createdAt) BETWEEN ? AND ?", [sd, ed]);
    const [[tc]] = await pool.query("SELECT COUNT(*) AS c FROM bookings WHERE status = 'CANCELLED' AND DATE(createdAt) BETWEEN ? AND ?", [sd, ed]);
    const [[tr]] = await pool.query("SELECT SUM(totalPrice) AS rev FROM bookings WHERE status = 'CONFIRMED' AND DATE(createdAt) BETWEEN ? AND ?", [sd, ed]);

    const [statusDist]          = await pool.query("SELECT status, COUNT(*) AS c FROM bookings WHERE DATE(createdAt) BETWEEN ? AND ? GROUP BY status", [sd, ed]);
    const [bookingTrend]        = await pool.query("SELECT DATE(createdAt) AS date, COUNT(*) AS count FROM bookings WHERE DATE(createdAt) BETWEEN ? AND ? GROUP BY DATE(createdAt) ORDER BY date ASC", [sd, ed]);
    const [revenueTrend]        = await pool.query("SELECT DATE(createdAt) AS date, SUM(totalPrice) AS revenue FROM bookings WHERE status = 'CONFIRMED' AND DATE(createdAt) BETWEEN ? AND ? GROUP BY DATE(createdAt) ORDER BY date ASC", [sd, ed]);
    const [popularDestinations] = await pool.query("SELECT f.destination, COUNT(b.id) AS bookingCount FROM bookings b LEFT JOIN flights f ON f.id = b.flightId WHERE DATE(b.createdAt) BETWEEN ? AND ? GROUP BY f.destination ORDER BY bookingCount DESC LIMIT 10", [sd, ed]);
    const [flights]             = await pool.query("SELECT id, flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, price, status, availableSeats, isActive FROM flights ORDER BY departureDate DESC LIMIT 50");
    const [usersRaw]            = await pool.query("SELECT id, name, email, createdAt FROM users ORDER BY id DESC LIMIT 50");
    const [bookings]            = await pool.query(`
      SELECT b.id, b.pnr, b.passengerName, b.totalPrice, b.status, b.createdAt,
             f.origin, f.destination, u.name AS bookedByName
      FROM bookings b LEFT JOIN flights f ON f.id = b.flightId LEFT JOIN users u ON u.id = b.userId
      WHERE DATE(b.createdAt) BETWEEN ? AND ? ORDER BY b.id DESC LIMIT 100
    `, [sd, ed]);
    const [cancellations] = await pool.query(`
      SELECT b.id, b.pnr, b.status, b.createdAt, u.name AS bookedByName, f.origin, f.destination
      FROM bookings b LEFT JOIN flights f ON f.id = b.flightId LEFT JOIN users u ON u.id = b.userId
      WHERE b.status = 'CANCELLED' AND DATE(b.createdAt) BETWEEN ? AND ? ORDER BY b.id DESC LIMIT 50
    `, [sd, ed]);

    const users = await Promise.all(usersRaw.map(async u => {
      const [[isAdmin]] = await pool.query("SELECT id FROM admins WHERE userId = ?", [u.id]);
      return { ...u, role: isAdmin ? "ADMIN" : "USER" };
    }));

    const bsd = {}; statusDist.forEach(r => { bsd[r.status] = r.c; });

    res.json({
      ok: true,
      stats: { totalUsers: tu.c, totalFlights: tf.c, activeFlights: tf.c, upcomingFlights: af.c, totalBookings: tb.c, totalCancellations: tc.c, totalRevenue: tr.rev || 0, bookingStatusDistribution: bsd },
      bookingTrend, revenueTrend, popularDestinations, flights, users, bookings, cancellations,
    });
  } catch (error) {
    console.error("ADMIN DASHBOARD ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to load admin dashboard." });
  }
});

app.post("/api/admin/flights", requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime,
      price, status, capacity, aircraft, stops, cabinClasses, baggageAllowance,
      terminal, gate, baggageBelt, durationMinutes,
    } = req.body;

    const cleanNumber = String(flightNumber || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,20}$/.test(cleanNumber))
      return res.status(400).json({ ok: false, message: "Flight number must be 2–20 letters, digits or hyphens." });
    if (!origin || !destination || !departureDate)
      return res.status(400).json({ ok: false, message: "Origin, destination and departure date are required." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(departureDate)))
      return res.status(400).json({ ok: false, message: "Enter a valid departure date." });
    if (String(departureDate) < localDateOnly())
      return res.status(400).json({ ok: false, message: "Departure date cannot be in the past." });

    const findAirport = async (value) => {
      const raw = String(value || "").trim();
      const match = raw.match(/\(([A-Za-z]{3})\)/) || raw.match(/^([A-Za-z]{3})$/);
      const code = match ? match[1].toUpperCase() : "";
      const [[airport]] = await conn.query(
        `SELECT code, city, airportName, country, region FROM airports
         WHERE code = ? OR CONCAT(city, ' (', code, ')') = ? OR city = ? LIMIT 1`,
        [code, raw, raw]
      );
      return airport || null;
    };
    const originAirport = await findAirport(origin);
    const destinationAirport = await findAirport(destination);
    if (!originAirport) return res.status(400).json({ ok: false, message: "Origin airport is not in the shared catalogue." });
    if (!destinationAirport) return res.status(400).json({ ok: false, message: "Destination airport is not in the shared catalogue." });
    if (originAirport.code === destinationAirport.code)
      return res.status(400).json({ ok: false, message: "Origin and destination must be different airports." });

    const depTime = String(departureTime || "08:00 AM").trim();
    const arrTime = String(arrivalTime || "10:00 AM").trim();
    if (parseTimeToMinutes(depTime) == null || parseTimeToMinutes(arrTime) == null)
      return res.status(400).json({ ok: false, message: "Departure and arrival times must use HH:MM AM/PM." });

    const fare = Number(price);
    if (!Number.isFinite(fare) || fare <= 0)
      return res.status(400).json({ ok: false, message: "Price must be greater than zero." });

    const rawCapacity = capacity == null || capacity === "" ? 180 : Number(capacity);
    if (!Number.isFinite(rawCapacity) || rawCapacity < 1 || rawCapacity > 400)
      return res.status(400).json({ ok: false, message: "Seat capacity must be between 1 and 400." });
    const seatCapacity = Math.floor(rawCapacity);
    const duration = Number(durationMinutes) > 0 ? Number(durationMinutes) : minutesBetween(depTime, arrTime);
    const originName = `${originAirport.city} (${originAirport.code})`;
    const destinationName = `${destinationAirport.city} (${destinationAirport.code})`;

    await conn.beginTransaction();
    const [result] = await conn.query(`
      INSERT INTO flights
        (flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime,
         price, status, availableSeats, isActive, durationMinutes, stops, aircraft,
         cabinClasses, baggageAllowance, terminal, gate, baggageBelt, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      cleanNumber, String(airline || "SkyBook Airlines").trim().slice(0, 100) || "SkyBook Airlines",
      originName, destinationName, departureDate, depTime, arrTime,
      fare, String(status || "On Time").trim().slice(0, 30) || "On Time", seatCapacity,
      duration, Math.max(0, Math.min(5, Number(stops) || 0)),
      String(aircraft || "").trim() || "Airbus A320neo",
      String(cabinClasses || "Economy,Business").trim() || "Economy,Business",
      String(baggageAllowance || "15kg check-in + 7kg cabin").trim(),
      String(terminal || "").trim() || null,
      String(gate || "").trim() || null,
      String(baggageBelt || "").trim() || null,
      req.user.id,
    ]);

    const flightId = result.insertId;
    const cols = seatCapacity >= 120 ? ["A", "B", "C", "D", "E", "F"] : ["A", "B", "C", "D"];
    const rows = Math.ceil(seatCapacity / cols.length);
    const seatRows = [];
    for (let r = 1; r <= rows; r++) {
      for (const c of cols) {
        if (seatRows.length >= seatCapacity) break;
        seatRows.push([flightId, departureDate, `${c}${r}`, "available"]);
      }
    }
    if (seatRows.length) {
      await conn.query(
        "INSERT IGNORE INTO seats (flightId, travelDate, seatNumber, status) VALUES ?",
        [seatRows]
      );
    }

    await conn.query(
      "INSERT INTO admin_audit_log (adminUserId, action, entityType, entityId, details, ipAddress) VALUES (?, 'flight.create', 'flight', ?, ?, ?)",
      [req.user.id, String(flightId), JSON.stringify({ flightNumber: cleanNumber, origin: originName, destination: destinationName, price: fare, capacity: seatCapacity }), req.ip || null]
    );
    await conn.commit();

    res.status(201).json({
      ok: true,
      message: "Flight created with seat inventory.",
      flightId,
      flightNumber: cleanNumber,
      capacity: seatCapacity,
    });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, message: "A flight with this number and date already exists." });
    console.error("ADMIN FLIGHT CREATE ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to create flight." });
  } finally {
    conn.release();
  }
});

app.delete("/api/admin/flights/:id", requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: "Flight id must be a positive integer." });

    await conn.beginTransaction();
    const [[flight]] = await conn.query(
      "SELECT id, flightNumber, isActive FROM flights WHERE id = ? FOR UPDATE",
      [id]
    );
    if (!flight) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Flight not found." });
    }
    const [[activeBookings]] = await conn.query(
      "SELECT COUNT(*) AS c FROM bookings WHERE flightId = ? AND status IN ('CONFIRMED','PENDING')",
      [id]
    );
    if (Number(activeBookings.c) > 0) {
      await conn.rollback();
      return res.status(409).json({
        ok: false,
        message: "This flight has active bookings. Cancel or complete them before removing it; existing bookings are never deleted.",
      });
    }

    await conn.query("UPDATE flights SET isActive = 0 WHERE id = ?", [id]);
    await conn.query(
      "INSERT INTO admin_audit_log (adminUserId, action, entityType, entityId, details, ipAddress) VALUES (?, 'flight.archive', 'flight', ?, ?, ?)",
      [req.user.id, String(id), JSON.stringify({ flightNumber: flight.flightNumber, previousActive: flight.isActive }), req.ip || null]
    );
    await conn.commit();
    res.json({ ok: true, message: "Flight archived (soft-deleted). Booking history is preserved." });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    console.error("ADMIN FLIGHT ARCHIVE ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to archive flight." });
  } finally {
    conn.release();
  }
});

// Permanent deletion is allowed only for archived flights with no booking history.
// Flights with bookings must be archived instead so reservation history is preserved.
app.delete("/api/admin/flights/:id/permanent", requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = parsePositiveId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: "Flight id must be a positive integer." });

    await conn.beginTransaction();
    const [[flight]] = await conn.query(
      "SELECT id, flightNumber, isActive FROM flights WHERE id = ? FOR UPDATE",
      [id]
    );
    if (!flight) {
      await conn.rollback();
      return res.status(404).json({ ok: false, message: "Flight not found." });
    }
    if (flight.isActive) {
      await conn.rollback();
      return res.status(409).json({ ok: false, message: "Archive the flight before deleting it permanently." });
    }
    const [[bookingCount]] = await conn.query(
      "SELECT COUNT(*) AS c FROM bookings WHERE flightId = ?",
      [id]
    );
    if (Number(bookingCount.c) > 0) {
      await conn.rollback();
      return res.status(409).json({ ok: false, message: "This flight has booking history and cannot be deleted permanently. Keep it archived." });
    }

    await conn.query(
      "INSERT INTO admin_audit_log (adminUserId, action, entityType, entityId, details, ipAddress) VALUES (?, 'flight.delete', 'flight', ?, ?, ?)",
      [req.user.id, String(id), JSON.stringify({ flightNumber: flight.flightNumber }), req.ip || null]
    );
    await conn.query("DELETE FROM flights WHERE id = ?", [id]);
    await conn.commit();
    res.json({ ok: true, message: "Flight permanently deleted." });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    console.error("ADMIN FLIGHT DELETE ERROR:", error);
    res.status(500).json({ ok: false, message: "Unable to delete flight." });
  } finally {
    conn.release();
  }
});

// User dashboard stats
app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
  try {
    const [[{tb}]] = await pool.query("SELECT COUNT(*) AS tb FROM bookings WHERE userId = ?", [req.user.id]);
    const [[{cb}]] = await pool.query("SELECT COUNT(*) AS cb FROM bookings WHERE userId = ? AND status = 'CONFIRMED'", [req.user.id]);
    const [[{tf}]] = await pool.query("SELECT COUNT(*) AS tf FROM flights WHERE isActive = 1");
    res.json({ ok: true, totalBookings: tb, confirmedBookings: cb, totalFlights: tf });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to load stats." });
  }
});

// ─── 404 / Error / Start ─────────────────────────────────────────────────────
async function assertProductionCredentials() {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.SKYBOOK_ALLOW_DEMO_ACCOUNTS === "true") {
    console.warn("⚠️  SKYBOOK_ALLOW_DEMO_ACCOUNTS=true: demo credentials are allowed in production. Never use this for real users.");
    return;
  }
  const [rows] = await pool.query(
    "SELECT email, passwordHash FROM users WHERE email IN ('admin@skybook.com', 'demo@skybook.com')"
  );
  for (const user of rows) {
    const demoPassword = user.email === DEV_ADMIN_EMAIL ? DEV_ADMIN_PASSWORD : DEMO_CUSTOMER_PASSWORD;
    if (await bcrypt.compare(demoPassword, user.passwordHash)) {
      console.error(`❌ Refusing to start: ${user.email} still uses its documented demo password.`);
      console.error("   Change the password, remove the demo account, or set SKYBOOK_ALLOW_DEMO_ACCOUNTS=true only for a demo deployment.");
      process.exit(1);
    }
  }
}

async function startServer() {
  try {
    await ensureSchema(pool);
    await assertProductionCredentials();
  } catch (error) {
    console.error("❌ Schema guard failed:", error.message);
    process.exit(1);
  }

  const { startFareWatchScheduler, readSettings } = registerExtensions({
    app, pool, requireAuth, requireAdmin, jwt, JWT_SECRET, JWT_EXPIRES, bcrypt, generatePNR, seatLayout,
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ ok: false, message: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Optional single-container mode (Render/Cloud Run/Fly). Nginx remains the
  // default frontend in Docker Compose; this lets one Node process serve the
  // built SPA and the API from the same origin when SERVE_FRONTEND=true.
  if (SERVE_FRONTEND) {
    app.use(express.static(FRONTEND_DIST, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.sendFile(path.join(FRONTEND_DIST, "index.html"), err => {
        if (err) next(err);
      });
    });
  }

  app.use((error, req, res, _next) => {
    console.error("SERVER ERROR:", error);
    if (res.headersSent) return;
    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({ ok: false, message: "Invalid JSON request body." });
    }
    if (error?.type === "entity.too.large") {
      return res.status(413).json({ ok: false, message: "Request body is too large." });
    }
    res.status(500).json({ ok: false, message: "Internal server error." });
  });

  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 SkyBook backend running on http://${HOST}:${PORT}`);
    console.log(`🗄️  Database: MySQL – ${process.env.MYSQL_DATABASE || "skybook"}@${process.env.MYSQL_HOST || "127.0.0.1"}${process.env.MYSQL_SSL ? " (TLS)" : ""}`);
    console.log(`🔑 JWT auth: enabled`);
    console.log(`🖥️  Frontend: ${SERVE_FRONTEND ? `served from ${FRONTEND_DIST}` : "separate Nginx/Vite frontend"}`);
    console.log(`🌐 CORS: ${corsOrigins.length ? corsOrigins.join(", ") : (process.env.NODE_ENV === "production" ? "same-origin only" : "development default (all origins)")}`);
  });

  try {
    const settings = await readSettings(["fare_alert_interval_minutes"]);
    const minutes = Number(process.env.FARE_WATCH_INTERVAL_MINUTES ?? settings.fare_alert_interval_minutes ?? 30);
    startFareWatchScheduler(minutes);
  } catch (error) {
    console.warn("Fare-watch monitor not started:", error.message);
  }

  const shutdown = () => {
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();