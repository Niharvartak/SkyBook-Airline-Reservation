const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'src','backend','skybook.db'), { readonly: true });

// Users
const users = db.prepare('SELECT id, name, email, passwordHash, createdAt FROM users LIMIT 10').all();
console.log('USERS:', JSON.stringify(users, null, 2));

// Admins
const admins = db.prepare('SELECT * FROM admins').all();
console.log('ADMINS:', JSON.stringify(admins, null, 2));

// Sample flights (near future)
const flights = db.prepare("SELECT * FROM flights WHERE DATE(departureDate) >= DATE('now') LIMIT 10").all();
console.log('FLIGHTS_SAMPLE:', JSON.stringify(flights, null, 2));

// Table list
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('TABLES:', tables.map(t => t.name));
db.close();
