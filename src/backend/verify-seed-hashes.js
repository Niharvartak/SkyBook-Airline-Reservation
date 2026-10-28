// Verifies that the password hashes in database/skybook.sql match the documented
// development credentials (Admin@123 / demo123). Run: node verify-seed-hashes.js
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const sql = fs.readFileSync(path.join(__dirname, "../../database/skybook.sql"), "utf8");
const hashes = [...sql.matchAll(/\$2[aby]\$\d\d\$[A-Za-z0-9./]{53}/g)].map(m => m[0]);
console.log(`Found ${hashes.length} bcrypt hash(es) in skybook.sql`);

let fail = 0;
const adminHash = hashes.find(h => sql.slice(Math.max(0, sql.indexOf(h) - 300), sql.indexOf(h)).includes("admin@skybook.com"));
const demoHash  = hashes.find(h => sql.slice(Math.max(0, sql.indexOf(h) - 300), sql.indexOf(h)).includes("demo@skybook.com"));

if (adminHash && bcrypt.compareSync("Admin@123", adminHash)) console.log("  OK  Admin@123 matches seeded admin hash");
else { console.log("  BAD admin hash does NOT match Admin@123"); fail++; }
if (demoHash && bcrypt.compareSync("demo123", demoHash)) console.log("  OK  demo123 matches seeded demo hash");
else { console.log("  BAD demo hash does NOT match demo123"); fail++; }

process.exit(fail ? 1 : 0);
