/**
 * Logical backup of critical SkyBook tables (does not drop or truncate).
 * Usage: node backup-db.js
 */
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

function readEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  });
  return vars;
}
const env = { ...readEnv(path.join(__dirname, "../../.env")), ...readEnv(path.join(__dirname, ".env")) };

async function main() {
  const pool = mysql.createPool({
    host: env.MYSQL_HOST || "127.0.0.1",
    port: Number(env.MYSQL_PORT) || 3306,
    user: env.MYSQL_USER || "root",
    password: env.MYSQL_PASSWORD || "",
    database: env.MYSQL_DATABASE || "skybook",
  });

  const [tables] = await pool.query("SHOW TABLES");
  const names = tables.map((r) => Object.values(r)[0]);
  console.log("TABLES:", names.join(", "));

  const counts = {};
  for (const t of names) {
    const [[{ c }]] = await pool.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
    counts[t] = c;
    console.log(`  ${t}: ${c}`);
  }

  const backup = { generatedAt: new Date().toISOString(), counts };
  const keep = ["users", "admins", "bookings", "fare_watches", "notifications", "account_preferences", "newsletter_subscribers"];
  for (const t of keep) {
    if (!names.includes(t)) continue;
    const [rows] = await pool.query(`SELECT * FROM \`${t}\``);
    backup[t] = rows;
  }

  const dir = path.join(__dirname, "../../database/backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.join(dir, `skybook-logical-backup-${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(backup, null, 2));
  console.log("BACKUP_OK", out, "bytes", fs.statSync(out).size);

  const [[minmax]] = await pool.query(
    "SELECT MIN(departureDate) AS minD, MAX(departureDate) AS maxD, COUNT(DISTINCT origin) AS origins, COUNT(DISTINCT destination) AS dests FROM flights"
  );
  console.log("FLIGHT_RANGE", minmax);
  await pool.end();
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
