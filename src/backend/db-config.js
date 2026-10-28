/**
 * Shared MySQL/MariaDB connection options.
 *
 * Local Docker Compose and Aiven/other managed MySQL services use the same
 * environment variable names. Managed providers normally require TLS, so SSL
 * is opt-in through MYSQL_SSL. A CA can be supplied as a file path or as a
 * base64-encoded value (useful for hosting dashboards that only accept text).
 */
const fs = require("fs");

function truthy(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function buildSslOptions() {
  if (!truthy(process.env.MYSQL_SSL)) return undefined;

  const ssl = {
    // Aiven and most managed MySQL providers use a publicly trusted CA. For
    // providers that require a custom CA, set MYSQL_SSL_CA or MYSQL_SSL_CA_BASE64.
    rejectUnauthorized: !/^(0|false|no|off)$/i.test(String(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || "true")),
  };

  if (process.env.MYSQL_SSL_CA) {
    ssl.ca = fs.readFileSync(process.env.MYSQL_SSL_CA, "utf8");
  } else if (process.env.MYSQL_SSL_CA_BASE64) {
    ssl.ca = Buffer.from(process.env.MYSQL_SSL_CA_BASE64, "base64").toString("utf8");
  }

  return ssl;
}

function buildDbConfig(overrides = {}) {
  const config = {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "skybook",
    timezone: "+00:00",
    charset: "utf8mb4",
    decimalNumbers: true,
    ...overrides,
  };

  const ssl = buildSslOptions();
  if (ssl) config.ssl = ssl;
  return config;
}

module.exports = { buildDbConfig };
