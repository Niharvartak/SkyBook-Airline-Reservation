/**
 * SkyBook – platform extensions.
 *
 * Registered by src/backend/server.js before the 404 handler. Adds the
 * customer dashboard APIs, the administration APIs and auth-recovery flows.
 * All new tables/columns are created by db-schema.js.
 */
const crypto = require("crypto");
const { getUserById } = require("./db-schema");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const PUBLIC_SETTING_KEYS = [
  "brand_name", "brand_tagline", "support_email", "support_phone",
  "currency", "cancellation_window_hours", "max_travelers", "maintenance_notice",
];

const ADMIN_SETTING_KEYS = [
  ...PUBLIC_SETTING_KEYS,
  "fare_alert_interval_minutes",
];

const BOOKING_STATUSES = ["CONFIRMED", "PENDING", "COMPLETED", "CANCELLED"];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseRequiredBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function parseTimeToMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] ? match[3].toUpperCase() : null;
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesBetween(departure, arrival) {
  const dep = parseTimeToMinutes(departure);
  const arr = parseTimeToMinutes(arrival);
  if (dep == null || arr == null) return null;
  let diff = arr - dep;
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function departureDateTime(travelDate, departureTime) {
  const day = travelDate instanceof Date
    ? travelDate.toISOString().slice(0, 10)
    : String(travelDate || "").slice(0, 10);
  const minutes = parseTimeToMinutes(departureTime);
  if (!day || minutes == null) return null;
  const date = new Date(`${day}T${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map(h => csvCell(row[h])).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

function registerExtensions(ctx) {
  const {
    app, pool, requireAuth, requireAdmin, jwt, JWT_SECRET, JWT_EXPIRES,
    bcrypt,
  } = ctx;

  // ─── helpers ────────────────────────────────────────────────────────────────

  async function readSettings(keys = ADMIN_SETTING_KEYS) {
    if (!keys.length) return {};
    const [rows] = await pool.query(
      "SELECT settingKey, settingValue FROM app_settings WHERE settingKey IN (?)",
      [keys]
    );
    const result = {};
    for (const row of rows) result[row.settingKey] = row.settingValue;
    return result;
  }

  async function writeSetting(key, value) {
    await pool.query(
      `INSERT INTO app_settings (settingKey, settingValue) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE settingValue = VALUES(settingValue)`,
      [key, String(value)]
    );
  }

  async function audit(req, action, entityType, entityId, details = {}) {
    try {
      await pool.query(
        `INSERT INTO admin_audit_log (adminUserId, action, entityType, entityId, details, ipAddress)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(details), req.ip || null]
      );
    } catch (error) {
      console.warn("AUDIT LOG WARNING:", error.message);
    }
  }

  async function notify(userId, title, message, type = "info", link = null) {
    try {
      await pool.query(
        "INSERT INTO notifications (userId, title, message, type, link) VALUES (?, ?, ?, ?, ?)",
        [userId, title, message, type, link]
      );
    } catch (error) {
      console.warn("NOTIFY WARNING:", error.message);
    }
  }

  function pagination(req, defaultLimit = 20) {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || defaultLimit));
    return { page, limit, offset: (page - 1) * limit };
  }

  function localDateOnly(date = new Date()) {
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function dateRange(req, defaultDays = 30) {
    const today = localDateOnly();
    const end = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.endDate || "")) ? String(req.query.endDate) : today;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.startDate || ""))
      ? String(req.query.startDate)
      : localDateOnly(new Date(Date.now() - (defaultDays - 1) * 86400000));
    return start <= end ? { start, end } : { start: end, end: start };
  }

  async function resolveAirport(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const codeMatch = raw.match(/\(([A-Za-z]{3})\)/) || raw.match(/^([A-Za-z]{3})$/);
    const code = codeMatch ? codeMatch[1].toUpperCase() : null;
    const [rows] = await pool.query(
      `SELECT code, city, airportName, country, timezone, region, isActive
       FROM airports
       WHERE code = ? OR CONCAT(city, ' (', code, ')') = ? OR city = ?
       LIMIT 1`,
      [code || "", raw, raw]
    );
    return rows[0] || null;
  }

  function airportDisplay(airport) {
    return `${airport.city} (${airport.code})`;
  }

  async function cancellationPolicyFor(booking, flight, settings) {
    const status = String(booking.status || "").toUpperCase();
    const windowHours = Math.max(0, Number(settings.cancellation_window_hours ?? 2) || 0);
    const departure = departureDateTime(booking.travelDate, flight?.departureTime);

    if (status === "CANCELLED") {
      return { eligible: false, reason: "This booking is already cancelled.", windowHours };
    }
    if (status === "COMPLETED") {
      return { eligible: false, reason: "Completed trips cannot be cancelled.", windowHours };
    }
    if (!departure) {
      return { eligible: false, reason: "The departure time for this booking is unavailable.", windowHours };
    }
    const hoursUntilDeparture = (departure.getTime() - Date.now()) / 3_600_000;
    if (hoursUntilDeparture <= 0) {
      return { eligible: false, reason: "This flight has already departed.", hoursUntilDeparture: round2(hoursUntilDeparture), windowHours };
    }
    if (hoursUntilDeparture < windowHours) {
      return {
        eligible: false,
        reason: `Online cancellation closes ${windowHours} hour(s) before departure. Please contact support.`,
        hoursUntilDeparture: round2(hoursUntilDeparture),
        windowHours,
      };
    }
    return {
      eligible: true,
      reason: `Free cancellation is available until ${windowHours} hour(s) before departure. No payment was collected.`,
      hoursUntilDeparture: round2(hoursUntilDeparture),
      windowHours,
    };
  }

  async function loadBookingDetail(bookingId, userId = null) {
    const params = [bookingId];
    let sql = `
      SELECT b.*, f.flightNumber, f.airline, f.origin, f.destination, f.departureDate,
             f.departureTime, f.arrivalTime, f.status AS flightStatus, f.terminal, f.gate,
             f.baggageBelt, f.baggageAllowance, f.aircraft,
             u.name AS bookedByName, u.email AS bookedByEmail, u.phone AS bookedByPhone
      FROM bookings b
      LEFT JOIN flights f ON f.id = b.flightId
      LEFT JOIN users u ON u.id = b.userId
      WHERE b.id = ?`;
    if (userId != null) { sql += " AND b.userId = ?"; params.push(userId); }
    const [[row]] = await pool.query(sql, params);
    if (!row) return null;

    const settings = await readSettings();
    row.seatNumbers = safeJson(row.seatNumbers, []);
    row.passengers = safeJson(row.passengers, null);
    const baseFare = Number(row.baseFare ?? row.totalPrice ?? 0);
    const taxes = Number(row.taxes ?? 0);
    const discount = Number(row.discountAmount ?? 0);
    row.fareBreakdown = {
      baseFare: round2(baseFare),
      taxes: round2(taxes),
      discount: round2(discount),
      total: round2(row.totalPrice),
      cabinClass: row.cabinClass || "Economy",
      promoCode: row.promoCode || null,
      paymentStatus: "Not collected — no payment gateway is integrated.",
    };
    row.cancellationPolicy = await cancellationPolicyFor(row, row, settings);
    return row;
  }

  async function recheckFareWatch(watch) {
    const [[flight]] = await pool.query(
      "SELECT id, flightNumber, origin, destination, price FROM flights WHERE id = ?",
      [watch.flightId]
    );
    if (!flight) return { ok: false, reason: "Flight not found" };

    const previousPrice = Number(watch.currentPrice);
    const newPrice = Number(flight.price);
    const change = round2(newPrice - previousPrice);
    const trend = change > 0 ? "up" : change < 0 ? "down" : "stable";
    const target = watch.targetPrice == null ? null : Number(watch.targetPrice);
    const triggered = target != null && newPrice <= target;
    const wasTriggered = Boolean(watch.alertTriggered);

    await pool.query(
      `UPDATE fare_watches
       SET previousPrice = currentPrice, currentPrice = ?, priceChange = ?, trend = ?,
           alertTriggered = ?, lastCheckedAt = NOW()
       WHERE id = ?`,
      [newPrice, change, trend, triggered ? 1 : 0, watch.id]
    );
    await pool.query(
      "INSERT INTO fare_watch_snapshots (fareWatchId, price) VALUES (?, ?)",
      [watch.id, newPrice]
    );

    if (triggered && !wasTriggered) {
      await notify(
        watch.userId,
        "Fare alert: target reached",
        `${flight.flightNumber} (${flight.origin} → ${flight.destination}) is now ₹${newPrice.toLocaleString("en-IN")}, at or below your target of ₹${target.toLocaleString("en-IN")}.`,
        "fare",
        "/fare-watches"
      );
    }
    return { ok: true, newPrice, change, trend, triggered, newlyTriggered: triggered && !wasTriggered };
  }

  function startFareWatchScheduler(intervalMinutes) {
    const minutes = Number(intervalMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const [watches] = await pool.query(
          "SELECT * FROM fare_watches WHERE isActive = 1"
        );
        for (const watch of watches) await recheckFareWatch(watch);
        if (watches.length) {
          console.log(`⏱  Fare-watch monitor checked ${watches.length} watch(es).`);
        }
      } catch (error) {
        console.error("FARE-WATCH MONITOR ERROR:", error.message);
      } finally {
        running = false;
      }
    };
    const timer = setInterval(tick, minutes * 60_000);
    if (typeof timer.unref === "function") timer.unref();
    const initial = setTimeout(tick, 15_000);
    if (typeof initial.unref === "function") initial.unref();
    console.log(`⏱  Fare-watch monitor scheduled every ${minutes} minute(s) (database fares only).`);
    return timer;
  }

  // ─── Public settings ───────────────────────────────────────────────────────

  app.get("/api/settings/public", async (_req, res) => {
    try {
      res.json({ ok: true, settings: await readSettings(PUBLIC_SETTING_KEYS) });
    } catch {
      res.status(500).json({ ok: false, message: "Unable to load settings." });
    }
  });

  // ─── Auth extensions ───────────────────────────────────────────────────────

  app.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const phone = String(req.body?.phone || "").trim();

      if (name.length < 2 || name.length > 120) {
        return res.status(400).json({ ok: false, message: "Name must be between 2 and 120 characters." });
      }
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ ok: false, message: "Enter a valid email address." });
      }
      if (phone && !/^[+\d][\d\s()-]{6,24}$/.test(phone)) {
        return res.status(400).json({ ok: false, message: "Enter a valid phone number." });
      }
      const [[duplicate]] = await pool.query(
        "SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1",
        [email, req.user.id]
      );
      if (duplicate) return res.status(409).json({ ok: false, message: "That email is already in use." });

      await pool.query(
        "UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?",
        [name, email, phone || null, req.user.id]
      );
      const user = await getUserById(pool, req.user.id);
      res.json({ ok: true, message: "Profile updated.", user });
    } catch (error) {
      console.error("PROFILE UPDATE ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to update profile." });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ ok: false, message: "Current and new passwords are required." });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ ok: false, message: "New password must be at least 6 characters." });
      }
      const [[user]] = await pool.query("SELECT passwordHash FROM users WHERE id = ?", [req.user.id]);
      if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
        return res.status(401).json({ ok: false, message: "Current password is incorrect." });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      await pool.query("UPDATE users SET passwordHash = ? WHERE id = ?", [hash, req.user.id]);
      res.json({ ok: true, message: "Password changed successfully." });
    } catch (error) {
      console.error("PASSWORD CHANGE ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to change password." });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    const generic = {
      ok: true,
      message: "If an account exists for that email, a password reset link has been generated.",
    };
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ ok: false, message: "Enter a valid email address." });
      }
      const [[user]] = await pool.query("SELECT id, name FROM users WHERE email = ?", [email]);
      if (!user) return res.json(generic);

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      await pool.query("DELETE FROM password_reset_tokens WHERE userId = ? AND usedAt IS NULL", [user.id]);
      await pool.query(
        `INSERT INTO password_reset_tokens (userId, tokenHash, expiresAt)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
        [user.id, tokenHash]
      );

      const baseUrl = (process.env.APP_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      const isProduction = process.env.NODE_ENV === "production";

      // Email delivery is not configured in this deployment. In development we
      // return the one-time token so the flow can be exercised and tested.
      // Production never exposes the token.
      if (!isProduction) {
        return res.json({
          ...generic,
          delivery: "not-configured",
          deliveryNote: "Email delivery is not configured. This development build returns a one-time reset link.",
          devResetToken: token,
          devResetUrl: resetUrl,
          expiresInMinutes: 30,
        });
      }
      res.json({ ...generic, delivery: "not-configured" });
    } catch (error) {
      console.error("FORGOT PASSWORD ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to process the request." });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const password = String(req.body?.password || "");
      if (!token || token.length < 20) {
        return res.status(400).json({ ok: false, message: "Reset token is missing or invalid." });
      }
      if (password.length < 6) {
        return res.status(400).json({ ok: false, message: "Password must be at least 6 characters." });
      }
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const [[row]] = await pool.query(
        `SELECT id, userId FROM password_reset_tokens
         WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > NOW() LIMIT 1`,
        [tokenHash]
      );
      if (!row) {
        return res.status(400).json({ ok: false, message: "This reset link is invalid or has expired. Request a new one." });
      }
      const hash = await bcrypt.hash(password, 10);
      await pool.query("UPDATE users SET passwordHash = ? WHERE id = ?", [hash, row.userId]);
      await pool.query("UPDATE password_reset_tokens SET usedAt = NOW() WHERE id = ?", [row.id]);
      await pool.query("DELETE FROM password_reset_tokens WHERE userId = ? AND usedAt IS NULL", [row.userId]);
      res.json({ ok: true, message: "Password reset successfully. You can now sign in." });
    } catch (error) {
      console.error("RESET PASSWORD ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to reset password." });
    }
  });

  app.post("/api/auth/logout", requireAuth, (_req, res) => {
    // JWTs are stateless; the client discards its token. This endpoint exists
    // so clients have an explicit, auditable logout call.
    res.json({ ok: true, message: "Signed out." });
  });

  // ─── Customer: dashboard, bookings, fare watches, notifications ────────────

  app.get("/api/dashboard/overview", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const [[counts]] = await pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(status = 'CONFIRMED'), 0) AS confirmed,
                COALESCE(SUM(status = 'PENDING'), 0) AS pending,
                COALESCE(SUM(status = 'COMPLETED'), 0) AS completed,
                COALESCE(SUM(status = 'CANCELLED'), 0) AS cancelled,
                COALESCE(SUM(CASE WHEN status = 'CONFIRMED' THEN totalPrice ELSE 0 END), 0) AS totalSpend
         FROM bookings WHERE userId = ?`,
        [userId]
      );
      const [[upcoming]] = await pool.query(
        `SELECT COUNT(*) AS c FROM bookings b JOIN flights f ON f.id = b.flightId
         WHERE b.userId = ? AND b.status = 'CONFIRMED' AND DATE(f.departureDate) >= CURDATE()`,
        [userId]
      );
      const [upcomingTrips] = await pool.query(
        `SELECT b.id, b.pnr, b.travelDate, b.passengerName, b.status, b.seatNumbers,
                f.flightNumber, f.airline, f.origin, f.destination, f.departureTime, f.arrivalTime
         FROM bookings b JOIN flights f ON f.id = b.flightId
         WHERE b.userId = ? AND b.status IN ('CONFIRMED','PENDING') AND DATE(f.departureDate) >= CURDATE()
         ORDER BY f.departureDate ASC, f.departureTime ASC LIMIT 5`,
        [userId]
      );
      const [[watchCount]] = await pool.query(
        "SELECT COUNT(*) AS total, COALESCE(SUM(isActive = 1),0) AS active, COALESCE(SUM(alertTriggered = 1),0) AS alerts FROM fare_watches WHERE userId = ?",
        [userId]
      );
      const [[notificationCount]] = await pool.query(
        "SELECT COUNT(*) AS total, COALESCE(SUM(`read` = 0),0) AS unread FROM notifications WHERE userId = ?",
        [userId]
      );
      const [recentNotifications] = await pool.query(
        "SELECT id, title, message, type, `read`, createdAt FROM notifications WHERE userId = ? ORDER BY id DESC LIMIT 5",
        [userId]
      );
      const [recentBookings] = await pool.query(
        `SELECT b.id, b.pnr, b.travelDate, b.totalPrice, b.status, b.createdAt,
                f.flightNumber, f.origin, f.destination
         FROM bookings b LEFT JOIN flights f ON f.id = b.flightId
         WHERE b.userId = ? ORDER BY b.id DESC LIMIT 5`,
        [userId]
      );
      const [[profileRow]] = await pool.query(
        "SELECT name, email, phone FROM users WHERE id = ?",
        [userId]
      );
      const [[preferenceRow]] = await pool.query(
        "SELECT preferences FROM account_preferences WHERE userId = ?",
        [userId]
      );
      const preferences = safeJson(preferenceRow?.preferences, []);
      let completion = 0;
      if (profileRow?.name) completion += 30;
      if (profileRow?.email) completion += 30;
      if (profileRow?.phone) completion += 20;
      if (Array.isArray(preferences) && preferences.length) completion += 20;

      res.json({
        ok: true,
        stats: {
          totalBookings: Number(counts.total) || 0,
          confirmedBookings: Number(counts.confirmed) || 0,
          pendingBookings: Number(counts.pending) || 0,
          completedTrips: Number(counts.completed) || 0,
          cancelledBookings: Number(counts.cancelled) || 0,
          upcomingTrips: Number(upcoming.c) || 0,
          totalSpend: round2(counts.totalSpend),
          fareWatches: Number(watchCount.total) || 0,
          activeFareWatches: Number(watchCount.active) || 0,
          fareAlerts: Number(watchCount.alerts) || 0,
          notifications: Number(notificationCount.total) || 0,
          unreadNotifications: Number(notificationCount.unread) || 0,
          profileCompletion: completion,
        },
        upcomingTrips,
        recentBookings,
        recentNotifications,
        preferences,
      });
    } catch (error) {
      console.error("CUSTOMER OVERVIEW ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load your dashboard." });
    }
  });

  app.get("/api/customer/bookings", requireAuth, async (req, res) => {
    try {
      const { page, limit, offset } = pagination(req);
      const search = String(req.query.search || "").trim();
      const status = String(req.query.status || "").trim().toUpperCase();
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();

      let where = "WHERE b.userId = ?";
      const params = [req.user.id];
      if (search) {
        where += " AND (b.pnr LIKE ? OR b.passengerName LIKE ? OR f.flightNumber LIKE ? OR f.origin LIKE ? OR f.destination LIKE ?)";
        const like = `%${search}%`;
        params.push(like, like, like, like, like);
      }
      if (status && BOOKING_STATUSES.includes(status)) {
        where += " AND b.status = ?";
        params.push(status);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { where += " AND DATE(b.travelDate) >= ?"; params.push(from); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(to))   { where += " AND DATE(b.travelDate) <= ?"; params.push(to); }

      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM bookings b LEFT JOIN flights f ON f.id = b.flightId ${where}`,
        params
      );
      const [rows] = await pool.query(
        `SELECT b.*, f.flightNumber, f.airline, f.origin, f.destination, f.departureTime,
                f.arrivalTime
         FROM bookings b LEFT JOIN flights f ON f.id = b.flightId
         ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const settings = await readSettings();
      const bookings = rows.map(row => ({
        ...row,
        seatNumbers: safeJson(row.seatNumbers, []),
        passengers: safeJson(row.passengers, null),
        cancellationPolicy: null,
        _flight: { departureTime: row.departureTime },
      }));
      for (const booking of bookings) {
        booking.cancellationPolicy = await cancellationPolicyFor(booking, booking._flight, settings);
        delete booking._flight;
        delete booking.userId;
      }
      const total = Number(countRow.total) || 0;
      res.json({ ok: true, bookings, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
    } catch (error) {
      console.error("CUSTOMER BOOKINGS ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load bookings.", bookings: [] });
    }
  });

  app.get("/api/bookings/pnr/:pnr", requireAuth, async (req, res) => {
    try {
      const [[row]] = await pool.query(
        "SELECT id FROM bookings WHERE pnr = ? AND userId = ? LIMIT 1",
        [String(req.params.pnr || "").trim().toUpperCase(), req.user.id]
      );
      if (!row) return res.status(404).json({ ok: false, message: "No booking with that reference was found on your account." });
      const booking = await loadBookingDetail(row.id, req.user.id);
      res.json({ ok: true, booking });
    } catch (error) {
      console.error("PNR LOOKUP ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to retrieve booking." });
    }
  });

  app.get("/api/bookings/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, message: "Invalid booking id." });
      const booking = await loadBookingDetail(id, req.user.id);
      if (!booking) return res.status(404).json({ ok: false, message: "Booking not found." });
      res.json({ ok: true, booking });
    } catch (error) {
      console.error("BOOKING DETAIL ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load booking." });
    }
  });

  app.put("/api/fare-watches/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [[watch]] = await pool.query(
        "SELECT * FROM fare_watches WHERE id = ? AND userId = ?",
        [id, req.user.id]
      );
      if (!watch) return res.status(404).json({ ok: false, message: "Fare watch not found." });

      const hasTarget = Object.prototype.hasOwnProperty.call(req.body || {}, "targetPrice");
      const hasActive = Object.prototype.hasOwnProperty.call(req.body || {}, "isActive");
      const target = hasTarget
        ? (req.body.targetPrice == null || req.body.targetPrice === "" ? null : Number(req.body.targetPrice))
        : watch.targetPrice;
      const isActive = hasActive ? (req.body.isActive ? 1 : 0) : watch.isActive;

      if (target != null && (!Number.isFinite(target) || target <= 0)) {
        return res.status(400).json({ ok: false, message: "Target price must be a positive number." });
      }
      await pool.query(
        "UPDATE fare_watches SET targetPrice = ?, isActive = ? WHERE id = ? AND userId = ?",
        [target, isActive, id, req.user.id]
      );
      const [[updated]] = await pool.query("SELECT * FROM fare_watches WHERE id = ?", [id]);
      res.json({ ok: true, message: "Fare watch updated.", fareWatch: updated });
    } catch (error) {
      console.error("FARE WATCH UPDATE ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to update fare watch." });
    }
  });

  app.post("/api/fare-watches/:id/check", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [[watch]] = await pool.query(
        "SELECT * FROM fare_watches WHERE id = ? AND userId = ?",
        [id, req.user.id]
      );
      if (!watch) return res.status(404).json({ ok: false, message: "Fare watch not found." });
      const result = await recheckFareWatch(watch);
      res.json({ ok: true, message: "Fare observation updated from SkyBook fares.", ...result });
    } catch (error) {
      console.error("FARE WATCH CHECK ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to check this fare watch." });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const [[row]] = await pool.query(
        "SELECT COUNT(*) AS c FROM notifications WHERE userId = ? AND `read` = 0",
        [req.user.id]
      );
      res.json({ ok: true, unread: Number(row.c) || 0 });
    } catch {
      res.status(500).json({ ok: false, unread: 0 });
    }
  });

  // ─── Admin: overview ───────────────────────────────────────────────────────

  app.get("/api/admin/overview", requireAdmin, async (req, res) => {
    try {
      const { start, end } = dateRange(req);
      const [[users]] = await pool.query(
        "SELECT COUNT(*) AS total, COALESCE(SUM(isActive = 1),0) AS active FROM users"
      );
      const [[flightCounts]] = await pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(isActive = 1),0) AS active,
                COALESCE(SUM(isActive = 1 AND departureDate >= CURDATE()),0) AS upcoming
         FROM flights`
      );
      const [[bookingCounts]] = await pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(status = 'CONFIRMED'),0) AS confirmed,
                COALESCE(SUM(status = 'PENDING'),0) AS pending,
                COALESCE(SUM(status = 'COMPLETED'),0) AS completed,
                COALESCE(SUM(status = 'CANCELLED'),0) AS cancelled,
                COALESCE(SUM(CASE WHEN status = 'CONFIRMED' THEN totalPrice ELSE 0 END),0) AS revenue,
                COALESCE(AVG(CASE WHEN status = 'CONFIRMED' THEN totalPrice END),0) AS average
         FROM bookings`
      );
      const [[rangeBookings]] = await pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN status = 'CONFIRMED' THEN totalPrice ELSE 0 END),0) AS revenue,
                COALESCE(SUM(status = 'CANCELLED'),0) AS cancellations
         FROM bookings WHERE DATE(createdAt) BETWEEN ? AND ?`,
        [start, end]
      );
      const [[airportCount]] = await pool.query(
        "SELECT COUNT(*) AS total, COALESCE(SUM(isActive = 1),0) AS active FROM airports"
      );
      const [[watchCounts]] = await pool.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(isActive = 1),0) AS active,
                COALESCE(SUM(alertTriggered = 1),0) AS triggered
         FROM fare_watches`
      );
      const [[notificationCounts]] = await pool.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(\`read\` = 0),0) AS unread FROM notifications`
      );

      const [bookingTrend] = await pool.query(
        `SELECT DATE(createdAt) AS date, COUNT(*) AS count
         FROM bookings WHERE DATE(createdAt) BETWEEN ? AND ?
         GROUP BY DATE(createdAt) ORDER BY date ASC`,
        [start, end]
      );
      const [revenueTrend] = await pool.query(
        `SELECT DATE(createdAt) AS date, COALESCE(SUM(totalPrice),0) AS revenue
         FROM bookings WHERE status = 'CONFIRMED' AND DATE(createdAt) BETWEEN ? AND ?
         GROUP BY DATE(createdAt) ORDER BY date ASC`,
        [start, end]
      );
      const [popularRoutes] = await pool.query(
        `SELECT CONCAT(f.origin, ' → ', f.destination) AS route,
                COUNT(*) AS bookings,
                COALESCE(SUM(b.totalPrice),0) AS revenue,
                COUNT(DISTINCT b.userId) AS travellers
         FROM bookings b JOIN flights f ON f.id = b.flightId
         WHERE b.status = 'CONFIRMED' AND DATE(b.createdAt) BETWEEN ? AND ?
         GROUP BY route ORDER BY bookings DESC, revenue DESC LIMIT 10`,
        [start, end]
      );
      const [popularDestinations] = await pool.query(
        `SELECT f.destination, COUNT(*) AS bookingCount
         FROM bookings b JOIN flights f ON f.id = b.flightId
         WHERE DATE(b.createdAt) BETWEEN ? AND ?
         GROUP BY f.destination ORDER BY bookingCount DESC LIMIT 10`,
        [start, end]
      );
      const [recentBookings] = await pool.query(
        `SELECT b.id, b.pnr, b.passengerName, b.passengerCount, b.totalPrice, b.status,
                b.createdAt, b.travelDate, u.name AS bookedByName,
                f.flightNumber, f.origin, f.destination
         FROM bookings b LEFT JOIN flights f ON f.id = b.flightId
         LEFT JOIN users u ON u.id = b.userId
         ORDER BY b.id DESC LIMIT 10`
      );
      const [recentUsers] = await pool.query(
        "SELECT id, name, email, isActive, createdAt FROM users ORDER BY id DESC LIMIT 8"
      );
      const [statusDistribution] = await pool.query(
        "SELECT status, COUNT(*) AS count FROM bookings GROUP BY status"
      );
      const [airportUsage] = await pool.query(
        `SELECT a.code, a.city, COUNT(f.id) AS flights
         FROM airports a LEFT JOIN flights f
           ON (f.origin LIKE CONCAT('%', a.code, '%') OR f.destination LIKE CONCAT('%', a.code, '%'))
         GROUP BY a.code, a.city ORDER BY flights DESC LIMIT 10`
      );

      const bsd = {};
      for (const row of statusDistribution) bsd[row.status] = Number(row.count);

      res.json({
        ok: true,
        range: { startDate: start, endDate: end },
        stats: {
          totalUsers: Number(users.total) || 0,
          activeUsers: Number(users.active) || 0,
          totalFlights: Number(flightCounts.total) || 0,
          activeFlights: Number(flightCounts.active) || 0,
          upcomingFlights: Number(flightCounts.upcoming) || 0,
          totalBookings: Number(bookingCounts.total) || 0,
          confirmedBookings: Number(bookingCounts.confirmed) || 0,
          pendingBookings: Number(bookingCounts.pending) || 0,
          completedBookings: Number(bookingCounts.completed) || 0,
          cancelledBookings: Number(bookingCounts.cancelled) || 0,
          totalRevenue: round2(bookingCounts.revenue),
          averageBookingValue: round2(bookingCounts.average),
          periodBookings: Number(rangeBookings.total) || 0,
          periodRevenue: round2(rangeBookings.revenue),
          periodCancellations: Number(rangeBookings.cancellations) || 0,
          totalAirports: Number(airportCount.total) || 0,
          activeAirports: Number(airportCount.active) || 0,
          totalFareWatches: Number(watchCounts.total) || 0,
          activeFareWatches: Number(watchCounts.active) || 0,
          triggeredFareWatches: Number(watchCounts.triggered) || 0,
          notifications: Number(notificationCounts.total) || 0,
          unreadNotifications: Number(notificationCounts.unread) || 0,
          bookingStatusDistribution: bsd,
        },
        bookingTrend,
        revenueTrend,
        popularRoutes,
        popularDestinations,
        recentBookings,
        recentUsers,
        airportUsage,
        notes: [
          "Revenue is the recorded value of CONFIRMED bookings. No payment gateway is integrated, so no funds are collected or refunded.",
          "Flight schedules and fares are simulated sample data, not a live airline feed.",
        ],
      });
    } catch (error) {
      console.error("ADMIN OVERVIEW ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load admin overview." });
    }
  });

  // ─── Admin: flights ────────────────────────────────────────────────────────

  app.get("/api/admin/flights", requireAdmin, async (req, res) => {
    try {
      const { page, limit, offset } = pagination(req);
      const search = String(req.query.search || "").trim();
      const status = String(req.query.status || "").trim();
      const active = String(req.query.active ?? "all");
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();
      const sortMap = {
        date: "f.departureDate", price: "f.price", flight: "f.flightNumber",
        seats: "f.availableSeats", created: "f.id",
      };
      const sort = sortMap[String(req.query.sort || "date")] || sortMap.date;
      const dir = String(req.query.dir || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

      let where = "WHERE 1=1";
      const params = [];
      if (search) {
        where += " AND (f.flightNumber LIKE ? OR f.airline LIKE ? OR f.origin LIKE ? OR f.destination LIKE ?)";
        const like = `%${search}%`;
        params.push(like, like, like, like);
      }
      if (status) { where += " AND f.status = ?"; params.push(status); }
      if (active === "1" || active === "0") { where += " AND f.isActive = ?"; params.push(Number(active)); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { where += " AND f.departureDate >= ?"; params.push(from); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(to))   { where += " AND f.departureDate <= ?"; params.push(to); }

      const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM flights f ${where}`, params);
      const [flights] = await pool.query(
        `SELECT f.*,
                (SELECT COUNT(*) FROM bookings b WHERE b.flightId = f.id AND b.status IN ('CONFIRMED','PENDING')) AS activeBookings,
                (SELECT COUNT(*) FROM bookings b WHERE b.flightId = f.id) AS bookingCount,
                (SELECT COUNT(*) FROM seats s WHERE s.flightId = f.id AND s.travelDate = f.departureDate) AS seatCapacity
         FROM flights f ${where} ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [[statusRow]] = await pool.query(
        "SELECT COUNT(DISTINCT status) AS c FROM flights"
      );
      const [statuses] = await pool.query("SELECT DISTINCT status FROM flights ORDER BY status");
      const total = Number(countRow.total) || 0;
      res.json({
        ok: true,
        flights,
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
        statuses: statuses.map(s => s.status).filter(Boolean),
        statusCount: Number(statusRow.c) || 0,
      });
    } catch (error) {
      console.error("ADMIN FLIGHTS ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load flights.", flights: [] });
    }
  });

  app.put("/api/admin/flights/:id", requireAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const id = parsePositiveId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, message: "Flight id must be a positive integer." });
      await conn.beginTransaction();
      const [[flight]] = await conn.query("SELECT * FROM flights WHERE id = ? FOR UPDATE", [id]);
      if (!flight) { await conn.rollback(); return res.status(404).json({ ok: false, message: "Flight not found." }); }

      const body = req.body || {};
      const next = { ...flight };

      if (body.flightNumber != null) next.flightNumber = String(body.flightNumber).trim().toUpperCase();
      if (body.airline != null) next.airline = String(body.airline).trim().slice(0, 100) || flight.airline;
      if (body.departureTime != null) next.departureTime = String(body.departureTime).trim();
      if (body.arrivalTime != null) next.arrivalTime = String(body.arrivalTime).trim();
      if (body.price != null) next.price = Number(body.price);
      if (body.status != null) next.status = String(body.status).trim().slice(0, 30);
      if (body.aircraft != null) next.aircraft = String(body.aircraft).trim().slice(0, 60) || null;
      if (body.cabinClasses != null) next.cabinClasses = String(body.cabinClasses).trim().slice(0, 120) || "Economy,Business";
      if (body.baggageAllowance != null) next.baggageAllowance = String(body.baggageAllowance).trim().slice(0, 160) || "15kg check-in + 7kg cabin";
      if (body.terminal != null) next.terminal = String(body.terminal).trim().slice(0, 20) || null;
      if (body.gate != null) next.gate = String(body.gate).trim().slice(0, 20) || null;
      if (body.baggageBelt != null) next.baggageBelt = String(body.baggageBelt).trim().slice(0, 20) || null;
      if (body.stops != null) next.stops = Math.max(0, Math.min(5, Number(body.stops) || 0));
      if (body.durationMinutes != null) next.durationMinutes = Math.max(1, Number(body.durationMinutes) || 0);
      if (body.departureDate != null) next.departureDate = String(body.departureDate).slice(0, 10);
      // mysql2 returns DATE columns as Date objects; normalise before validating or
      // partial updates that omit departureDate would always fail validation.
      if (next.departureDate instanceof Date) next.departureDate = next.departureDate.toISOString().slice(0, 10);

      if (body.origin != null) {
        const airport = await resolveAirport(body.origin);
        if (!airport) { await conn.rollback(); return res.status(400).json({ ok: false, message: "Origin airport is not in the shared catalogue." }); }
        next.origin = airportDisplay(airport);
      }
      if (body.destination != null) {
        const airport = await resolveAirport(body.destination);
        if (!airport) { await conn.rollback(); return res.status(400).json({ ok: false, message: "Destination airport is not in the shared catalogue." }); }
        next.destination = airportDisplay(airport);
      }

      if (!/^[A-Z0-9-]{2,20}$/.test(next.flightNumber)) {
        await conn.rollback();
        return res.status(400).json({ ok: false, message: "Flight number must be 2–20 letters, digits or hyphens." });
      }
      if (!Number.isFinite(Number(next.price)) || Number(next.price) <= 0) {
        await conn.rollback();
        return res.status(400).json({ ok: false, message: "Price must be greater than zero." });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(next.departureDate).slice(0, 10))) {
        await conn.rollback();
        return res.status(400).json({ ok: false, message: "A valid departure date is required." });
      }
      if (parseTimeToMinutes(next.departureTime) == null || parseTimeToMinutes(next.arrivalTime) == null) {
        await conn.rollback();
        return res.status(400).json({ ok: false, message: "Departure and arrival times must use HH:MM AM/PM." });
      }
      const originCode = (String(next.origin).match(/\(([A-Z]{3})\)/) || [])[1];
      const destinationCode = (String(next.destination).match(/\(([A-Z]{3})\)/) || [])[1];
      if (originCode && originCode === destinationCode) {
        await conn.rollback();
        return res.status(400).json({ ok: false, message: "Origin and destination must be different airports." });
      }

      if (next.durationMinutes == null) next.durationMinutes = minutesBetween(next.departureTime, next.arrivalTime);

      const [[dup]] = await conn.query(
        "SELECT id FROM flights WHERE flightNumber = ? AND departureDate = ? AND id <> ? LIMIT 1",
        [next.flightNumber, next.departureDate, id]
      );
      if (dup) { await conn.rollback(); return res.status(409).json({ ok: false, message: "Another flight already uses this number on that date." }); }

      const capacity = body.capacity != null ? Number(body.capacity) : null;
      if (capacity != null && (!Number.isFinite(capacity) || capacity < 1 || capacity > 400)) {
        await conn.rollback();
        return res.status(400).json({ ok: false, message: "Seat capacity must be between 1 and 400." });
      }
      let nextActive = flight.isActive;
      if (body.isActive != null) {
        const parsedActive = parseRequiredBoolean(body.isActive);
        if (parsedActive == null) {
          await conn.rollback();
          return res.status(400).json({ ok: false, message: "isActive must be true or false." });
        }
        nextActive = parsedActive ? 1 : 0;
      }
      const dateChanged = String(next.departureDate).slice(0, 10) !== String(flight.departureDate).slice(0, 10);
      const [[bookingCount]] = await conn.query(
        "SELECT COUNT(*) AS c FROM bookings WHERE flightId = ? AND status IN ('CONFIRMED','PENDING')",
        [id]
      );
      if ((dateChanged || capacity != null) && Number(bookingCount.c) > 0) {
        await conn.rollback();
        return res.status(409).json({ ok: false, message: "This flight has active bookings. Cancel or complete them before changing the date or seat capacity." });
      }

      await conn.query(
        `UPDATE flights SET flightNumber=?, airline=?, origin=?, destination=?, departureDate=?,
           departureTime=?, arrivalTime=?, price=?, status=?, isActive=?, durationMinutes=?, stops=?,
           aircraft=?, cabinClasses=?, baggageAllowance=?, terminal=?, gate=?, baggageBelt=?
         WHERE id=?`,
        [next.flightNumber, next.airline, next.origin, next.destination, next.departureDate,
         next.departureTime, next.arrivalTime, Number(next.price), next.status,
         nextActive,
         next.durationMinutes, next.stops, next.aircraft, next.cabinClasses, next.baggageAllowance,
         next.terminal, next.gate, next.baggageBelt, id]
      );

      if (capacity != null || dateChanged) {
        const targetCapacity = capacity != null ? Math.floor(capacity) : Number(flight.availableSeats) || 180;
        await conn.query("DELETE FROM seats WHERE flightId = ? AND status = 'available' AND bookingId IS NULL", [id]);
        const cols = targetCapacity >= 120 ? ["A", "B", "C", "D", "E", "F"] : ["A", "B", "C", "D"];
        const rows = Math.ceil(targetCapacity / cols.length);
        const seats = [];
        for (let r = 1; r <= rows; r++) {
          for (const c of cols) {
            if (seats.length >= targetCapacity) break;
            seats.push([id, next.departureDate, `${c}${r}`, "available"]);
          }
        }
        if (seats.length) {
          await conn.query(
            "INSERT IGNORE INTO seats (flightId, travelDate, seatNumber, status) VALUES ?",
            [seats]
          );
        }
        await conn.query("UPDATE flights SET availableSeats = ? WHERE id = ?", [targetCapacity, id]);
      }

      await conn.commit();
      await audit(req, "flight.update", "flight", id, { flightNumber: next.flightNumber, after: next });
      const [[updated]] = await pool.query("SELECT * FROM flights WHERE id = ?", [id]);
      res.json({ ok: true, message: "Flight updated.", flight: updated });
    } catch (error) {
      await conn.rollback();
      console.error("ADMIN FLIGHT UPDATE ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to update flight." });
    } finally {
      conn.release();
    }
  });

  app.patch("/api/admin/flights/:id/status", requireAdmin, async (req, res) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, message: "Flight id must be a positive integer." });
      const isActive = parseRequiredBoolean(req.body?.isActive);
      if (isActive == null) return res.status(400).json({ ok: false, message: "isActive must be true or false." });
      const [[flight]] = await pool.query("SELECT id, flightNumber FROM flights WHERE id = ?", [id]);
      if (!flight) return res.status(404).json({ ok: false, message: "Flight not found." });
      await pool.query("UPDATE flights SET isActive = ? WHERE id = ?", [isActive ? 1 : 0, id]);
      await audit(req, isActive ? "flight.activate" : "flight.deactivate", "flight", id, { flightNumber: flight.flightNumber });
      res.json({ ok: true, message: isActive ? "Flight activated." : "Flight archived (deactivated)." });
    } catch (error) {
      console.error("ADMIN FLIGHT STATUS ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to change flight status." });
    }
  });

  // ─── Admin: bookings ───────────────────────────────────────────────────────

  app.get("/api/admin/bookings", requireAdmin, async (req, res) => {
    try {
      const { page, limit, offset } = pagination(req);
      const search = String(req.query.search || "").trim();
      const status = String(req.query.status || "").trim().toUpperCase();
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();

      let where = "WHERE 1=1";
      const params = [];
      if (search) {
        where += " AND (b.pnr LIKE ? OR b.passengerName LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR f.flightNumber LIKE ? OR f.origin LIKE ? OR f.destination LIKE ?)";
        const like = `%${search}%`;
        params.push(like, like, like, like, like, like, like);
      }
      if (status && BOOKING_STATUSES.includes(status)) { where += " AND b.status = ?"; params.push(status); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { where += " AND DATE(b.travelDate) >= ?"; params.push(from); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(to))   { where += " AND DATE(b.travelDate) <= ?"; params.push(to); }

      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM bookings b LEFT JOIN flights f ON f.id=b.flightId LEFT JOIN users u ON u.id=b.userId ${where}`,
        params
      );
      const [bookings] = await pool.query(
        `SELECT b.id, b.pnr, b.passengerName, b.passengerCount, b.seatNumbers, b.totalPrice,
                b.status, b.cabinClass, b.promoCode, b.createdAt, b.travelDate,
                b.contactEmail, b.contactPhone,
                u.name AS bookedByName, u.email AS bookedByEmail,
                f.flightNumber, f.airline, f.origin, f.destination, f.departureTime, f.arrivalTime
         FROM bookings b LEFT JOIN flights f ON f.id=b.flightId LEFT JOIN users u ON u.id=b.userId
         ${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [[sum]] = await pool.query(
        `SELECT COALESCE(SUM(b.totalPrice),0) AS revenue FROM bookings b LEFT JOIN flights f ON f.id=b.flightId LEFT JOIN users u ON u.id=b.userId ${where}`,
        params
      );
      const total = Number(countRow.total) || 0;
      res.json({
        ok: true,
        bookings: bookings.map(b => ({ ...b, seatNumbers: safeJson(b.seatNumbers, []) })),
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
        revenue: round2(sum.revenue),
      });
    } catch (error) {
      console.error("ADMIN BOOKINGS ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load bookings.", bookings: [] });
    }
  });

  app.get("/api/admin/bookings/:id", requireAdmin, async (req, res) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, message: "Booking id must be a positive integer." });
      const booking = await loadBookingDetail(id);
      if (!booking) return res.status(404).json({ ok: false, message: "Booking not found." });
      res.json({ ok: true, booking });
    } catch (error) {
      console.error("ADMIN BOOKING DETAIL ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load booking." });
    }
  });

  app.patch("/api/admin/bookings/:id/status", requireAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const id = parsePositiveId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, message: "Booking id must be a positive integer." });
      const status = String(req.body?.status || "").trim().toUpperCase();
      if (!BOOKING_STATUSES.includes(status)) {
        return res.status(400).json({ ok: false, message: "Invalid booking status." });
      }
      await conn.beginTransaction();
      const [[booking]] = await conn.query("SELECT * FROM bookings WHERE id = ? FOR UPDATE", [id]);
      if (!booking) { await conn.rollback(); return res.status(404).json({ ok: false, message: "Booking not found." }); }
      if (booking.status === status) { await conn.rollback(); return res.json({ ok: true, message: `Booking is already ${status}.` }); }

      const allowed = {
        PENDING: ["CONFIRMED", "CANCELLED"],
        CONFIRMED: ["COMPLETED", "CANCELLED"],
        COMPLETED: [],
        CANCELLED: [],
      };
      if (!allowed[booking.status]?.includes(status)) {
        await conn.rollback();
        return res.status(409).json({ ok: false, message: `Cannot change a ${booking.status} booking to ${status}.` });
      }

      await conn.query(
        "UPDATE bookings SET status = ?, cancelledAt = ?, cancelledBy = ? WHERE id = ?",
        [status, status === "CANCELLED" ? new Date() : null, status === "CANCELLED" ? "ADMIN" : null, id]
      );

      if (status === "CANCELLED") {
        const seats = safeJson(booking.seatNumbers, []);
        for (const seat of seats) {
          await conn.query(
            "UPDATE seats SET status='available', bookingId=NULL WHERE flightId=? AND travelDate=? AND seatNumber=?",
            [booking.flightId, booking.travelDate, seat]
          );
        }
        if (seats.length) {
          await conn.query("UPDATE flights SET availableSeats = availableSeats + ? WHERE id = ?", [seats.length, booking.flightId]);
        }
      }

      await conn.commit();
      await audit(req, `booking.${status.toLowerCase()}`, "booking", id, { pnr: booking.pnr, from: booking.status, to: status });
      await notify(
        booking.userId,
        status === "CANCELLED" ? "Booking cancelled by support" : `Booking ${status.toLowerCase()}`,
        status === "CANCELLED"
          ? `Booking ${booking.pnr} was cancelled by SkyBook support and its seats were released.`
          : `Booking ${booking.pnr} is now ${status}.`,
        status === "CANCELLED" ? "cancellation" : "booking",
        "/dashboard"
      );
      res.json({ ok: true, message: `Booking marked ${status}.` });
    } catch (error) {
      await conn.rollback();
      console.error("ADMIN BOOKING STATUS ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to update booking status." });
    } finally {
      conn.release();
    }
  });

  // ─── Admin: users ──────────────────────────────────────────────────────────

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const { page, limit, offset } = pagination(req);
      const search = String(req.query.search || "").trim();
      const role = String(req.query.role || "").trim().toUpperCase();
      const active = String(req.query.active ?? "all");

      let where = "WHERE 1=1";
      const params = [];
      if (search) {
        where += " AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)";
        const like = `%${search}%`;
        params.push(like, like, like);
      }
      if (role === "ADMIN") where += " AND EXISTS (SELECT 1 FROM admins a WHERE a.userId = u.id)";
      if (role === "USER")  where += " AND NOT EXISTS (SELECT 1 FROM admins a WHERE a.userId = u.id)";
      if (active === "1" || active === "0") { where += " AND u.isActive = ?"; params.push(Number(active)); }

      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM users u ${where}`,
        params
      );
      const [users] = await pool.query(
        `SELECT u.id, u.name, u.email, u.phone, u.isActive, u.createdAt, u.lastLogin,
                EXISTS (SELECT 1 FROM admins a WHERE a.userId = u.id) AS isAdmin,
                (SELECT COUNT(*) FROM bookings b WHERE b.userId = u.id) AS bookingCount,
                (SELECT COALESCE(SUM(b.totalPrice),0) FROM bookings b WHERE b.userId = u.id AND b.status='CONFIRMED') AS totalSpend
         FROM users u ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [[adminCount]] = await pool.query(
        "SELECT COUNT(*) AS c FROM admins a JOIN users u ON u.id=a.userId WHERE u.isActive=1"
      );
      const total = Number(countRow.total) || 0;
      res.json({
        ok: true,
        users: users.map(u => ({
          ...u,
          role: u.isAdmin ? "ADMIN" : "USER",
          isAdmin: Boolean(u.isAdmin),
          bookingCount: Number(u.bookingCount) || 0,
          totalSpend: round2(u.totalSpend),
        })),
        total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
        activeAdminCount: Number(adminCount.c) || 0,
      });
    } catch (error) {
      console.error("ADMIN USERS ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load users.", users: [] });
    }
  });

  app.patch("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const targetId = parsePositiveId(req.params.id);
      if (!targetId) return res.status(400).json({ ok: false, message: "User id must be a positive integer." });
      const role = String(req.body?.role || "").trim().toUpperCase();
      if (!["ADMIN", "USER"].includes(role)) {
        return res.status(400).json({ ok: false, message: "Role must be ADMIN or USER." });
      }
      await conn.beginTransaction();
      const [[target]] = await conn.query("SELECT id, name, email, isActive FROM users WHERE id = ? FOR UPDATE", [targetId]);
      if (!target) { await conn.rollback(); return res.status(404).json({ ok: false, message: "User not found." }); }

      const [[isAdminRow]] = await conn.query("SELECT id FROM admins WHERE userId = ?", [targetId]);
      const currentlyAdmin = Boolean(isAdminRow);

      if (role === "ADMIN" && !currentlyAdmin) {
        await conn.query("INSERT IGNORE INTO admins (userId) VALUES (?)", [targetId]);
      }
      if (role === "USER" && currentlyAdmin) {
        const [[count]] = await conn.query(
          "SELECT COUNT(*) AS c FROM admins a JOIN users u ON u.id=a.userId WHERE u.isActive=1"
        );
        if (Number(count.c) <= 1) {
          await conn.rollback();
          return res.status(409).json({ ok: false, message: "The last active administrator cannot be demoted." });
        }
        if (targetId === req.user.id) {
          await conn.rollback();
          return res.status(409).json({ ok: false, message: "You cannot remove your own administrator role." });
        }
        await conn.query("DELETE FROM admins WHERE userId = ?", [targetId]);
      }
      await conn.commit();
      await audit(req, "user.role", "user", targetId, { email: target.email, role });
      res.json({ ok: true, message: `Role updated to ${role}.` });
    } catch (error) {
      await conn.rollback();
      console.error("ADMIN USER ROLE ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to update role." });
    } finally {
      conn.release();
    }
  });

  app.patch("/api/admin/users/:id/status", requireAdmin, async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const targetId = parsePositiveId(req.params.id);
      if (!targetId) return res.status(400).json({ ok: false, message: "User id must be a positive integer." });
      const isActive = parseRequiredBoolean(req.body?.isActive);
      if (isActive == null) return res.status(400).json({ ok: false, message: "isActive must be true or false." });
      if (targetId === req.user.id && !isActive) {
        return res.status(409).json({ ok: false, message: "You cannot deactivate your own account." });
      }
      await conn.beginTransaction();
      const [[target]] = await conn.query("SELECT id, name, email, isActive FROM users WHERE id = ? FOR UPDATE", [targetId]);
      if (!target) { await conn.rollback(); return res.status(404).json({ ok: false, message: "User not found." }); }
      const [[isAdminRow]] = await conn.query("SELECT id FROM admins WHERE userId = ?", [targetId]);
      if (isAdminRow && !isActive) {
        const [[count]] = await conn.query(
          "SELECT COUNT(*) AS c FROM admins a JOIN users u ON u.id=a.userId WHERE u.isActive=1"
        );
        if (Number(count.c) <= 1) {
          await conn.rollback();
          return res.status(409).json({ ok: false, message: "The last active administrator cannot be deactivated." });
        }
      }
      await conn.query("UPDATE users SET isActive = ? WHERE id = ?", [isActive ? 1 : 0, targetId]);
      await conn.commit();
      await audit(req, isActive ? "user.activate" : "user.deactivate", "user", targetId, { email: target.email });
      res.json({ ok: true, message: isActive ? "Account activated." : "Account deactivated." });
    } catch (error) {
      await conn.rollback();
      console.error("ADMIN USER STATUS ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to update account status." });
    } finally {
      conn.release();
    }
  });

  // ─── Admin: airports ───────────────────────────────────────────────────────

  app.get("/api/admin/airports", requireAdmin, async (req, res) => {
    try {
      const search = String(req.query.search || "").trim();
      const region = String(req.query.region || "").trim();
      let where = "WHERE 1=1";
      const params = [];
      if (search) {
        where += " AND (code LIKE ? OR city LIKE ? OR airportName LIKE ? OR country LIKE ?)";
        const like = `%${search}%`;
        params.push(like, like, like, like);
      }
      if (region === "domestic" || region === "international") { where += " AND region = ?"; params.push(region); }
      const [airports] = await pool.query(
        `SELECT a.*,
                (SELECT COUNT(*) FROM flights f
                  WHERE f.isActive=1 AND f.departureDate >= CURDATE()
                    AND (f.origin LIKE CONCAT('%', a.code, '%') OR f.destination LIKE CONCAT('%', a.code, '%'))) AS activeFlights
         FROM airports a ${where} ORDER BY a.region DESC, a.city ASC`,
        params
      );
      res.json({ ok: true, airports });
    } catch (error) {
      console.error("ADMIN AIRPORTS ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load airports.", airports: [] });
    }
  });

  app.patch("/api/admin/airports/:id", requireAdmin, async (req, res) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, message: "Airport id must be a positive integer." });
      const [[airport]] = await pool.query("SELECT * FROM airports WHERE id = ?", [id]);
      if (!airport) return res.status(404).json({ ok: false, message: "Airport not found." });
      const body = req.body || {};
      const city = body.city != null ? String(body.city).trim().slice(0, 100) : airport.city;
      const airportName = body.airportName != null ? String(body.airportName).trim().slice(0, 200) : airport.airportName;
      const country = body.country != null ? String(body.country).trim().slice(0, 100) : airport.country;
      const timezone = body.timezone != null ? String(body.timezone).trim().slice(0, 60) : airport.timezone;
      const region = body.region === "international" || body.region === "domestic" ? body.region : airport.region;
      const description = body.description != null ? String(body.description).trim().slice(0, 255) : airport.description;
      const emoji = body.emoji != null ? String(body.emoji).trim().slice(0, 16) : airport.emoji;
      const isActive = body.isActive != null ? (body.isActive ? 1 : 0) : airport.isActive;
      if (!city || !airportName || !country) {
        return res.status(400).json({ ok: false, message: "City, airport name and country are required." });
      }
      await pool.query(
        `UPDATE airports SET city=?, airportName=?, country=?, timezone=?, region=?, description=?, emoji=?, isActive=?
         WHERE id=?`,
        [city, airportName, country, timezone, region, description, emoji, isActive, id]
      );
      await audit(req, "airport.update", "airport", airport.code, { city, airportName, isActive });
      const [[updated]] = await pool.query("SELECT * FROM airports WHERE id = ?", [id]);
      res.json({ ok: true, message: "Airport updated.", airport: updated });
    } catch (error) {
      console.error("ADMIN AIRPORT UPDATE ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to update airport." });
    }
  });

  // ─── Admin: fare watches ───────────────────────────────────────────────────

  app.get("/api/admin/fare-watches", requireAdmin, async (req, res) => {
    try {
      const { page, limit, offset } = pagination(req);
      const search = String(req.query.search || "").trim();
      const active = String(req.query.active ?? "all");
      let where = "WHERE 1=1";
      const params = [];
      if (search) {
        where += " AND (u.email LIKE ? OR u.name LIKE ? OR f.flightNumber LIKE ? OR f.origin LIKE ? OR f.destination LIKE ?)";
        const like = `%${search}%`;
        params.push(like, like, like, like, like);
      }
      if (active === "1" || active === "0") { where += " AND fw.isActive = ?"; params.push(Number(active)); }
      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM fare_watches fw
         JOIN users u ON u.id=fw.userId JOIN flights f ON f.id=fw.flightId ${where}`,
        params
      );
      const [watches] = await pool.query(
        `SELECT fw.*, u.name AS userName, u.email AS userEmail,
                f.flightNumber, f.airline, f.origin, f.destination, f.departureDate, f.departureTime,
                f.price AS latestFlightPrice
         FROM fare_watches fw JOIN users u ON u.id=fw.userId JOIN flights f ON f.id=fw.flightId
         ${where} ORDER BY fw.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [[stats]] = await pool.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(isActive=1),0) AS active,
                COALESCE(SUM(alertTriggered=1),0) AS triggered
         FROM fare_watches`
      );
      const total = Number(countRow.total) || 0;
      res.json({
        ok: true, watches, total, page, limit,
        pages: Math.max(1, Math.ceil(total / limit)),
        stats: {
          total: Number(stats.total) || 0,
          active: Number(stats.active) || 0,
          triggered: Number(stats.triggered) || 0,
        },
        delivery: "In-app notifications only. Email and SMS delivery are not configured in this deployment.",
      });
    } catch (error) {
      console.error("ADMIN FARE WATCHES ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load fare watches.", watches: [] });
    }
  });

  app.post("/api/admin/fare-watches/:id/recheck", requireAdmin, async (req, res) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (!id) return res.status(400).json({ ok: false, message: "Fare watch id must be a positive integer." });
      const [[watch]] = await pool.query("SELECT * FROM fare_watches WHERE id = ?", [id]);
      if (!watch) return res.status(404).json({ ok: false, message: "Fare watch not found." });
      const result = await recheckFareWatch(watch);
      await audit(req, "fare_watch.recheck", "fare_watch", id, result);
      res.json({ ok: true, message: "Fare watch rechecked from database fares.", ...result });
    } catch (error) {
      console.error("ADMIN FARE WATCH RECHECK ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to recheck fare watch." });
    }
  });

  // ─── Admin: reports (JSON + CSV) ───────────────────────────────────────────

  app.get("/api/admin/reports/:type", requireAdmin, async (req, res) => {
    try {
      const type = String(req.params.type || "").toLowerCase();
      const { start, end } = dateRange(req, 90);
      const format = String(req.query.format || "json").toLowerCase();
      let rows = [];
      let summary = {};

      if (type === "bookings") {
        [rows] = await pool.query(
          `SELECT b.id, b.pnr, b.status, b.passengerName, b.passengerCount, b.cabinClass,
                  b.totalPrice, b.promoCode, DATE(b.travelDate) AS travelDate, DATE(b.createdAt) AS bookedOn,
                  f.flightNumber, f.airline, f.origin, f.destination,
                  u.name AS bookedByName, u.email AS bookedByEmail
           FROM bookings b LEFT JOIN flights f ON f.id=b.flightId LEFT JOIN users u ON u.id=b.userId
           WHERE DATE(b.createdAt) BETWEEN ? AND ? ORDER BY b.id DESC`,
          [start, end]
        );
        const [[totals]] = await pool.query(
          `SELECT COUNT(*) AS total, COALESCE(SUM(totalPrice),0) AS value
           FROM bookings WHERE DATE(createdAt) BETWEEN ? AND ?`,
          [start, end]
        );
        summary = { totalBookings: Number(totals.total) || 0, recordedBookingValue: round2(totals.value), note: "Booking value, not collected payment." };
      } else if (type === "routes") {
        [rows] = await pool.query(
          `SELECT CONCAT(f.origin, ' → ', f.destination) AS route,
                  COUNT(*) AS bookings, COUNT(DISTINCT b.userId) AS travellers,
                  COALESCE(SUM(b.totalPrice),0) AS revenue,
                  COALESCE(SUM(b.passengerCount),0) AS passengers
           FROM bookings b JOIN flights f ON f.id=b.flightId
           WHERE b.status='CONFIRMED' AND DATE(b.createdAt) BETWEEN ? AND ?
           GROUP BY route ORDER BY bookings DESC`,
          [start, end]
        );
        summary = { routes: rows.length };
      } else if (type === "users") {
        [rows] = await pool.query(
          `SELECT u.id, u.name, u.email, u.phone, u.isActive, DATE(u.createdAt) AS joined,
                  DATE(u.lastLogin) AS lastLogin,
                  (SELECT COUNT(*) FROM bookings b WHERE b.userId=u.id) AS bookings,
                  EXISTS(SELECT 1 FROM admins a WHERE a.userId=u.id) AS isAdmin
           FROM users u
           WHERE DATE(u.createdAt) BETWEEN ? AND ? ORDER BY u.id ASC`,
          [start, end]
        );
        summary = { users: rows.length };
      } else if (type === "revenue") {
        [rows] = await pool.query(
          `SELECT DATE(createdAt) AS date, COUNT(*) AS bookings,
                  COALESCE(SUM(totalPrice),0) AS revenue
           FROM bookings WHERE status='CONFIRMED' AND DATE(createdAt) BETWEEN ? AND ?
           GROUP BY DATE(createdAt) ORDER BY date ASC`,
          [start, end]
        );
        summary = {
          days: rows.length,
          recordedRevenue: round2(rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0)),
          note: "Recorded booking value. No payment gateway is integrated.",
        };
      } else if (type === "cancellations") {
        [rows] = await pool.query(
          `SELECT DATE(b.createdAt) AS date, COUNT(*) AS cancellations,
                  COALESCE(SUM(b.totalPrice),0) AS cancelledValue
           FROM bookings b WHERE b.status='CANCELLED' AND DATE(b.createdAt) BETWEEN ? AND ?
           GROUP BY DATE(b.createdAt) ORDER BY date ASC`,
          [start, end]
        );
        summary = { cancellations: rows.reduce((sum, row) => sum + Number(row.cancellations || 0), 0) };
      } else if (type === "fare-watches") {
        [rows] = await pool.query(
          `SELECT fw.id, u.email AS userEmail, f.flightNumber, f.origin, f.destination,
                  fw.currentPrice, fw.targetPrice, fw.trend, fw.alertTriggered, fw.isActive,
                  DATE(fw.createdAt) AS createdOn, DATE(fw.lastCheckedAt) AS lastChecked
           FROM fare_watches fw JOIN users u ON u.id=fw.userId JOIN flights f ON f.id=fw.flightId
           ORDER BY fw.id DESC`
        );
        summary = {
          total: rows.length,
          triggered: rows.filter(row => row.alertTriggered).length,
          delivery: "In-app only",
        };
      } else {
        return res.status(404).json({ ok: false, message: "Unknown report type." });
      }

      const payload = { ok: true, type, range: { startDate: start, endDate: end }, summary, rows, generatedAt: new Date().toISOString() };
      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="skybook-${type}-${start}-to-${end}.csv"`);
        return res.send(toCsv(rows));
      }
      res.json(payload);
    } catch (error) {
      console.error("ADMIN REPORT ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to generate report." });
    }
  });

  // ─── Admin: settings + audit ───────────────────────────────────────────────

  app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
    try {
      res.json({ ok: true, settings: await readSettings(ADMIN_SETTING_KEYS) });
    } catch {
      res.status(500).json({ ok: false, message: "Unable to load settings." });
    }
  });

  app.put("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const errors = [];
      const allowed = new Set(ADMIN_SETTING_KEYS);
      for (const [key, rawValue] of Object.entries(body)) {
        if (!allowed.has(key)) continue;
        const value = String(rawValue ?? "").trim();
        if (key === "support_email" && value && !EMAIL_RE.test(value)) errors.push("Support email is invalid.");
        if (key === "cancellation_window_hours") {
          const hours = Number(value);
          if (!Number.isFinite(hours) || hours < 0 || hours > 72) errors.push("Cancellation window must be between 0 and 72 hours.");
        }
        if (key === "max_travelers") {
          const maxTravellers = Number(value);
          if (!Number.isInteger(maxTravellers) || maxTravellers < 1 || maxTravellers > 9) errors.push("Max travellers must be a whole number between 1 and 9.");
        }
        if (key === "fare_alert_interval_minutes") {
          const interval = Number(value);
          if (!Number.isFinite(interval) || interval < 0 || interval > 1440) errors.push("Fare alert interval must be between 0 and 1440 minutes.");
        }
        if (key === "brand_name" && !value) errors.push("Brand name is required.");
      }
      if (errors.length) return res.status(400).json({ ok: false, message: errors.join(" ") });

      for (const key of ADMIN_SETTING_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          await writeSetting(key, String(body[key] ?? "").trim());
        }
      }
      await audit(req, "settings.update", "settings", null, body);
      res.json({ ok: true, message: "Settings saved.", settings: await readSettings(ADMIN_SETTING_KEYS) });
    } catch (error) {
      console.error("ADMIN SETTINGS ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to save settings." });
    }
  });

  app.get("/api/admin/audit-log", requireAdmin, async (req, res) => {
    try {
      const { page, limit, offset } = pagination(req, 30);
      const search = String(req.query.search || "").trim();
      let where = "WHERE 1=1";
      const params = [];
      if (search) {
        where += " AND (a.action LIKE ? OR a.entityType LIKE ? OR a.entityId LIKE ? OR u.email LIKE ?)";
        const like = `%${search}%`;
        params.push(like, like, like, like);
      }
      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM admin_audit_log a JOIN users u ON u.id=a.adminUserId ${where}`,
        params
      );
      const [entries] = await pool.query(
        `SELECT a.*, u.name AS adminName, u.email AS adminEmail
         FROM admin_audit_log a JOIN users u ON u.id=a.adminUserId
         ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const total = Number(countRow.total) || 0;
      res.json({
        ok: true,
        entries: entries.map(entry => ({ ...entry, details: safeJson(entry.details, null) })),
        total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (error) {
      console.error("ADMIN AUDIT ERROR:", error);
      res.status(500).json({ ok: false, message: "Unable to load audit log.", entries: [] });
    }
  });

  return { startFareWatchScheduler, readSettings };
}

module.exports = { registerExtensions, parseTimeToMinutes, minutesBetween, departureDateTime };
