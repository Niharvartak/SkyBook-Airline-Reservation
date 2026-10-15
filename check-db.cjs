const Database = require('better-sqlite3');
const db = new Database('src/backend/skybook.db');
console.log('Today:', new Date().toISOString().slice(0, 10));
const today = db.prepare("SELECT COUNT(*) AS c FROM flights WHERE isActive=1 AND DATE(departureDate) >= DATE('now')").get().c;
console.log('Flights from today onwards:', today);
const nextWeek = db.prepare("SELECT COUNT(*) AS c FROM flights WHERE isActive=1 AND DATE(departureDate) BETWEEN DATE('now') AND DATE('now', '+7 days')").get().c;
console.log('Flights next 7 days:', nextWeek);
const sample = db.prepare("SELECT flightNumber, origin, destination, departureDate FROM flights WHERE isActive=1 AND DATE(departureDate) >= DATE('now') ORDER BY departureDate ASC LIMIT 5").all();
console.log('Sample upcoming:', sample);

// Check some specific routes
const mumbaiDelhi = db.prepare("SELECT COUNT(*) AS c FROM flights WHERE isActive=1 AND origin LIKE '%Mumbai%' AND destination LIKE '%Delhi%' AND DATE(departureDate) >= DATE('now')").get().c;
console.log('Mumbai->Delhi upcoming:', mumbaiDelhi);
db.close();
