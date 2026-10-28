/**
 * SkyBook – idempotent schema guard.
 *
 * Adds the columns/tables required by the customer + admin dashboards without
 * ever dropping data. Safe to run on every server start.
 *
 * The canonical database is the MySQL/MariaDB `skybook` database used by
 * src/backend/server.js. The Spring Boot backend in backend-java/ is legacy
 * and is not started by any script in this repository.
 */
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { buildDbConfig } = require("./db-config");

// ─── Shared airport catalogue (single source for DB + seed script) ───────────
// `name` is the display form stored in flights.origin/destination.
const SEED_AIRPORTS = [
  // India
  { code: "BOM", city: "Mumbai", airportName: "Chhatrapati Shivaji Maharaj International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "India's financial capital and entertainment hub", emoji: "🌊" },
  { code: "DEL", city: "Delhi", airportName: "Indira Gandhi International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "India's capital with iconic historic monuments", emoji: "🏛️" },
  { code: "BLR", city: "Bengaluru", airportName: "Kempegowda International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Silicon Valley of India and garden city", emoji: "🌿" },
  { code: "HYD", city: "Hyderabad", airportName: "Rajiv Gandhi International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "City of Nizams and tech corridors", emoji: "🕌" },
  { code: "MAA", city: "Chennai", airportName: "Chennai International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Gateway to South India and cultural hub", emoji: "🏖️" },
  { code: "CCU", city: "Kolkata", airportName: "Netaji Subhas Chandra Bose International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "City of joy and cultural heritage", emoji: "🎭" },
  { code: "PNQ", city: "Pune", airportName: "Pune International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Oxford of the East and rising tech hub", emoji: "📚" },
  { code: "AMD", city: "Ahmedabad", airportName: "Sardar Vallabhbhai Patel International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Heritage city and commercial centre of Gujarat", emoji: "🏺" },
  { code: "GOI", city: "Goa", airportName: "Goa International Airport (Dabolim)", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Beach paradise and carnival capital of India", emoji: "🌴" },
  { code: "COK", city: "Kochi", airportName: "Cochin International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Queen of the Arabian Sea", emoji: "🚢" },
  { code: "JAI", city: "Jaipur", airportName: "Jaipur International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Pink City of royal palaces and heritage", emoji: "🏰" },
  { code: "LKO", city: "Lucknow", airportName: "Chaudhary Charan Singh International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "City of nawabs, biryani and tehzeeb", emoji: "🌹" },
  { code: "IXC", city: "Chandigarh", airportName: "Chandigarh Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "City Beautiful in the foothills of Shivaliks", emoji: "🌄" },
  { code: "IDR", city: "Indore", airportName: "Devi Ahilyabai Holkar Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Commercial capital of Madhya Pradesh", emoji: "🏙️" },
  { code: "NAG", city: "Nagpur", airportName: "Dr. Babasaheb Ambedkar International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Orange city and zero mile of India", emoji: "🍊" },
  { code: "SXR", city: "Srinagar", airportName: "Sheikh ul-Alam International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Paradise on earth in the Kashmir Valley", emoji: "🏔️" },
  { code: "VNS", city: "Varanasi", airportName: "Lal Bahadur Shastri International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Spiritual capital on the banks of Ganga", emoji: "🕯️" },
  { code: "BBI", city: "Bhubaneswar", airportName: "Biju Patnaik International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Temple city and IT hub of Odisha", emoji: "🛕" },
  { code: "GAU", city: "Guwahati", airportName: "Lokpriya Gopinath Bordoloi International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Gateway to the North-East and Brahmaputra city", emoji: "🌿" },
  { code: "PAT", city: "Patna", airportName: "Jay Prakash Narayan International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Ancient city of Pataliputra on the Ganga", emoji: "🌊" },
  { code: "CJB", city: "Coimbatore", airportName: "Coimbatore International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Manchester of South India and textile hub", emoji: "🏭" },
  { code: "TRV", city: "Thiruvananthapuram", airportName: "Trivandrum International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Capital of Kerala, space and IT city", emoji: "🚀" },
  { code: "IXE", city: "Mangaluru", airportName: "Mangaluru International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Gateway to coastal Karnataka and coffee land", emoji: "☕" },
  { code: "VTZ", city: "Visakhapatnam", airportName: "Visakhapatnam Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Jewel of the east coast and naval city", emoji: "⚓" },
  { code: "ATQ", city: "Amritsar", airportName: "Sri Guru Ram Dass Jee International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "City of the Golden Temple and Wagah border", emoji: "✨" },
  { code: "DED", city: "Dehradun", airportName: "Jolly Grant Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Gateway to Uttarakhand hills and Mussoorie", emoji: "🏔️" },
  { code: "IXR", city: "Ranchi", airportName: "Birsa Munda Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Capital of Jharkhand and city of waterfalls", emoji: "💦" },
  { code: "RPR", city: "Raipur", airportName: "Swami Vivekananda Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Capital of Chhattisgarh and the rice bowl", emoji: "🌾" },
  { code: "STV", city: "Surat", airportName: "Surat Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Diamond city and textile export hub of India", emoji: "💎" },
  { code: "BDQ", city: "Vadodara", airportName: "Vadodara Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Cultural capital of Gujarat", emoji: "🎨" },
  { code: "IXL", city: "Leh", airportName: "Kushok Bakula Rimpochee Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "High-altitude gateway to Ladakh", emoji: "⛰️" },
  { code: "IXZ", city: "Port Blair", airportName: "Veer Savarkar International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Gateway to the Andaman and Nicobar Islands", emoji: "🏝️" },
  { code: "TRZ", city: "Tiruchirappalli", airportName: "Tiruchirappalli International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Temple city on the banks of the Kaveri", emoji: "🛕" },
  { code: "IXM", city: "Madurai", airportName: "Madurai International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Ancient temple city of Tamil Nadu", emoji: "🏛️" },
  { code: "IXU", city: "Chhatrapati Sambhajinagar", airportName: "Aurangabad Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Gateway to the Ajanta and Ellora caves", emoji: "🗿" },
  { code: "SAG", city: "Shirdi", airportName: "Shirdi International Airport", country: "India", timezone: "Asia/Kolkata", region: "domestic", description: "Pilgrimage town of Sai Baba", emoji: "🪔" },

  // International
  { code: "DXB", city: "Dubai", airportName: "Dubai International Airport", country: "UAE", timezone: "Asia/Dubai", region: "international", description: "City of the future and global luxury hub", emoji: "🏙️" },
  { code: "AUH", city: "Abu Dhabi", airportName: "Abu Dhabi International Airport", country: "UAE", timezone: "Asia/Dubai", region: "international", description: "Capital of UAE and Formula 1 host city", emoji: "🏎️" },
  { code: "SIN", city: "Singapore", airportName: "Singapore Changi Airport", country: "Singapore", timezone: "Asia/Singapore", region: "international", description: "Garden city and world-class aviation hub", emoji: "✨" },
  { code: "BKK", city: "Bangkok", airportName: "Suvarnabhumi Airport", country: "Thailand", timezone: "Asia/Bangkok", region: "international", description: "City of Angels with magnificent temples", emoji: "🛕" },
  { code: "HKT", city: "Phuket", airportName: "Phuket International Airport", country: "Thailand", timezone: "Asia/Bangkok", region: "international", description: "Island beaches and Andaman Sea escapes", emoji: "🏖️" },
  { code: "KUL", city: "Kuala Lumpur", airportName: "Kuala Lumpur International Airport", country: "Malaysia", timezone: "Asia/Kuala_Lumpur", region: "international", description: "Twin Towers and vibrant multicultural capital", emoji: "🌆" },
  { code: "CMB", city: "Colombo", airportName: "Bandaranaike International Airport", country: "Sri Lanka", timezone: "Asia/Colombo", region: "international", description: "Pearl of the Indian Ocean", emoji: "💎" },
  { code: "KTM", city: "Kathmandu", airportName: "Tribhuvan International Airport", country: "Nepal", timezone: "Asia/Kathmandu", region: "international", description: "Gateway to the Himalayas and Mount Everest", emoji: "🏔️" },
  { code: "MLE", city: "Male", airportName: "Velana International Airport", country: "Maldives", timezone: "Indian/Maldives", region: "international", description: "Tropical paradise of turquoise lagoons", emoji: "🏖️" },
  { code: "LHR", city: "London", airportName: "Heathrow Airport", country: "UK", timezone: "Europe/London", region: "international", description: "Historic capital and global financial powerhouse", emoji: "💂" },
  { code: "CDG", city: "Paris", airportName: "Charles de Gaulle Airport", country: "France", timezone: "Europe/Paris", region: "international", description: "City of love, art and haute cuisine", emoji: "🗼" },
  { code: "FRA", city: "Frankfurt", airportName: "Frankfurt Airport", country: "Germany", timezone: "Europe/Berlin", region: "international", description: "Financial capital of Europe", emoji: "🏦" },
  { code: "AMS", city: "Amsterdam", airportName: "Amsterdam Schiphol Airport", country: "Netherlands", timezone: "Europe/Amsterdam", region: "international", description: "City of canals and world-class museums", emoji: "🌷" },
  { code: "ZRH", city: "Zurich", airportName: "Zurich Airport", country: "Switzerland", timezone: "Europe/Zurich", region: "international", description: "Pristine Alpine city and global banking hub", emoji: "🏔️" },
  { code: "FCO", city: "Rome", airportName: "Leonardo da Vinci–Fiumicino Airport", country: "Italy", timezone: "Europe/Rome", region: "international", description: "Eternal city of history and cuisine", emoji: "🏛️" },
  { code: "IST", city: "Istanbul", airportName: "Istanbul Airport", country: "Turkey", timezone: "Europe/Istanbul", region: "international", description: "Bridge between East and West civilisations", emoji: "🕌" },
  { code: "JFK", city: "New York", airportName: "John F. Kennedy International Airport", country: "USA", timezone: "America/New_York", region: "international", description: "The city that never sleeps", emoji: "🗽" },
  { code: "SFO", city: "San Francisco", airportName: "San Francisco International Airport", country: "USA", timezone: "America/Los_Angeles", region: "international", description: "Golden Gate city and tech capital", emoji: "🌉" },
  { code: "LAX", city: "Los Angeles", airportName: "Los Angeles International Airport", country: "USA", timezone: "America/Los_Angeles", region: "international", description: "City of angels, beaches and studios", emoji: "🎬" },
  { code: "ORD", city: "Chicago", airportName: "O'Hare International Airport", country: "USA", timezone: "America/Chicago", region: "international", description: "Windy City on Lake Michigan", emoji: "🌬️" },
  { code: "YYZ", city: "Toronto", airportName: "Toronto Pearson International Airport", country: "Canada", timezone: "America/Toronto", region: "international", description: "Canada's largest city and cultural mosaic", emoji: "🍁" },
  { code: "YVR", city: "Vancouver", airportName: "Vancouver International Airport", country: "Canada", timezone: "America/Vancouver", region: "international", description: "Pacific coast city framed by mountains", emoji: "🏔️" },
  { code: "SYD", city: "Sydney", airportName: "Sydney Kingsford Smith Airport", country: "Australia", timezone: "Australia/Sydney", region: "international", description: "Opera House city and harbour of wonders", emoji: "🎭" },
  { code: "MEL", city: "Melbourne", airportName: "Melbourne Airport", country: "Australia", timezone: "Australia/Melbourne", region: "international", description: "Cultural capital of Australia", emoji: "☕" },
  { code: "PER", city: "Perth", airportName: "Perth Airport", country: "Australia", timezone: "Australia/Perth", region: "international", description: "Sunniest Australian city on the Indian Ocean", emoji: "☀️" },
  { code: "AKL", city: "Auckland", airportName: "Auckland Airport", country: "New Zealand", timezone: "Pacific/Auckland", region: "international", description: "City of sails and gateway to New Zealand", emoji: "⛵" },
  { code: "HND", city: "Tokyo", airportName: "Tokyo Haneda Airport", country: "Japan", timezone: "Asia/Tokyo", region: "international", description: "Land of the rising sun and bullet trains", emoji: "🗻" },
  { code: "ICN", city: "Seoul", airportName: "Incheon International Airport", country: "South Korea", timezone: "Asia/Seoul", region: "international", description: "K-pop capital and tech powerhouse", emoji: "🎵" },
  { code: "HKG", city: "Hong Kong", airportName: "Hong Kong International Airport", country: "Hong Kong", timezone: "Asia/Hong_Kong", region: "international", description: "Asia's world city and financial powerhouse", emoji: "🌃" },
  { code: "PVG", city: "Shanghai", airportName: "Shanghai Pudong International Airport", country: "China", timezone: "Asia/Shanghai", region: "international", description: "Futuristic skyline on the Huangpu River", emoji: "🏙️" },
  { code: "PEK", city: "Beijing", airportName: "Beijing Capital International Airport", country: "China", timezone: "Asia/Shanghai", region: "international", description: "Imperial capital and Great Wall gateway", emoji: "🏯" },
  { code: "DOH", city: "Doha", airportName: "Hamad International Airport", country: "Qatar", timezone: "Asia/Qatar", region: "international", description: "World Cup city and Middle East hub", emoji: "⚽" },
  { code: "RUH", city: "Riyadh", airportName: "King Khalid International Airport", country: "Saudi Arabia", timezone: "Asia/Riyadh", region: "international", description: "Capital of Saudi Arabia and NEOM gateway", emoji: "🏙️" },
  { code: "JED", city: "Jeddah", airportName: "King Abdulaziz International Airport", country: "Saudi Arabia", timezone: "Asia/Riyadh", region: "international", description: "Gateway to Makkah and Red Sea city", emoji: "🕌" },
  { code: "MCT", city: "Muscat", airportName: "Muscat International Airport", country: "Oman", timezone: "Asia/Muscat", region: "international", description: "Ancient capital of the Sultanate of Oman", emoji: "🏛️" },
  { code: "MRU", city: "Mauritius", airportName: "Sir Seewoosagur Ramgoolam International Airport", country: "Mauritius", timezone: "Indian/Mauritius", region: "international", description: "Island paradise of white beaches and coral reefs", emoji: "🌊" },
];

const DEFAULT_SETTINGS = {
  brand_name: "SkyBook",
  brand_tagline: "India's smart flight booking platform",
  support_email: "support@skybook.example",
  support_phone: "+91 1800 000 000",
  currency: "INR",
  cancellation_window_hours: "2",
  max_travelers: "9",
  maintenance_notice: "",
  fare_alert_interval_minutes: "30",
};

async function tableExists(pool, table) {
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1",
    [table]
  );
  return rows.length > 0;
}

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(pool, table, index) {
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
    [table, index]
  );
  return rows.length > 0;
}

async function addColumn(pool, table, column, definition) {
  if (await columnExists(pool, table, column)) return;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  ➕ ${table}.${column}`);
}

async function addIndex(pool, table, index, definition) {
  if (await indexExists(pool, table, index)) return;
  await pool.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` ${definition}`);
  console.log(`  ➕ index ${table}.${index}`);
}

async function ensureBaseSchema(pool) {
  if (await tableExists(pool, "users")) return;

  const schemaPath = path.join(__dirname, "../../database/skybook.sql");
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Base schema file not found: ${schemaPath}`);
  }

  // The Docker initializer uses this file directly. Managed MySQL providers
  // (Aiven, PlanetScale-compatible services, etc.) start empty, so bootstrap
  // the base tables once from the same reviewed schema. CREATE DATABASE/USE
  // are removed because managed databases already select the target database
  // and normally do not grant CREATE DATABASE privileges.
  const baseSql = fs.readFileSync(schemaPath, "utf8")
    .replace(/^\s*CREATE\s+DATABASE\b[\s\S]*?;\s*/im, "")
    .replace(/^\s*USE\s+[^;]+;\s*/im, "");

  console.log("  🗄️  Empty database detected — creating SkyBook base schema.");
  const connection = await mysql.createConnection(buildDbConfig({ multipleStatements: true }));
  try {
    await connection.query(baseSql);
  } finally {
    await connection.end();
  }

  if (!(await tableExists(pool, "users"))) {
    throw new Error("Base schema initialization did not create the users table.");
  }
  console.log("  ✅ Base schema created.");
}

async function ensureSchema(pool) {
  // Managed databases may start with no tables. Create the base schema before
  // any extension table that has a foreign key to users.
  await ensureBaseSchema(pool);

  // ── New tables ─────────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      settingKey   VARCHAR(80) NOT NULL,
      settingValue TEXT        NOT NULL,
      updatedAt    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (settingKey)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      adminUserId INT UNSIGNED    NOT NULL,
      action      VARCHAR(80)     NOT NULL,
      entityType  VARCHAR(40)     NOT NULL,
      entityId    VARCHAR(60)     DEFAULT NULL,
      details     JSON            DEFAULT NULL,
      ipAddress   VARCHAR(64)     DEFAULT NULL,
      createdAt   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_audit_admin   (adminUserId),
      KEY idx_audit_created (createdAt),
      CONSTRAINT fk_audit_admin FOREIGN KEY (adminUserId) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
      userId    INT UNSIGNED NOT NULL,
      tokenHash CHAR(64)     NOT NULL,
      expiresAt DATETIME     NOT NULL,
      usedAt    DATETIME     DEFAULT NULL,
      createdAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_prt_hash (tokenHash),
      KEY idx_prt_user (userId),
      CONSTRAINT fk_prt_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ── users ──────────────────────────────────────────────────────────────────
  await addColumn(pool, "users", "phone", "VARCHAR(30) DEFAULT NULL");
  await addColumn(pool, "users", "isActive", "TINYINT(1) NOT NULL DEFAULT 1");
  await addColumn(pool, "users", "lastLogin", "DATETIME DEFAULT NULL");

  // ── flights ────────────────────────────────────────────────────────────────
  await addColumn(pool, "flights", "durationMinutes", "INT DEFAULT NULL");
  await addColumn(pool, "flights", "stops", "TINYINT NOT NULL DEFAULT 0");
  await addColumn(pool, "flights", "aircraft", "VARCHAR(60) DEFAULT NULL");
  await addColumn(pool, "flights", "cabinClasses", "VARCHAR(120) NOT NULL DEFAULT 'Economy,Business'");
  await addColumn(pool, "flights", "baggageAllowance", "VARCHAR(160) NOT NULL DEFAULT '15kg check-in + 7kg cabin'");
  await addColumn(pool, "flights", "terminal", "VARCHAR(20) DEFAULT NULL");
  await addColumn(pool, "flights", "gate", "VARCHAR(20) DEFAULT NULL");
  await addColumn(pool, "flights", "baggageBelt", "VARCHAR(20) DEFAULT NULL");
  await addColumn(pool, "flights", "createdBy", "INT UNSIGNED DEFAULT NULL");

  // ── bookings ───────────────────────────────────────────────────────────────
  await addColumn(pool, "bookings", "cabinClass", "VARCHAR(20) NOT NULL DEFAULT 'Economy'");
  await addColumn(pool, "bookings", "baseFare", "DECIMAL(10,2) DEFAULT NULL");
  await addColumn(pool, "bookings", "taxes", "DECIMAL(10,2) NOT NULL DEFAULT 0.00");
  await addColumn(pool, "bookings", "discountAmount", "DECIMAL(10,2) NOT NULL DEFAULT 0.00");
  await addColumn(pool, "bookings", "cancelledAt", "DATETIME DEFAULT NULL");
  await addColumn(pool, "bookings", "cancelledBy", "VARCHAR(20) DEFAULT NULL");

  const [[statusCol]] = await pool.query(
    "SELECT COLUMN_TYPE AS ct FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'status'"
  );
  if (statusCol && !String(statusCol.ct).includes("COMPLETED")) {
    await pool.query("ALTER TABLE bookings MODIFY status ENUM('CONFIRMED','CANCELLED','PENDING','COMPLETED') NOT NULL DEFAULT 'CONFIRMED'");
    console.log("  ➕ bookings.status += COMPLETED");
  }

  await pool.query("UPDATE bookings SET baseFare = totalPrice WHERE baseFare IS NULL");
  await pool.query("UPDATE bookings SET taxes = 0 WHERE taxes IS NULL");
  await pool.query("UPDATE bookings SET discountAmount = 0 WHERE discountAmount IS NULL");
  await addIndex(pool, "bookings", "idx_bookings_travelDate", "(travelDate)");

  // ── fare_watches ───────────────────────────────────────────────────────────
  await addColumn(pool, "fare_watches", "isActive", "TINYINT(1) NOT NULL DEFAULT 1");
  await addColumn(pool, "fare_watches", "lastCheckedAt", "DATETIME DEFAULT NULL");

  // ── notifications ──────────────────────────────────────────────────────────
  await addColumn(pool, "notifications", "link", "VARCHAR(200) DEFAULT NULL");

  // ── airports ───────────────────────────────────────────────────────────────
  await addColumn(pool, "airports", "description", "VARCHAR(255) DEFAULT NULL");
  await addColumn(pool, "airports", "emoji", "VARCHAR(16) DEFAULT NULL");
  await addColumn(pool, "airports", "isActive", "TINYINT(1) NOT NULL DEFAULT 1");

  // ── Normalise airport collation (older installs used general_ci) ───────────
  if (await tableExists(pool, "airports")) {
    const [[aptCollation]] = await pool.query(
      "SELECT TABLE_COLLATION AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'airports'"
    );
    if (aptCollation && aptCollation.c !== "utf8mb4_unicode_ci") {
      await pool.query("ALTER TABLE airports CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
      console.log("  ➕ airports collation → utf8mb4_unicode_ci");
    }
  }

  // ── Seed airports (never overwrites admin edits) ───────────────────────────
  if (await tableExists(pool, "airports")) {
    const rows = SEED_AIRPORTS.map(a => [
      a.code, a.city, a.airportName, a.country, a.timezone, a.region, a.description, a.emoji,
    ]);
    await pool.query(
      `INSERT IGNORE INTO airports (code, city, airportName, country, timezone, region, description, emoji)
       VALUES ?`,
      [rows]
    );
    // Fill blank marketing metadata for older rows only.
    for (const a of SEED_AIRPORTS) {
      await pool.query(
        `UPDATE airports
         SET description = COALESCE(NULLIF(description, ''), ?),
             emoji       = COALESCE(NULLIF(emoji, ''), ?)
         WHERE code = ?`,
        [a.description, a.emoji, a.code]
      );
    }
  }

  // ── Settings defaults ──────────────────────────────────────────────────────
  const entries = Object.entries(DEFAULT_SETTINGS);
  await pool.query(
    "INSERT IGNORE INTO app_settings (settingKey, settingValue) VALUES ?",
    [entries]
  );

  // ── Ensure the seeded admin account still exists (never resets a password) ─
  // In production a default password is never created. Provide
  // SKYBOOK_ADMIN_EMAIL + SKYBOOK_ADMIN_PASSWORD for a bootstrap admin, or
  // create one manually and attach it to the admins table.
  const isProduction = process.env.NODE_ENV === "production";
  const bootstrapEmail = isProduction
    ? String(process.env.SKYBOOK_ADMIN_EMAIL || "").trim().toLowerCase()
    : "";
  const bootstrapPassword = isProduction ? String(process.env.SKYBOOK_ADMIN_PASSWORD || "") : "";
  const [[adminRow]] = await pool.query(
    "SELECT id FROM users WHERE email = 'admin@skybook.com' OR email = ? LIMIT 1",
    [bootstrapEmail]
  );
  if (!adminRow) {
    if (isProduction) {
      if (bootstrapEmail && bootstrapPassword.length >= 12) {
        const hash = await bcrypt.hash(bootstrapPassword, 10);
        const [ins] = await pool.query(
          "INSERT INTO users (name, email, passwordHash, isActive) VALUES ('SkyBook Admin', ?, ?, 1)",
          [bootstrapEmail, hash]
        );
        await pool.query("INSERT IGNORE INTO admins (userId) VALUES (?)", [ins.insertId]);
        console.log("  ➕ seeded bootstrap administrator from environment");
      } else {
        console.warn("  ⚠️  No administrator account exists. Set SKYBOOK_ADMIN_EMAIL and SKYBOOK_ADMIN_PASSWORD (12+ characters) or create one manually.");
      }
    } else {
      const devAdminPassword = String(process.env.SKYBOOK_DEV_ADMIN_PASSWORD || "Admin@123");
      const hash = await bcrypt.hash(devAdminPassword, 10);
      const [ins] = await pool.query(
        "INSERT INTO users (name, email, passwordHash, isActive) VALUES ('SkyBook Admin', 'admin@skybook.com', ?, 1)",
        [hash]
      );
      await pool.query("INSERT IGNORE INTO admins (userId) VALUES (?)", [ins.insertId]);
      console.log("  ➕ seeded admin@skybook.com (development only; password from SKYBOOK_DEV_ADMIN_PASSWORD)");
    }
  } else {
    await pool.query("INSERT IGNORE INTO admins (userId) VALUES (?)", [adminRow.id]);
  }

  console.log("✅ Schema guard complete");
}

/**
 * Upgraded user projection used by auth/profile/admin routes.
 */
async function getUserById(pool, id) {
  const [[user]] = await pool.query(
    `SELECT id, name, email, phone, isActive, createdAt, updatedAt, lastLogin
     FROM users WHERE id = ?`,
    [id]
  );
  if (!user) return null;
  const [[admin]] = await pool.query("SELECT id FROM admins WHERE userId = ?", [id]);
  return { ...user, role: admin ? "ADMIN" : "USER" };
}

module.exports = { ensureSchema, getUserById, SEED_AIRPORTS, DEFAULT_SETTINGS };
