/**
 * Docker/PaaS startup helper.
 *
 * The SQL seed intentionally contains documented development accounts so a
 * fresh local database is usable. Production deployments must not keep those
 * passwords. This script runs before the API starts and:
 *
 *   - rotates the seeded administrator to SKYBOOK_ADMIN_EMAIL/PASSWORD
 *   - optionally enables a demo customer with SKYBOOK_DEMO_PASSWORD
 *   - otherwise disables the seeded demo customer
 *
 * It is idempotent, never prints a password/hash, and also bootstraps the base
 * schema when the target database is empty (Aiven, other managed MySQL).
 */
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const { ensureSchema } = require("./db-schema");
const { buildDbConfig } = require("./db-config");

const SEED_ADMIN_EMAIL = "admin@skybook.com";
const SEED_DEMO_EMAIL = "demo@skybook.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomPassword() {
  // Used only to make a disabled seed account unusable. It is never logged.
  return crypto.randomBytes(32).toString("base64url");
}

async function ensureUser(pool, { email, name, password, isAdmin }) {
  const hash = await bcrypt.hash(password, 10);
  const [rows] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
  let userId;

  if (rows.length) {
    userId = rows[0].id;
    await pool.query("UPDATE users SET passwordHash = ?, isActive = 1 WHERE id = ?", [hash, userId]);
  } else {
    const [result] = await pool.query(
      "INSERT INTO users (name, email, passwordHash, isActive) VALUES (?, ?, ?, 1)",
      [name, email, hash]
    );
    userId = result.insertId;
  }

  if (isAdmin) {
    await pool.query("INSERT IGNORE INTO admins (userId) VALUES (?)", [userId]);
  }
  return userId;
}

async function disableUser(pool, email) {
  const [rows] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
  if (!rows.length) return false;
  const hash = await bcrypt.hash(randomPassword(), 10);
  await pool.query("UPDATE users SET passwordHash = ?, isActive = 0 WHERE id = ?", [hash, rows[0].id]);
  return true;
}

async function main() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Deployment user preparation skipped (NODE_ENV is not production).");
    return;
  }

  const adminEmail = String(process.env.SKYBOOK_ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(process.env.SKYBOOK_ADMIN_PASSWORD || "");
  const demoPassword = String(process.env.SKYBOOK_DEMO_PASSWORD || "");
  const allowDemo = /^(1|true|yes|on)$/i.test(String(process.env.SKYBOOK_ALLOW_DEMO_ACCOUNTS || ""));

  if (adminPassword) {
    if (!EMAIL_RE.test(adminEmail)) {
      throw new Error("SKYBOOK_ADMIN_EMAIL must be a valid email address.");
    }
    if (adminPassword.length < 12 && !allowDemo) {
      throw new Error("SKYBOOK_ADMIN_PASSWORD must be at least 12 characters in production (or set SKYBOOK_ALLOW_DEMO_ACCOUNTS=true for a demo stack).");
    }
  }
  if (demoPassword && demoPassword.length < 8) {
    throw new Error("SKYBOOK_DEMO_PASSWORD must be at least 8 characters when set.");
  }

  const pool = mysql.createPool(buildDbConfig({
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0,
  }));

  try {
    // The DB container may still be running its init scripts, and a managed DB
    // may be completely empty. Retry briefly, then let ensureSchema create the
    // base tables from database/skybook.sql.
    let ready = false;
    for (let attempt = 1; attempt <= 30; attempt++) {
      try {
        await ensureSchema(pool);
        ready = true;
        break;
      } catch (error) {
        if (attempt === 30) throw error;
        console.log(`  … waiting for database schema (${attempt}/30)`);
        await sleep(1000);
      }
    }
    if (!ready) throw new Error("Database schema did not become ready.");

    if (adminPassword) {
      await ensureUser(pool, {
        email: adminEmail,
        name: "SkyBook Admin",
        password: adminPassword,
        isAdmin: true,
      });
      console.log(`  🔐 Administrator credentials prepared for ${adminEmail}.`);

      if (adminEmail !== SEED_ADMIN_EMAIL && await disableUser(pool, SEED_ADMIN_EMAIL)) {
        console.log("  🔒 Legacy seeded administrator disabled (custom admin email configured).");
      }
    } else {
      console.warn("  ⚠️  SKYBOOK_ADMIN_PASSWORD is empty; the seeded administrator was not rotated.");
    }

    if (demoPassword) {
      await ensureUser(pool, {
        email: SEED_DEMO_EMAIL,
        name: "Demo Traveler",
        password: demoPassword,
        isAdmin: false,
      });
      console.log("  🧪 Demo customer credentials prepared from environment.");
    } else if (!allowDemo && await disableUser(pool, SEED_DEMO_EMAIL)) {
      console.log("  🔒 Seeded demo customer disabled (set SKYBOOK_DEMO_PASSWORD to enable it).");
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("❌ Deployment user preparation failed:", error.message);
  process.exit(1);
});
