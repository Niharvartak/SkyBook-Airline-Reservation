const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const Database = require("better-sqlite3");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 8080;
const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "skybook.db");

const db = new Database(DB_PATH);

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------------------------------------
// DATABASE
// --------------------------------------------------

db.pragma("foreign_keys = ON");

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "SkyBook backend is running.",
  });
});

// --------------------------------------------------
// ME / CURRENT USER
// --------------------------------------------------

app.get("/api/me", (req, res) => {
  try {
    // Demo logged-in user
    const user = {
      id: 1,
      name: "SkyBook User",
      email: "user@skybook.com",
      role: "USER",
    };

    res.json({
      ok: true,
      user,
    });
  } catch (error) {
    console.error("ME ERROR:", error);
    res.status(500).json({
      ok: false,
      message: "Unable to load user",
    });
  }
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post("/api/login", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        message: "Email and password are required",
      });
    }

    res.json({
      ok: true,
      message: "Login successful",
      user: {
        id: 1,
        name: "SkyBook User",
        email,
        role: "USER",
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Login failed",
    });
  }
});

// --------------------------------------------------
// REGISTER
// --------------------------------------------------

app.post("/api/register", (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        ok: false,
        message: "Name, email and password are required",
      });
    }

    res.status(201).json({
      ok: true,
      message: "Registration successful",
      user: {
        id: Date.now(),
        name,
        email,
        role: "USER",
      },
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Registration failed",
    });
  }
});

// --------------------------------------------------
// FLIGHT SEARCH
// --------------------------------------------------

app.get("/api/flights/search", (req, res) => {
  try {
    const { from, to, departureDate } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        ok: false,
        message: "Origin and destination are required",
      });
    }

    let flights = [];

    // Try existing flights table
    try {
      const tables = db
        .prepare(
          `
          SELECT name
          FROM sqlite_master
          WHERE type='table'
          AND name NOT LIKE 'sqlite_%'
        `
        )
        .all();

      const flightTable = tables.find((t) =>
        t.name.toLowerCase().includes("flight")
      );

      if (flightTable) {
        const columns = db
          .prepare(`PRAGMA table_info("${flightTable.name}")`)
          .all();

        const columnNames = columns.map((c) => c.name);

        const findColumn = (...names) =>
          names.find((name) =>
            columnNames.some(
              (c) => c.toLowerCase() === name.toLowerCase()
            )
          );

        const idCol = findColumn("id");
        const numberCol = findColumn(
          "flightNumber",
          "flight_number"
        );
        const airlineCol = findColumn("airline");
        const originCol = findColumn("origin", "from");
        const destinationCol = findColumn(
          "destination",
          "to"
        );
        const dateCol = findColumn(
          "departureDate",
          "departure_date",
          "date"
        );
        const departureTimeCol = findColumn(
          "departureTime",
          "departure_time"
        );
        const arrivalTimeCol = findColumn(
          "arrivalTime",
          "arrival_time"
        );
        const priceCol = findColumn("price", "fare");
        const statusCol = findColumn("status");
        const seatsCol = findColumn(
          "availableSeats",
          "available_seats",
          "seats"
        );

        if (
          originCol &&
          destinationCol &&
          dateCol
        ) {
          const selectParts = [
            idCol ? `"${idCol}" AS id` : "rowid AS id",
            numberCol
              ? `"${numberCol}" AS flightNumber`
              : "'SK-101' AS flightNumber",
            airlineCol
              ? `"${airlineCol}" AS airline`
              : "'SkyBook Airlines' AS airline",
            `"${originCol}" AS origin`,
            `"${destinationCol}" AS destination`,
            `"${dateCol}" AS departureDate`,
            departureTimeCol
              ? `"${departureTimeCol}" AS departureTime`
              : "'08:00 AM' AS departureTime",
            arrivalTimeCol
              ? `"${arrivalTimeCol}" AS arrivalTime`
              : "'10:15 AM' AS arrivalTime",
            priceCol
              ? `"${priceCol}" AS price`
              : "4999 AS price",
            statusCol
              ? `"${statusCol}" AS status`
              : "'On Time' AS status",
            seatsCol
              ? `"${seatsCol}" AS availableSeats`
              : "32 AS availableSeats",
          ];

          let sql = `
            SELECT ${selectParts.join(", ")}
            FROM "${flightTable.name}"
            WHERE LOWER("${originCol}") LIKE LOWER(?)
            AND LOWER("${destinationCol}") LIKE LOWER(?)
          `;

          const params = [
            `%${from}%`,
            `%${to}%`,
          ];

          if (departureDate) {
            sql += `
              AND (
                DATE("${dateCol}") = DATE(?)
                OR DATE("${dateCol}") = DATE(?)
              )
            `;

            params.push(
              departureDate,
              `${departureDate}T00:00:00`
            );
          }

          sql += ` ORDER BY "${dateCol}" ASC`;

          flights = db.prepare(sql).all(...params);
        }
      }
    } catch (dbError) {
      console.log(
        "Flight table lookup skipped:",
        dbError.message
      );
    }

    // Demo fallback flights
    if (!flights.length) {
      flights = [
        {
          id: 101,
          flightNumber: "SK-101",
          airline: "SkyBook Airlines",
          origin: from,
          destination: to,
          departureDate:
            departureDate ||
            new Date().toISOString().split("T")[0],
          departureTime: "08:00 AM",
          arrivalTime: "10:15 AM",
          price: 4999,
          status: "On Time",
          availableSeats: 32,
        },
        {
          id: 105,
          flightNumber: "SK-105",
          airline: "SkyBook Express",
          origin: from,
          destination: to,
          departureDate:
            departureDate ||
            new Date().toISOString().split("T")[0],
          departureTime: "02:30 PM",
          arrivalTime: "04:45 PM",
          price: 5499,
          status: "On Time",
          availableSeats: 32,
        },
      ];
    }

    res.json({
      flights,
    });
  } catch (error) {
    console.error("FLIGHT SEARCH ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Flight search failed",
      error: error.message,
    });
  }
});

// --------------------------------------------------
// BOOKINGS
// --------------------------------------------------

app.get("/api/bookings", (req, res) => {
  try {
    let bookings = [];

    const tables = db
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
      `
      )
      .all();

    const bookingTable = tables.find((t) =>
      t.name.toLowerCase().includes("booking")
    );

    if (bookingTable) {
      bookings = db
        .prepare(
          `SELECT *
           FROM "${bookingTable.name}"
           ORDER BY rowid DESC`
        )
        .all();
    }

    res.json({
      ok: true,
      bookings,
    });
  } catch (error) {
    console.error("BOOKINGS ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Unable to load bookings",
      bookings: [],
    });
  }
});

// --------------------------------------------------
// CREATE BOOKING
// --------------------------------------------------

app.post("/api/bookings", (req, res) => {
  try {
    const data = req.body;

    const booking = {
      id: `BK${Date.now()}`,
      status: "CONFIRMED",
      ...data,
      createdAt: new Date().toISOString(),
    };

    res.status(201).json({
      ok: true,
      message: "Booking confirmed",
      booking,
    });
  } catch (error) {
    console.error("CREATE BOOKING ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Booking failed",
    });
  }
});

// --------------------------------------------------
// DASHBOARD STATS
// --------------------------------------------------

app.get("/api/dashboard/stats", (req, res) => {
  try {
    let totalFlights = 0;
    let totalBookings = 0;
    let totalUsers = 0;

    const tables = db
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
      `
      )
      .all();

    for (const table of tables) {
      try {
        const count = db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM "${table.name}"`
          )
          .get().count;

        const name = table.name.toLowerCase();

        if (name.includes("flight")) {
          totalFlights += count;
        }

        if (name.includes("booking")) {
          totalBookings += count;
        }

        if (
          name.includes("user") ||
          name.includes("account")
        ) {
          totalUsers += count;
        }
      } catch {
        // Ignore unsupported tables
      }
    }

    res.json({
      totalFlights,
      totalBookings,
      totalUsers,
      totalAccounts: totalUsers,
    });
  } catch (error) {
    console.error("DASHBOARD ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Unable to load dashboard statistics",
    });
  }
});

// --------------------------------------------------
// RECENT TRANSACTIONS
// --------------------------------------------------

app.get("/api/transactions/recent", (req, res) => {
  try {
    res.json([
      {
        id: "TXN1001",
        holderName: "Sumeet Rathod",
        type: "DEPOSIT",
        amount: 150000,
        status: "SUCCESS",
      },
      {
        id: "TXN1002",
        holderName: "Pritha Rao",
        type: "TRANSFER",
        amount: 45000,
        status: "SUCCESS",
      },
      {
        id: "TXN1003",
        holderName: "Dhyana Singh",
        type: "DEPOSIT",
        amount: 300000,
        status: "SUCCESS",
      },
    ]);
  } catch (error) {
    console.error(
      "TRANSACTIONS ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      message: "Unable to load transactions",
    });
  }
});

// --------------------------------------------------
// 404 API
// --------------------------------------------------

app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);

  res.status(500).json({
    ok: false,
    message: "Internal server error",
  });
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `🚀 SkyBook backend running on http://localhost:${PORT}`
  );
  console.log(`📦 Database: ${DB_PATH}`);
});

// --------------------------------------------------
// SHUTDOWN
// --------------------------------------------------

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  db.close();
  process.exit(0);
});