/**
 * SkyBook – Comprehensive Airport & Flight Seeder
 * ─────────────────────────────────────────────────
 * Adds 56 airports (Indian + International), 100+ routes,
 * and generates flight schedules for 30 days from today.
 *
 * Safe to run multiple times (INSERT IGNORE / ON DUPLICATE KEY).
 * Does NOT delete existing bookings, users, or other data.
 *
 * Usage: node seed-airports-flights.js
 */

const mysql = require("mysql2/promise");
const path  = require("path");
const fs    = require("fs");

// ─── Load .env ───────────────────────────────────────────────────────────────
function readEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  });
  return vars;
}
const env = {
  ...readEnv(path.join(__dirname, "../../.env")),
  ...readEnv(path.join(__dirname, ".env")),
};

// ─── Airports ────────────────────────────────────────────────────────────────
// Format stored in flights table: "City Name (CODE)"
const AIRPORTS = [
  // ── Indian Domestic ──────────────────────────────────────────────────────
  { code: "BOM", city: "Mumbai",           name: "Chhatrapati Shivaji Maharaj International Airport", country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "DEL", city: "Delhi",            name: "Indira Gandhi International Airport",               country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "BLR", city: "Bengaluru",        name: "Kempegowda International Airport",                  country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "HYD", city: "Hyderabad",        name: "Rajiv Gandhi International Airport",                country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "MAA", city: "Chennai",          name: "Chennai International Airport",                     country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "CCU", city: "Kolkata",          name: "Netaji Subhas Chandra Bose International Airport",  country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "PNQ", city: "Pune",             name: "Pune International Airport",                        country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "AMD", city: "Ahmedabad",        name: "Sardar Vallabhbhai Patel International Airport",    country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "GOI", city: "Goa",              name: "Goa International Airport (Dabolim)",               country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "COK", city: "Kochi",            name: "Cochin International Airport",                      country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "JAI", city: "Jaipur",           name: "Jaipur International Airport",                      country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "LKO", city: "Lucknow",          name: "Chaudhary Charan Singh International Airport",      country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "IXC", city: "Chandigarh",       name: "Chandigarh Airport",                                country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "IDR", city: "Indore",           name: "Devi Ahilyabai Holkar Airport",                     country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "NAG", city: "Nagpur",           name: "Dr. Babasaheb Ambedkar International Airport",      country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "SXR", city: "Srinagar",         name: "Sheikh ul-Alam International Airport",              country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "VNS", city: "Varanasi",         name: "Lal Bahadur Shastri International Airport",         country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "BBI", city: "Bhubaneswar",      name: "Biju Patnaik International Airport",                country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "GAU", city: "Guwahati",         name: "Lokpriya Gopinath Bordoloi International Airport",  country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "PAT", city: "Patna",            name: "Jay Prakash Narayan International Airport",         country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "CJB", city: "Coimbatore",       name: "Coimbatore International Airport",                  country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "TRV", city: "Thiruvananthapuram",name:"Trivandrum International Airport",                  country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "IXE", city: "Mangaluru",        name: "Mangaluru International Airport",                   country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "VTZ", city: "Visakhapatnam",    name: "Visakhapatnam Airport",                             country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "ATQ", city: "Amritsar",         name: "Sri Guru Ram Dass Jee International Airport",       country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "DED", city: "Dehradun",         name: "Jolly Grant Airport",                               country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "IXR", city: "Ranchi",           name: "Birsa Munda Airport",                               country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "RPR", city: "Raipur",           name: "Swami Vivekananda Airport",                         country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "STV", city: "Surat",            name: "Surat Airport",                                     country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  { code: "BDQ", city: "Vadodara",         name: "Vadodara Airport",                                  country: "India",       timezone: "Asia/Kolkata",      region: "domestic" },
  // ── International ────────────────────────────────────────────────────────
  { code: "DXB", city: "Dubai",            name: "Dubai International Airport",                       country: "UAE",         timezone: "Asia/Dubai",        region: "international" },
  { code: "AUH", city: "Abu Dhabi",        name: "Abu Dhabi International Airport",                   country: "UAE",         timezone: "Asia/Dubai",        region: "international" },
  { code: "SIN", city: "Singapore",        name: "Singapore Changi Airport",                          country: "Singapore",   timezone: "Asia/Singapore",    region: "international" },
  { code: "BKK", city: "Bangkok",          name: "Suvarnabhumi Airport",                              country: "Thailand",    timezone: "Asia/Bangkok",      region: "international" },
  { code: "KUL", city: "Kuala Lumpur",     name: "Kuala Lumpur International Airport",                country: "Malaysia",    timezone: "Asia/Kuala_Lumpur", region: "international" },
  { code: "LHR", city: "London",           name: "Heathrow Airport",                                  country: "UK",          timezone: "Europe/London",     region: "international" },
  { code: "CDG", city: "Paris",            name: "Charles de Gaulle Airport",                         country: "France",      timezone: "Europe/Paris",      region: "international" },
  { code: "JFK", city: "New York",         name: "John F. Kennedy International Airport",             country: "USA",         timezone: "America/New_York",  region: "international" },
  { code: "FRA", city: "Frankfurt",        name: "Frankfurt Airport",                                 country: "Germany",     timezone: "Europe/Berlin",     region: "international" },
  { code: "DOH", city: "Doha",             name: "Hamad International Airport",                       country: "Qatar",       timezone: "Asia/Qatar",        region: "international" },
  { code: "MCT", city: "Muscat",           name: "Muscat International Airport",                      country: "Oman",        timezone: "Asia/Muscat",       region: "international" },
  { code: "CMB", city: "Colombo",          name: "Bandaranaike International Airport",                country: "Sri Lanka",   timezone: "Asia/Colombo",      region: "international" },
  { code: "KTM", city: "Kathmandu",        name: "Tribhuvan International Airport",                   country: "Nepal",       timezone: "Asia/Kathmandu",    region: "international" },
  { code: "MLE", city: "Male",             name: "Velana International Airport",                      country: "Maldives",    timezone: "Indian/Maldives",   region: "international" },
  { code: "HKG", city: "Hong Kong",        name: "Hong Kong International Airport",                   country: "Hong Kong",   timezone: "Asia/Hong_Kong",    region: "international" },
  { code: "HND", city: "Tokyo",            name: "Tokyo Haneda Airport",                              country: "Japan",       timezone: "Asia/Tokyo",        region: "international" },
  { code: "ICN", city: "Seoul",            name: "Incheon International Airport",                     country: "South Korea", timezone: "Asia/Seoul",        region: "international" },
  { code: "IST", city: "Istanbul",         name: "Istanbul Airport",                                  country: "Turkey",      timezone: "Europe/Istanbul",   region: "international" },
  { code: "ZRH", city: "Zurich",           name: "Zurich Airport",                                    country: "Switzerland", timezone: "Europe/Zurich",     region: "international" },
  { code: "AMS", city: "Amsterdam",        name: "Amsterdam Schiphol Airport",                        country: "Netherlands", timezone: "Europe/Amsterdam",  region: "international" },
  { code: "JED", city: "Jeddah",           name: "King Abdulaziz International Airport",              country: "Saudi Arabia",timezone: "Asia/Riyadh",       region: "international" },
  { code: "RUH", city: "Riyadh",           name: "King Khalid International Airport",                 country: "Saudi Arabia",timezone: "Asia/Riyadh",       region: "international" },
  { code: "MRU", city: "Mauritius",        name: "Sir Seewoosagur Ramgoolam International Airport",   country: "Mauritius",   timezone: "Indian/Mauritius",  region: "international" },
  { code: "PER", city: "Perth",            name: "Perth Airport",                                     country: "Australia",   timezone: "Australia/Perth",   region: "international" },
  { code: "SYD", city: "Sydney",           name: "Sydney Kingsford Smith Airport",                    country: "Australia",   timezone: "Australia/Sydney",  region: "international" },
  { code: "MEL", city: "Melbourne",        name: "Melbourne Airport",                                 country: "Australia",   timezone: "Australia/Melbourne",region: "international" },
];

// Helper: airport display string used in flights table
function airportLabel(code) {
  const a = AIRPORTS.find(x => x.code === code);
  if (!a) throw new Error(`Unknown airport code: ${code}`);
  return `${a.city} (${a.code})`;
}

// ─── Route Templates ─────────────────────────────────────────────────────────
// [ flightNumber, airline, originCode, destCode, depTime, arrTime, priceINR ]
const ROUTES = [
  // ── BOM → ... ────────────────────────────────────────────────────────────
  ["SK-101",  "SkyBook Airlines",      "BOM","DEL",  "06:00 AM","08:15 AM",  4999],
  ["SK-102",  "SkyBook Express",       "BOM","DEL",  "01:00 PM","03:15 PM",  5299],
  ["SK-103",  "IndiGo",                "BOM","DEL",  "08:30 PM","10:45 PM",  4750],
  ["SK-104",  "Air India",             "BOM","DEL",  "11:00 AM","01:15 PM",  5599],
  ["SK-111",  "SkyBook Airlines",      "BOM","BLR",  "07:00 AM","08:20 AM",  3800],
  ["SK-112",  "IndiGo",                "BOM","BLR",  "02:00 PM","03:20 PM",  3650],
  ["SK-113",  "SpiceJet",              "BOM","BLR",  "09:00 PM","10:20 PM",  3400],
  ["SK-121",  "SkyBook Airlines",      "BOM","GOI",  "07:30 AM","08:45 AM",  2999],
  ["SK-122",  "IndiGo",                "BOM","GOI",  "04:00 PM","05:15 PM",  2800],
  ["SK-131",  "SkyBook Airlines",      "BOM","HYD",  "08:00 AM","09:30 AM",  3500],
  ["SK-132",  "Air India",             "BOM","HYD",  "06:00 PM","07:30 PM",  3700],
  ["SK-141",  "SkyBook Airlines",      "BOM","MAA",  "06:30 AM","08:15 AM",  4200],
  ["SK-142",  "SpiceJet",              "BOM","MAA",  "03:00 PM","04:45 PM",  3900],
  ["SK-151",  "SkyBook Airlines",      "BOM","CCU",  "05:30 AM","08:30 AM",  5500],
  ["SK-152",  "Air India",             "BOM","CCU",  "02:30 PM","05:30 PM",  5200],
  ["SK-161",  "SkyBook Airlines",      "BOM","AMD",  "07:00 AM","08:00 AM",  1999],
  ["SK-162",  "IndiGo",                "BOM","AMD",  "12:00 PM","01:00 PM",  1800],
  ["SK-171",  "SkyBook Airlines",      "BOM","COK",  "06:00 AM","07:45 AM",  3600],
  ["SK-181",  "SkyBook Airlines",      "BOM","JAI",  "09:00 AM","10:45 AM",  3200],
  ["SK-191",  "SkyBook Airlines",      "BOM","PNQ",  "08:00 AM","08:45 AM",  1500],
  ["SK-192",  "IndiGo",                "BOM","PNQ",  "06:00 PM","06:45 PM",  1400],
  ["SK-201",  "SkyBook International", "BOM","DXB",  "09:00 PM","11:00 PM", 12500],
  ["SK-202",  "SkyBook International", "BOM","DXB",  "02:00 AM","04:00 AM", 11800],
  ["SK-203",  "SkyBook International", "BOM","SIN",  "10:00 PM","06:30 AM", 18000],
  ["SK-204",  "SkyBook International", "BOM","BKK",  "11:30 PM","06:00 AM", 15500],
  ["SK-205",  "SkyBook International", "BOM","KUL",  "08:00 AM","04:30 PM", 16000],
  ["SK-206",  "SkyBook International", "BOM","LHR",  "01:30 AM","07:30 AM", 48000],
  ["SK-207",  "SkyBook International", "BOM","JFK",  "10:00 PM","05:30 AM", 65000],
  ["SK-208",  "SkyBook International", "BOM","DOH",  "08:00 PM","10:30 PM", 11000],
  ["SK-209",  "SkyBook International", "BOM","MCT",  "07:00 PM","09:00 PM", 10500],
  ["SK-210",  "SkyBook International", "BOM","AUH",  "11:00 PM","01:15 AM", 12000],
  ["SK-211",  "SkyBook International", "BOM","MLE",  "05:30 AM","07:15 AM",  8500],
  ["SK-212",  "SkyBook International", "BOM","CMB",  "06:00 AM","07:30 AM",  7000],
  ["SK-213",  "SkyBook International", "BOM","FRA",  "02:00 AM","07:00 AM", 52000],
  ["SK-214",  "SkyBook International", "BOM","CDG",  "01:00 AM","06:30 AM", 49000],
  ["SK-215",  "SkyBook International", "BOM","JED",  "04:30 AM","07:30 AM", 14000],
  ["SK-216",  "SkyBook International", "BOM","MRU",  "09:00 PM","01:00 AM", 22000],
  // ── DEL → ... ────────────────────────────────────────────────────────────
  ["SK-301",  "SkyBook Airlines",      "DEL","BOM",  "07:00 AM","09:15 AM",  4700],
  ["SK-302",  "Air India",             "DEL","BOM",  "05:30 PM","07:45 PM",  5100],
  ["SK-303",  "IndiGo",                "DEL","BOM",  "10:00 PM","12:15 AM",  4500],
  ["SK-311",  "SkyBook Airlines",      "DEL","BLR",  "06:00 AM","09:00 AM",  5200],
  ["SK-312",  "Air India",             "DEL","BLR",  "02:00 PM","05:00 PM",  5500],
  ["SK-313",  "SpiceJet",              "DEL","BLR",  "09:30 PM","12:30 AM",  4800],
  ["SK-321",  "SkyBook Airlines",      "DEL","HYD",  "07:30 AM","10:00 AM",  4800],
  ["SK-322",  "IndiGo",                "DEL","HYD",  "01:30 PM","04:00 PM",  4600],
  ["SK-331",  "SkyBook Airlines",      "DEL","MAA",  "08:00 AM","10:30 AM",  5100],
  ["SK-332",  "Air India",             "DEL","MAA",  "04:00 PM","06:30 PM",  5300],
  ["SK-341",  "SkyBook Airlines",      "DEL","CCU",  "09:00 AM","11:30 AM",  4300],
  ["SK-342",  "IndiGo",                "DEL","CCU",  "03:00 PM","05:30 PM",  4100],
  ["SK-351",  "SkyBook Airlines",      "DEL","GOI",  "11:30 AM","02:00 PM",  3499],
  ["SK-361",  "SkyBook Airlines",      "DEL","JAI",  "08:30 AM","09:30 AM",  1800],
  ["SK-362",  "IndiGo",                "DEL","JAI",  "05:00 PM","06:00 PM",  1700],
  ["SK-371",  "SkyBook Airlines",      "DEL","LKO",  "07:00 AM","08:00 AM",  2200],
  ["SK-381",  "SkyBook Airlines",      "DEL","SXR",  "09:00 AM","10:30 AM",  3800],
  ["SK-382",  "Air India",             "DEL","SXR",  "03:00 PM","04:30 PM",  3600],
  ["SK-391",  "SkyBook Airlines",      "DEL","VNS",  "07:30 AM","08:45 AM",  2600],
  ["SK-401",  "SkyBook Airlines",      "DEL","ATQ",  "06:30 AM","07:45 AM",  2300],
  ["SK-411",  "SkyBook Airlines",      "DEL","IXC",  "09:00 AM","10:00 AM",  2100],
  ["SK-421",  "SkyBook International", "DEL","DXB",  "08:00 PM","10:00 PM", 13000],
  ["SK-422",  "SkyBook International", "DEL","DXB",  "01:00 AM","03:00 AM", 12500],
  ["SK-423",  "SkyBook International", "DEL","LHR",  "09:30 PM","02:00 AM", 46000],
  ["SK-424",  "SkyBook International", "DEL","CDG",  "10:00 PM","03:00 AM", 48000],
  ["SK-425",  "SkyBook International", "DEL","JFK",  "11:00 PM","07:00 AM", 66000],
  ["SK-426",  "SkyBook International", "DEL","SIN",  "08:30 PM","07:00 AM", 19000],
  ["SK-427",  "SkyBook International", "DEL","DOH",  "07:00 PM","09:30 PM", 11500],
  ["SK-428",  "SkyBook International", "DEL","FRA",  "08:00 PM","01:30 AM", 53000],
  ["SK-429",  "SkyBook International", "DEL","AMS",  "09:00 PM","02:00 AM", 51000],
  ["SK-430",  "SkyBook International", "DEL","IST",  "06:00 PM","11:00 PM", 38000],
  ["SK-431",  "SkyBook International", "DEL","JED",  "05:30 AM","08:00 AM", 14500],
  ["SK-432",  "SkyBook International", "DEL","RUH",  "04:30 AM","07:30 AM", 15000],
  ["SK-433",  "SkyBook International", "DEL","KTM",  "07:00 AM","08:30 AM",  5500],
  // ── BLR → ... ────────────────────────────────────────────────────────────
  ["SK-501",  "SkyBook Airlines",      "BLR","DEL",  "05:30 AM","08:30 AM",  5100],
  ["SK-502",  "IndiGo",                "BLR","DEL",  "12:00 PM","03:00 PM",  4900],
  ["SK-503",  "Air India",             "BLR","DEL",  "08:00 PM","11:00 PM",  5300],
  ["SK-511",  "SkyBook Airlines",      "BLR","BOM",  "09:00 AM","10:30 AM",  3700],
  ["SK-512",  "SpiceJet",              "BLR","BOM",  "04:00 PM","05:30 PM",  3500],
  ["SK-521",  "SkyBook Airlines",      "BLR","HYD",  "07:00 AM","08:00 AM",  2200],
  ["SK-522",  "IndiGo",                "BLR","HYD",  "03:00 PM","04:00 PM",  2100],
  ["SK-531",  "SkyBook Airlines",      "BLR","MAA",  "08:00 AM","09:10 AM",  2100],
  ["SK-532",  "Air India",             "BLR","MAA",  "05:30 PM","06:40 PM",  2300],
  ["SK-541",  "SkyBook Airlines",      "BLR","COK",  "07:30 AM","08:30 AM",  2800],
  ["SK-551",  "SkyBook Airlines",      "BLR","CCU",  "06:00 AM","09:00 AM",  5800],
  ["SK-561",  "SkyBook International", "BLR","SIN",  "09:00 PM","05:30 AM", 17500],
  ["SK-562",  "SkyBook International", "BLR","DXB",  "10:00 PM","12:30 AM", 13500],
  ["SK-563",  "SkyBook International", "BLR","BKK",  "11:00 PM","07:00 AM", 16000],
  // ── HYD → ... ────────────────────────────────────────────────────────────
  ["SK-601",  "SkyBook Airlines",      "HYD","DEL",  "06:00 AM","08:30 AM",  4800],
  ["SK-602",  "Air India",             "HYD","DEL",  "01:00 PM","03:30 PM",  5000],
  ["SK-611",  "SkyBook Airlines",      "HYD","BOM",  "07:00 AM","08:30 AM",  3300],
  ["SK-612",  "SpiceJet",              "HYD","BOM",  "05:00 PM","06:30 PM",  3100],
  ["SK-621",  "SkyBook Airlines",      "HYD","BLR",  "09:00 AM","10:00 AM",  2200],
  ["SK-631",  "SkyBook Airlines",      "HYD","CCU",  "07:30 AM","10:30 AM",  5200],
  ["SK-641",  "SkyBook International", "HYD","DXB",  "08:00 PM","10:15 PM", 12800],
  ["SK-642",  "SkyBook International", "HYD","SIN",  "10:00 PM","07:00 AM", 18500],
  // ── MAA → ... ────────────────────────────────────────────────────────────
  ["SK-701",  "SkyBook Airlines",      "MAA","DEL",  "07:00 AM","09:30 AM",  5300],
  ["SK-702",  "Air India",             "MAA","DEL",  "03:00 PM","05:30 PM",  5100],
  ["SK-711",  "SkyBook Airlines",      "MAA","BOM",  "08:00 AM","09:45 AM",  3600],
  ["SK-712",  "IndiGo",                "MAA","BOM",  "04:00 PM","05:45 PM",  3400],
  ["SK-721",  "SkyBook Airlines",      "MAA","BLR",  "06:30 AM","07:40 AM",  2100],
  ["SK-731",  "SkyBook Airlines",      "MAA","HYD",  "09:00 AM","10:15 AM",  2400],
  ["SK-741",  "SkyBook Airlines",      "MAA","COK",  "07:00 AM","08:15 AM",  2600],
  ["SK-751",  "SkyBook International", "MAA","SIN",  "08:30 PM","04:30 AM", 17000],
  ["SK-752",  "SkyBook International", "MAA","DXB",  "09:00 PM","11:30 PM", 13000],
  ["SK-753",  "SkyBook International", "MAA","CMB",  "08:00 AM","09:15 AM",  6500],
  // ── CCU → ... ────────────────────────────────────────────────────────────
  ["SK-801",  "SkyBook Airlines",      "CCU","DEL",  "06:00 AM","08:30 AM",  4300],
  ["SK-802",  "Air India",             "CCU","DEL",  "02:00 PM","04:30 PM",  4100],
  ["SK-811",  "SkyBook Airlines",      "CCU","BOM",  "07:00 AM","10:00 AM",  5500],
  ["SK-821",  "SkyBook Airlines",      "CCU","BLR",  "08:00 AM","11:00 AM",  5800],
  ["SK-831",  "SkyBook Airlines",      "CCU","GAU",  "06:30 AM","07:45 AM",  2800],
  ["SK-841",  "SkyBook International", "CCU","BKK",  "09:00 PM","05:00 AM", 14000],
  ["SK-842",  "SkyBook International", "CCU","SIN",  "10:30 PM","07:00 AM", 16500],
  // ── GOI → ... ────────────────────────────────────────────────────────────
  ["SK-901",  "SkyBook Airlines",      "GOI","BOM",  "10:00 AM","11:15 AM",  3100],
  ["SK-902",  "IndiGo",                "GOI","BOM",  "05:00 PM","06:15 PM",  2900],
  ["SK-911",  "SkyBook Airlines",      "GOI","DEL",  "11:00 AM","01:30 PM",  4200],
  ["SK-921",  "SkyBook Airlines",      "GOI","BLR",  "08:30 AM","10:00 AM",  2600],
  // ── PNQ → ... ────────────────────────────────────────────────────────────
  ["SK-951",  "SkyBook Airlines",      "PNQ","DEL",  "07:00 AM","09:30 AM",  5000],
  ["SK-952",  "IndiGo",                "PNQ","DEL",  "03:00 PM","05:30 PM",  4800],
  ["SK-961",  "SkyBook Airlines",      "PNQ","BLR",  "09:00 AM","10:30 AM",  3200],
  ["SK-971",  "SkyBook Airlines",      "PNQ","HYD",  "08:00 AM","09:30 AM",  2900],
  // ── AMD → ... ────────────────────────────────────────────────────────────
  ["SK-1001", "SkyBook Airlines",      "AMD","DEL",  "07:30 AM","09:00 AM",  3200],
  ["SK-1011", "SkyBook Airlines",      "AMD","BOM",  "06:00 AM","07:00 AM",  1999],
  // ── JAI → ... ────────────────────────────────────────────────────────────
  ["SK-1051", "SkyBook Airlines",      "JAI","DEL",  "09:00 AM","10:00 AM",  1800],
  ["SK-1061", "SkyBook Airlines",      "JAI","BOM",  "07:00 AM","09:00 AM",  3500],
  // ── COK → ... ────────────────────────────────────────────────────────────
  ["SK-1101", "SkyBook Airlines",      "COK","BOM",  "08:00 AM","09:45 AM",  3600],
  ["SK-1111", "SkyBook Airlines",      "COK","DEL",  "06:00 AM","09:00 AM",  5800],
  ["SK-1121", "SkyBook International", "COK","DXB",  "07:00 PM","09:15 PM", 12000],
  ["SK-1122", "SkyBook International", "COK","MCT",  "08:00 PM","10:00 PM", 10000],
  // ── LKO → ... ────────────────────────────────────────────────────────────
  ["SK-1151", "SkyBook Airlines",      "LKO","DEL",  "06:00 AM","07:00 AM",  2200],
  ["SK-1161", "SkyBook Airlines",      "LKO","BOM",  "08:00 AM","10:30 AM",  4800],
  // ── SXR → ... ────────────────────────────────────────────────────────────
  ["SK-1201", "SkyBook Airlines",      "SXR","DEL",  "10:00 AM","11:30 AM",  3800],
  ["SK-1211", "SkyBook Airlines",      "SXR","BOM",  "12:00 PM","02:30 PM",  5500],
  // ── VNS → ... ────────────────────────────────────────────────────────────
  ["SK-1251", "SkyBook Airlines",      "VNS","DEL",  "07:00 AM","08:15 AM",  2600],
  ["SK-1261", "SkyBook Airlines",      "VNS","BOM",  "09:00 AM","11:30 AM",  5200],
  // ── ATQ → ... ────────────────────────────────────────────────────────────
  ["SK-1301", "SkyBook Airlines",      "ATQ","DEL",  "08:00 AM","09:15 AM",  2300],
  // ── IXC → ... ────────────────────────────────────────────────────────────
  ["SK-1351", "SkyBook Airlines",      "IXC","DEL",  "07:30 AM","08:30 AM",  2100],
  // ── IDR → ... ────────────────────────────────────────────────────────────
  ["SK-1401", "SkyBook Airlines",      "IDR","DEL",  "08:00 AM","09:30 AM",  3500],
  ["SK-1411", "SkyBook Airlines",      "IDR","BOM",  "07:00 AM","08:30 AM",  2800],
  // ── NAG → ... ────────────────────────────────────────────────────────────
  ["SK-1451", "SkyBook Airlines",      "NAG","DEL",  "09:00 AM","11:00 AM",  4000],
  ["SK-1461", "SkyBook Airlines",      "NAG","BOM",  "07:30 AM","09:00 AM",  3000],
  // ── BBI → ... ────────────────────────────────────────────────────────────
  ["SK-1501", "SkyBook Airlines",      "BBI","DEL",  "06:30 AM","09:00 AM",  4500],
  ["SK-1511", "SkyBook Airlines",      "BBI","BOM",  "08:00 AM","11:00 AM",  5200],
  // ── GAU → ... ────────────────────────────────────────────────────────────
  ["SK-1551", "SkyBook Airlines",      "GAU","DEL",  "07:00 AM","09:30 AM",  5000],
  ["SK-1561", "SkyBook Airlines",      "GAU","CCU",  "09:00 AM","10:15 AM",  2800],
  // ── PAT → ... ────────────────────────────────────────────────────────────
  ["SK-1601", "SkyBook Airlines",      "PAT","DEL",  "07:30 AM","09:00 AM",  3800],
  // ── CJB → ... ────────────────────────────────────────────────────────────
  ["SK-1651", "SkyBook Airlines",      "CJB","BOM",  "07:00 AM","08:45 AM",  3400],
  ["SK-1661", "SkyBook Airlines",      "CJB","BLR",  "09:00 AM","10:15 AM",  2200],
  // ── TRV → ... ────────────────────────────────────────────────────────────
  ["SK-1701", "SkyBook Airlines",      "TRV","BOM",  "08:00 AM","09:55 AM",  3700],
  ["SK-1711", "SkyBook Airlines",      "TRV","DEL",  "06:00 AM","09:00 AM",  5900],
  ["SK-1721", "SkyBook International", "TRV","DXB",  "07:00 PM","09:30 PM", 11500],
  ["SK-1722", "SkyBook International", "TRV","MCT",  "08:00 PM","10:15 PM",  9800],
  // ── IXE → ... ────────────────────────────────────────────────────────────
  ["SK-1751", "SkyBook Airlines",      "IXE","BOM",  "08:30 AM","10:15 AM",  3900],
  ["SK-1761", "SkyBook Airlines",      "IXE","BLR",  "06:00 AM","07:30 AM",  2400],
  // ── VTZ → ... ────────────────────────────────────────────────────────────
  ["SK-1801", "SkyBook Airlines",      "VTZ","HYD",  "07:00 AM","08:00 AM",  2500],
  ["SK-1811", "SkyBook Airlines",      "VTZ","DEL",  "09:00 AM","11:30 AM",  4800],
  // ── DED → ... ────────────────────────────────────────────────────────────
  ["SK-1851", "SkyBook Airlines",      "DED","DEL",  "07:00 AM","08:00 AM",  2000],
  // ── IXR → ... ────────────────────────────────────────────────────────────
  ["SK-1901", "SkyBook Airlines",      "IXR","DEL",  "08:00 AM","09:30 AM",  3600],
  ["SK-1911", "SkyBook Airlines",      "IXR","BOM",  "10:00 AM","12:30 PM",  5200],
  // ── RPR → ... ────────────────────────────────────────────────────────────
  ["SK-1951", "SkyBook Airlines",      "RPR","DEL",  "07:30 AM","09:15 AM",  4000],
  ["SK-1961", "SkyBook Airlines",      "RPR","BOM",  "09:00 AM","11:30 AM",  5000],
  // ── STV → ... ────────────────────────────────────────────────────────────
  ["SK-2001", "SkyBook Airlines",      "STV","BOM",  "07:00 AM","07:55 AM",  1600],
  ["SK-2011", "SkyBook Airlines",      "STV","DEL",  "09:00 AM","10:45 AM",  3500],
  // ── BDQ → ... ────────────────────────────────────────────────────────────
  ["SK-2051", "SkyBook Airlines",      "BDQ","BOM",  "06:30 AM","07:30 AM",  1700],
  ["SK-2061", "SkyBook Airlines",      "BDQ","DEL",  "08:00 AM","09:45 AM",  3200],
  // ── International return hubs → India ────────────────────────────────────
  ["SK-2101", "SkyBook International", "DXB","BOM",  "02:00 AM","06:00 AM", 12500],
  ["SK-2102", "SkyBook International", "DXB","DEL",  "03:00 AM","07:00 AM", 13000],
  ["SK-2103", "SkyBook International", "DXB","BLR",  "01:00 AM","05:30 AM", 13500],
  ["SK-2104", "SkyBook International", "DXB","COK",  "04:00 AM","08:15 AM", 12000],
  ["SK-2105", "SkyBook International", "DXB","TRV",  "05:00 AM","09:30 AM", 11500],
  ["SK-2106", "SkyBook International", "DXB","HYD",  "02:30 AM","07:00 AM", 12800],
  ["SK-2111", "SkyBook International", "SIN","BOM",  "11:00 PM","02:30 AM", 18000],
  ["SK-2112", "SkyBook International", "SIN","DEL",  "10:00 PM","01:00 AM", 19000],
  ["SK-2113", "SkyBook International", "SIN","BLR",  "09:00 PM","12:30 AM", 17500],
  ["SK-2121", "SkyBook International", "BKK","BOM",  "10:00 PM","01:30 AM", 15500],
  ["SK-2122", "SkyBook International", "BKK","DEL",  "11:00 PM","02:30 AM", 16000],
  ["SK-2131", "SkyBook International", "LHR","DEL",  "10:00 PM","10:00 AM", 46000],
  ["SK-2132", "SkyBook International", "LHR","BOM",  "11:00 PM","11:00 AM", 48000],
  ["SK-2141", "SkyBook International", "JFK","BOM",  "09:00 PM","11:00 PM", 65000],
  ["SK-2142", "SkyBook International", "JFK","DEL",  "10:00 PM","12:00 AM", 66000],
  ["SK-2151", "SkyBook International", "DOH","BOM",  "11:30 PM","05:30 AM", 11000],
  ["SK-2152", "SkyBook International", "DOH","DEL",  "10:30 PM","04:30 AM", 11500],
  ["SK-2153", "SkyBook International", "MCT","COK",  "11:00 PM","03:15 AM", 10000],
  ["SK-2161", "SkyBook International", "CMB","BOM",  "10:00 AM","12:00 PM",  7000],
  ["SK-2162", "SkyBook International", "CMB","MAA",  "11:00 AM","12:15 PM",  6500],
  ["SK-2171", "SkyBook International", "KTM","DEL",  "09:00 AM","10:30 AM",  5500],
  ["SK-2181", "SkyBook International", "MLE","BOM",  "09:00 AM","10:45 AM",  8500],
  ["SK-2191", "SkyBook International", "AUH","BOM",  "03:00 AM","07:30 AM", 12000],
  ["SK-2192", "SkyBook International", "AUH","DEL",  "04:00 AM","08:30 AM", 12500],
  ["SK-2201", "SkyBook International", "KUL","BOM",  "01:00 AM","05:00 AM", 16000],
  ["SK-2211", "SkyBook International", "CDG","BOM",  "09:00 PM","09:00 AM", 49000],
  ["SK-2212", "SkyBook International", "CDG","DEL",  "10:00 PM","10:00 AM", 48000],
  ["SK-2221", "SkyBook International", "FRA","BOM",  "10:00 PM","10:00 AM", 52000],
  ["SK-2231", "SkyBook International", "IST","DEL",  "11:00 PM","08:00 AM", 38000],
  ["SK-2241", "SkyBook International", "AMS","DEL",  "09:00 PM","07:30 AM", 51000],
  ["SK-2251", "SkyBook International", "ZRH","BOM",  "10:00 PM","10:00 AM", 54000],
  ["SK-2261", "SkyBook International", "JED","BOM",  "09:00 PM","01:00 AM", 14000],
  ["SK-2262", "SkyBook International", "JED","DEL",  "10:00 PM","02:00 AM", 14500],
  ["SK-2271", "SkyBook International", "RUH","DEL",  "11:00 PM","03:00 AM", 15000],
  ["SK-2281", "SkyBook International", "HKG","BOM",  "11:30 PM","05:00 AM", 24000],
  ["SK-2291", "SkyBook International", "HND","DEL",  "11:00 PM","06:00 AM", 38000],
  ["SK-2301", "SkyBook International", "ICN","DEL",  "10:00 PM","05:00 AM", 35000],
  ["SK-2311", "SkyBook International", "MRU","BOM",  "11:00 PM","05:00 AM", 22000],
  ["SK-2321", "SkyBook International", "SYD","BOM",  "09:00 PM","07:00 AM", 55000],
  ["SK-2331", "SkyBook International", "MEL","BOM",  "10:00 PM","08:00 AM", 57000],
  ["SK-2341", "SkyBook International", "PER","BOM",  "08:00 PM","02:00 AM", 42000],
];

// ─── Seat Layout ─────────────────────────────────────────────────────────────
const SEAT_COLS = ["A","B","C","D","E","F"];
const SEAT_ROWS = 30; // 180 seats per flight (rows 1-2 = Business, 3-30 = Economy)
const DAYS_AHEAD = 30;

function dateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  // Use the machine's calendar date (matches MySQL CURDATE()), not the UTC date.
  const pad = value => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function createAirportsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS airports (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      code        CHAR(3) NOT NULL UNIQUE,
      city        VARCHAR(100) NOT NULL,
      airportName VARCHAR(200) NOT NULL,
      country     VARCHAR(100) NOT NULL,
      timezone    VARCHAR(60)  NOT NULL DEFAULT 'UTC',
      region      ENUM('domestic','international') NOT NULL DEFAULT 'domestic',
      createdAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_airports_region (region),
      INDEX idx_airports_country (country)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("✅ airports table ready");
}

async function seedAirports(pool) {
  let ins = 0, skip = 0;
  for (const a of AIRPORTS) {
    const [r] = await pool.query(
      `INSERT INTO airports (code, city, airportName, country, timezone, region)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         city = VALUES(city), airportName = VALUES(airportName),
         country = VALUES(country), timezone = VALUES(timezone), region = VALUES(region)`,
      [a.code, a.city, a.name, a.country, a.timezone, a.region]
    );
    if (r.affectedRows > 0) ins++; else skip++;
  }
  console.log(`✅ Airports seeded: ${ins} inserted/updated, ${skip} unchanged`);
}

async function seedFlights(pool) {
  let inserted = 0, skipped = 0, seatIns = 0;

  for (let day = 0; day <= DAYS_AHEAD; day++) {
    const date = dateStr(day);
    for (const [flightNumber, airline, originCode, destCode, depTime, arrTime, price] of ROUTES) {
      const origin      = airportLabel(originCode);
      const destination = airportLabel(destCode);
      try {
        const [r] = await pool.query(
          `INSERT IGNORE INTO flights
             (flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, price, status, availableSeats, isActive)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'On Time', ?, 1)`,
          [flightNumber, airline, origin, destination, date, depTime, arrTime, price, SEAT_ROWS * SEAT_COLS.length]
        );

        if (r.affectedRows > 0) {
          inserted++;
          // Fetch the new flight id
          const [[fRow]] = await pool.query(
            "SELECT id FROM flights WHERE flightNumber = ? AND departureDate = ?",
            [flightNumber, date]
          );
          if (fRow) {
            const fid = fRow.id;
            const seatRows = [];
            for (let row = 1; row <= SEAT_ROWS; row++) {
              for (const col of SEAT_COLS) {
                seatRows.push([fid, date, `${col}${row}`, "available"]);
              }
            }
            // Batch insert seats
            await pool.query(
              "INSERT IGNORE INTO seats (flightId, travelDate, seatNumber, status) VALUES ?",
              [seatRows]
            );
            seatIns += seatRows.length;
          }
        } else {
          skipped++;
        }
      } catch (e) {
        console.error(`  ⚠️  ${flightNumber} ${date}: ${e.message}`);
      }
    }
  }

  console.log(`✅ Flights seeded: ${inserted} new, ${skipped} already existed`);
  console.log(`🪑 Seat records created: ${seatIns}`);
}

async function printSummary(pool) {
  const [[ap]]   = await pool.query("SELECT COUNT(*) AS c FROM airports");
  const [[fl]]   = await pool.query("SELECT COUNT(*) AS c FROM flights WHERE isActive = 1 AND departureDate >= CURDATE()");
  const [[st]]   = await pool.query("SELECT COUNT(*) AS c FROM seats");
  const [[bk]]   = await pool.query("SELECT COUNT(*) AS c FROM bookings");
  const [[minD]] = await pool.query("SELECT MIN(departureDate) AS v FROM flights WHERE isActive = 1");
  const [[maxD]] = await pool.query("SELECT MAX(departureDate) AS v FROM flights WHERE isActive = 1");
  const [origs]  = await pool.query("SELECT DISTINCT origin FROM flights WHERE isActive = 1 ORDER BY origin");
  const [dests]  = await pool.query("SELECT DISTINCT destination FROM flights WHERE isActive = 1 ORDER BY destination");

  console.log("\n📊 Database Summary:");
  console.log(`   Airports       : ${ap.c}`);
  console.log(`   Active flights : ${fl.c} (from today)`);
  console.log(`   Total seats    : ${st.c}`);
  console.log(`   Bookings kept  : ${bk.c}`);
  console.log(`   Date range     : ${minD.v?.toISOString?.()?.slice(0,10)} → ${maxD.v?.toISOString?.()?.slice(0,10)}`);
  console.log(`   Unique origins : ${origs.length}`);
  console.log(`   Unique dests   : ${dests.length}`);
  console.log("\n   Origins:", origs.map(r => r.origin).join(", "));
  console.log("\n   Destinations:", dests.map(r => r.destination).join(", "));
}

async function main() {
  console.log("🚀 SkyBook Airport & Flight Seeder starting…\n");

  const pool = mysql.createPool({
    host             : env.MYSQL_HOST     || "127.0.0.1",
    port             : Number(env.MYSQL_PORT) || 3306,
    user             : env.MYSQL_USER     || "skybook_app",
    password         : env.MYSQL_PASSWORD || "",
    database         : env.MYSQL_DATABASE || "skybook",
    waitForConnections: true,
    connectionLimit  : 5,
  });

  try {
    await createAirportsTable(pool);
    await seedAirports(pool);
    await seedFlights(pool);
    await printSummary(pool);
    console.log("\n✅ Seeder complete! The SkyBook database now has comprehensive flight data.\n");
  } catch (e) {
    console.error("FATAL:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
