/**
 * One-time administrator password initialization / rotation.
 *
 * This is the supported way to set the initial admin credential without
 * committing a plaintext password to the frontend or the SQL seed.
 *
 * Usage (development):
 *   $env:SKYBOOK_ADMIN_EMAIL="admin@skybook.com"
 *   $env:SKYBOOK_ADMIN_PASSWORD="Admin@123"
 *   node src/backend/set-admin-password.js --apply
 *
 * Production: use a long, unique password and the production database
 * credentials. The script refuses to run without --apply.
 */
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, ".env") });

const APPLY = process.argv.includes("--apply");
const email = String(process.env.SKYBOOK_ADMIN_EMAIL || "admin@skybook.com").trim().toLowerCase();
const password = String(process.env.SKYBOOK_ADMIN_PASSWORD || "");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

if (!emailPattern.test(email)) fail("SKYBOOK_ADMIN_EMAIL must be a valid email address.");
if (password.length < 8) fail("Set SKYBOOK_ADMIN_PASSWORD to at least 8 characters.");
if (!APPLY) {
  console.log(`Dry run: would initialize administrator ${email}.`);
  console.log("Re-run with --apply to update the database.");
  process.exit(0);
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "skybook",
  waitForConnections: true,
  connectionLimit: 2,
  charset: "utf8mb4",
  decimalNumbers: true,
});

async function main() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE",
      [email]
    );
    const hash = await bcrypt.hash(password, 10);
    let userId;
    if (existing) {
      userId = existing.id;
      await conn.query(
        "UPDATE users SET passwordHash = ?, isActive = 1 WHERE id = ?",
        [hash, userId]
      );
    } else {
      const [created] = await conn.query(
        "INSERT INTO users (name, email, passwordHash, isActive) VALUES ('SkyBook Admin', ?, ?, 1)",
        [email, hash]
      );
      userId = created.insertId;
    }
    await conn.query("INSERT IGNORE INTO admins (userId) VALUES (?)", [userId]);
    await conn.commit();
    console.log(`✅ Administrator password initialized for ${email} (user id ${userId}).`);
    console.log("   The plaintext password was not stored or printed.");
  } catch (error) {
    try { await conn.rollback(); } catch {}
    throw error;
  } finally {
    conn.release();
  }
}

main()
  .catch(error => {
    console.error("❌ Administrator password initialization failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
