const Database = require('better-sqlite3');
const db = new Database('./src/backend/skybook.db');
const users = db.prepare("SELECT id, name, email FROM users WHERE email LIKE '%demo%' OR email LIKE '%admin%'").all();
console.log('Users:', JSON.stringify(users, null, 2));
db.close();
