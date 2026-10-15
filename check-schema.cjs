const Database = require('better-sqlite3');
const db = new Database('./src/backend/skybook.db');
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bookings'").get();
console.log('BOOKINGS SCHEMA:');
console.log(schema.sql);
const cols = db.prepare("PRAGMA table_info(bookings)").all();
console.log('\nCOLUMNS:', cols.map(c => c.name).join(', '));
db.close();
