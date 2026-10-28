const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

function readEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  fs.readFileSync(filePath, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  });
  return vars;
}
const env = { ...readEnv(path.join(__dirname, '../../.env')), ...readEnv(path.join(__dirname, '.env')) };

async function main() {
  const pool = mysql.createPool({
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT) || 3306,
    user: 'root',
    password: '',
    database: env.MYSQL_DATABASE || 'skybook',
  });
  try {
    const [tables] = await pool.query("SHOW TABLES LIKE 'airports'");
    console.log('airports table exists:', tables.length > 0);
    const [idx] = await pool.query('SHOW INDEX FROM flights');
    const unique = idx.filter(i => i.Non_unique === 0);
    console.log('Unique indexes on flights:', JSON.stringify(unique.map(i => ({ name: i.Key_name, col: i.Column_name }))));
    const [flightCount] = await pool.query('SELECT COUNT(*) as c FROM flights WHERE departureDate >= CURDATE()');
    console.log('Flights from today:', flightCount[0].c);
  } catch (e) {
    console.error('ERR:', e.message);
  }
  await pool.end();
}
main();
