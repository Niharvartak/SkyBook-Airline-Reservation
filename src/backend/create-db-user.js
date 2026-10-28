/**
 * Creates the skybook_app MySQL user used by the root .env (Docker/prod config).
 * Run once: node create-db-user.js
 */
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

function readEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

const rootEnv  = readEnv(path.join(__dirname, "../../.env"));
const SKYBOOK_USER = rootEnv.MYSQL_USER     || "skybook_app";
const SKYBOOK_PASS = rootEnv.MYSQL_PASSWORD  || "";
const SKYBOOK_DB   = rootEnv.MYSQL_DATABASE  || "skybook";

// Try root with no password first (local dev MariaDB default)
const ROOT_PASSWORDS = ["", rootEnv.MYSQL_ROOT_PASSWORD || ""].filter((v, i, a) => a.indexOf(v) === i);

console.log(`Target user: ${SKYBOOK_USER}  database: ${SKYBOOK_DB}`);

async function tryRootConnect(password) {
  const pool = mysql.createPool({ host: "127.0.0.1", port: 3306, user: "root", password, multipleStatements: false });
  try {
    await pool.query("SELECT 1");
    return pool;
  } catch {
    await pool.end();
    return null;
  }
}

async function main() {
  let pool = null;
  for (const pwd of ROOT_PASSWORDS) {
    pool = await tryRootConnect(pwd);
    if (pool) { console.log(`✅ Connected as root (password="${pwd ? "***" : "(empty)"}").`); break; }
  }
  if (!pool) { console.error("❌ Could not connect as root with any known password."); process.exit(1); }

  const hosts = ["localhost", "127.0.0.1", "::1"];
  for (const host of hosts) {
    try {
      await pool.query(`CREATE USER IF NOT EXISTS '${SKYBOOK_USER}'@'${host}' IDENTIFIED BY '${SKYBOOK_PASS}'`);
      await pool.query(`GRANT ALL PRIVILEGES ON \`${SKYBOOK_DB}\`.* TO '${SKYBOOK_USER}'@'${host}'`);
      console.log(`  ✅ '${SKYBOOK_USER}'@'${host}' — created/granted`);
    } catch (e) {
      console.error(`  ⚠️  '${host}': ${e.message}`);
    }
  }
  await pool.query("FLUSH PRIVILEGES");
  console.log("✅ FLUSH PRIVILEGES done");

  const testPool = mysql.createPool({ host: "127.0.0.1", port: 3306, user: SKYBOOK_USER, password: SKYBOOK_PASS, database: SKYBOOK_DB });
  try {
    const [[{ count }]] = await testPool.query("SELECT COUNT(*) AS count FROM flights");
    console.log(`✅ ${SKYBOOK_USER} connected successfully. Flights: ${count}`);
  } catch (e) {
    console.error(`❌ ${SKYBOOK_USER} connection failed: ${e.message}`);
  }
  await testPool.end();
  await pool.end();
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
