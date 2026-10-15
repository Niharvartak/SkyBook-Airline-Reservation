const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

async function resetPasswords() {
  const db = new Database('./src/backend/skybook.db');
  const hash = await bcrypt.hash('password', 10);
  
  // Reset demo@skybook.com
  db.prepare("UPDATE users SET passwordHash = ? WHERE email = ?").run(hash, 'demo@skybook.com');
  console.log('✅ Reset demo@skybook.com password to "password"');
  
  // Reset admin@skybook.com
  db.prepare("UPDATE users SET passwordHash = ? WHERE email = ?").run(hash, 'admin@skybook.com');
  console.log('✅ Reset admin@skybook.com password to "password"');
  
  // Verify
  const users = db.prepare("SELECT id, name, email, passwordHash FROM users WHERE email IN ('demo@skybook.com', 'admin@skybook.com')").all();
  for (const u of users) {
    const valid = await bcrypt.compare('password', u.passwordHash);
    console.log(`${u.email}: hash valid = ${valid}`);
  }
  
  db.close();
}

resetPasswords().catch(console.error);
