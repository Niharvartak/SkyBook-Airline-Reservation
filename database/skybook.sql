-- =============================================================
-- SkyBook Airline Reservation System – MySQL / MariaDB Schema
-- Generated: 2026-10-19
-- Compatible with: MySQL 8.0+, MariaDB 10.4+
-- =============================================================

-- -------------------------------------------------------
-- 0. Database
-- -------------------------------------------------------
CREATE DATABASE IF NOT EXISTS skybook
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE skybook;

-- -------------------------------------------------------
-- 1. users
--    Core accounts for travellers; admins flagged in
--    `admins` table.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  name         VARCHAR(120)     NOT NULL,
  email        VARCHAR(191)     NOT NULL,
  passwordHash VARCHAR(255)     NOT NULL,
  createdAt    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- 2. admins
--    Links a user to admin privileges.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  userId    INT UNSIGNED NOT NULL,
  createdAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_userId (userId),
  CONSTRAINT fk_admins_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- 3. flights
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS flights (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  flightNumber    VARCHAR(20)  NOT NULL,
  airline         VARCHAR(100) NOT NULL DEFAULT 'SkyBook Airlines',
  origin          VARCHAR(100) NOT NULL,
  destination     VARCHAR(100) NOT NULL,
  departureDate   DATE         NOT NULL,
  departureTime   VARCHAR(20)  NOT NULL DEFAULT '08:00 AM',
  arrivalTime     VARCHAR(20)  NOT NULL DEFAULT '10:00 AM',
  price           DECIMAL(10,2) NOT NULL DEFAULT 4999.00,
  status          VARCHAR(30)  NOT NULL DEFAULT 'On Time',
  availableSeats  INT          NOT NULL DEFAULT 32,
  isActive        TINYINT(1)   NOT NULL DEFAULT 1,
  createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_flights_num_date (flightNumber, departureDate),
  KEY idx_flights_origin      (origin(40)),
  KEY idx_flights_destination (destination(40)),
  KEY idx_flights_date        (departureDate),
  KEY idx_flights_active_date (isActive, departureDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- 4. seats
--    Per-flight, per-date seat inventory.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS seats (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  flightId    INT UNSIGNED NOT NULL,
  travelDate  DATE         NOT NULL,
  seatNumber  VARCHAR(10)  NOT NULL,
  status      ENUM('available','booked','blocked') NOT NULL DEFAULT 'available',
  bookingId   INT UNSIGNED DEFAULT NULL,
  createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seats_flight_date_seat (flightId, travelDate, seatNumber),
  KEY idx_seats_flightId   (flightId),
  KEY idx_seats_bookingId  (bookingId),
  CONSTRAINT fk_seats_flight FOREIGN KEY (flightId) REFERENCES flights (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- 5. bookings
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  userId         INT UNSIGNED  NOT NULL,
  flightId       INT UNSIGNED  NOT NULL,
  pnr            VARCHAR(20)   NOT NULL,
  travelDate     DATE          NOT NULL,
  passengerName  VARCHAR(200)  NOT NULL,
  passengerCount INT           NOT NULL DEFAULT 1,
  seatNumbers    JSON          DEFAULT NULL,   -- ["A1","B2"]
  passengers     JSON          DEFAULT NULL,   -- detailed passenger array
  contactEmail   VARCHAR(191)  DEFAULT NULL,
  contactPhone   VARCHAR(30)   DEFAULT NULL,
  totalPrice     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  promoCode      VARCHAR(30)   DEFAULT NULL,
  status         ENUM('CONFIRMED','CANCELLED','PENDING') NOT NULL DEFAULT 'CONFIRMED',
  createdAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_pnr    (pnr),
  KEY idx_bookings_userId       (userId),
  KEY idx_bookings_flightId     (flightId),
  KEY idx_bookings_status       (status),
  KEY idx_bookings_createdAt    (createdAt),
  CONSTRAINT fk_bookings_user   FOREIGN KEY (userId)   REFERENCES users   (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_flight FOREIGN KEY (flightId) REFERENCES flights (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add FK from seats.bookingId now that bookings exists
ALTER TABLE seats
  ADD CONSTRAINT fk_seats_booking FOREIGN KEY (bookingId) REFERENCES bookings (id) ON DELETE SET NULL;

-- -------------------------------------------------------
-- 6. fare_watches
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS fare_watches (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  userId          INT UNSIGNED  NOT NULL,
  flightId        INT UNSIGNED  NOT NULL,
  targetPrice     DECIMAL(10,2) DEFAULT NULL,
  currentPrice    DECIMAL(10,2) NOT NULL,
  previousPrice   DECIMAL(10,2) DEFAULT NULL,
  priceChange     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  alertTriggered  TINYINT(1)    NOT NULL DEFAULT 0,
  trend           ENUM('up','down','stable') NOT NULL DEFAULT 'stable',
  updatedAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  createdAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fare_watches_user_flight (userId, flightId),
  KEY idx_fare_watches_userId  (userId),
  KEY idx_fare_watches_flightId (flightId),
  CONSTRAINT fk_fw_user   FOREIGN KEY (userId)   REFERENCES users   (id) ON DELETE CASCADE,
  CONSTRAINT fk_fw_flight FOREIGN KEY (flightId) REFERENCES flights (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- 7. fare_watch_snapshots
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS fare_watch_snapshots (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  fareWatchId  INT UNSIGNED  NOT NULL,
  price        DECIMAL(10,2) NOT NULL,
  observedAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fws_fareWatchId (fareWatchId),
  KEY idx_fws_observedAt  (observedAt),
  CONSTRAINT fk_fws_fareWatch FOREIGN KEY (fareWatchId) REFERENCES fare_watches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- 8. notifications
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  userId    INT UNSIGNED NOT NULL,
  title     VARCHAR(200) NOT NULL,
  message   TEXT         NOT NULL,
  type      VARCHAR(30)  NOT NULL DEFAULT 'info',
  `read`    TINYINT(1)   NOT NULL DEFAULT 0,
  createdAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_userId    (userId),
  KEY idx_notif_read      (`read`),
  KEY idx_notif_createdAt (createdAt),
  CONSTRAINT fk_notif_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- 9. account_preferences
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_preferences (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  userId      INT UNSIGNED NOT NULL,
  preferences JSON         NOT NULL DEFAULT ('[]'),
  updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_acct_pref_userId (userId),
  CONSTRAINT fk_acct_pref_user FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- 10. newsletter_subscribers
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email     VARCHAR(191) NOT NULL,
  createdAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_newsletter_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------
-- 11. airports
--    Master list of Indian + international airports used
--    for searchable origin/destination autocomplete.
--    Seed via: src/backend/seed-airports-flights.js
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS airports (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        CHAR(3)      NOT NULL,
  city        VARCHAR(100) NOT NULL,
  airportName VARCHAR(200) NOT NULL,
  country     VARCHAR(100) NOT NULL,
  timezone    VARCHAR(60)  NOT NULL DEFAULT 'UTC',
  region      ENUM('domestic','international') NOT NULL DEFAULT 'domestic',
  createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_airports_code (code),
  KEY idx_airports_region (region),
  KEY idx_airports_country (country)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- SEED DATA
-- =============================================================

-- -------------------------------------------------------
-- Seed: Admin user  (development password: Admin@123)
-- -------------------------------------------------------
INSERT IGNORE INTO users (id, name, email, passwordHash, createdAt) VALUES
(16, 'SkyBook Admin', 'admin@skybook.com',
 '$2b$10$Ht9kPKzYBAuwNrOJUAmcVuIsq.M5PuAOyRD.fPXexOQSRcokzQlbi',
 '2026-09-10 17:59:59');

INSERT IGNORE INTO admins (userId) VALUES (16);

-- -------------------------------------------------------
-- Seed: Demo user  (password: demo123)
-- -------------------------------------------------------
INSERT IGNORE INTO users (id, name, email, passwordHash, createdAt) VALUES
(9, 'Demo Traveler', 'demo@skybook.com',
 '$2b$10$2y9um7J2m/1135ZzfyE6Zews2/ix3Nutw/vC1Uw1hgTu1JqA7rpCm',
 '2026-09-10 17:59:59');

-- -------------------------------------------------------
-- Seed: Flight schedule (85 unique routes, 30-day window)
-- We generate dates dynamically in the migration helper.
-- Below inserts the base route catalog for today + 7 days.
-- -------------------------------------------------------

-- The migration script (migrate-to-mysql.cjs) will insert
-- full 30-day schedules. The entries below are static seeds
-- for the first 3 days so the app works immediately.

SET @d0 = CURDATE();
SET @d1 = DATE_ADD(CURDATE(), INTERVAL 1 DAY);
SET @d2 = DATE_ADD(CURDATE(), INTERVAL 2 DAY);

INSERT IGNORE INTO flights (flightNumber, airline, origin, destination, departureDate, departureTime, arrivalTime, price, status, availableSeats, isActive) VALUES
-- Day 0
('SK-101', 'SkyBook Airlines',     'Mumbai (BOM)',    'Delhi (DEL)',        @d0, '08:00 AM', '10:15 AM',  4999.00, 'On Time', 32, 1),
('SK-102', 'SkyBook Express',      'Mumbai (BOM)',    'Delhi (DEL)',        @d0, '01:30 PM', '03:45 PM',  5499.00, 'On Time', 32, 1),
('SK-201', 'SkyBook Airlines',     'Delhi (DEL)',     'Mumbai (BOM)',       @d0, '07:00 AM', '09:20 AM',  4500.00, 'On Time', 32, 1),
('SK-202', 'SkyBook Airlines',     'Delhi (DEL)',     'Goa (GOI)',          @d0, '11:30 AM', '02:00 PM',  3499.00, 'On Time', 32, 1),
('SK-203', 'SkyBook Express',      'Delhi (DEL)',     'Bengaluru (BLR)',    @d0, '06:00 AM', '09:00 AM',  5200.00, 'On Time', 32, 1),
('SK-301', 'SkyBook Airlines',     'Mumbai (BOM)',    'Dubai (DXB)',        @d0, '09:00 PM', '11:30 PM', 12500.00, 'On Time', 32, 1),
('SK-302', 'SkyBook International','Mumbai (BOM)',    'Singapore (SIN)',    @d0, '10:00 PM', '06:30 AM', 18000.00, 'On Time', 32, 1),
('SK-303', 'SkyBook Airlines',     'Mumbai (BOM)',    'Goa (GOI)',          @d0, '07:30 AM', '08:45 AM',  2999.00, 'On Time', 32, 1),
('SK-304', 'SkyBook Airlines',     'Mumbai (BOM)',    'Bengaluru (BLR)',    @d0, '06:00 AM', '07:30 AM',  3800.00, 'On Time', 32, 1),
('SK-305', 'SkyBook International','Mumbai (BOM)',    'Bangkok (BKK)',      @d0, '11:00 PM', '05:30 AM', 15500.00, 'On Time', 32, 1),
('SK-401', 'SkyBook Airlines',     'Bengaluru (BLR)', 'Delhi (DEL)',        @d0, '05:30 AM', '08:30 AM',  5100.00, 'On Time', 32, 1),
('SK-402', 'SkyBook Express',      'Bengaluru (BLR)', 'Mumbai (BOM)',       @d0, '09:00 AM', '10:30 AM',  3700.00, 'On Time', 32, 1),
('SK-403', 'SkyBook Airlines',     'Bengaluru (BLR)', 'Hyderabad (HYD)',    @d0, '12:00 PM', '01:00 PM',  2200.00, 'On Time', 32, 1),
('SK-501', 'SkyBook Airlines',     'Hyderabad (HYD)', 'Delhi (DEL)',        @d0, '06:00 AM', '08:30 AM',  4800.00, 'On Time', 32, 1),
('SK-502', 'SkyBook Express',      'Hyderabad (HYD)', 'Mumbai (BOM)',       @d0, '10:00 AM', '11:30 AM',  3300.00, 'On Time', 32, 1),
('SK-601', 'SkyBook Airlines',     'Goa (GOI)',       'Mumbai (BOM)',        @d0, '10:00 AM', '11:15 AM',  3100.00, 'On Time', 32, 1),
('SK-602', 'SkyBook Airlines',     'Goa (GOI)',       'Delhi (DEL)',         @d0, '03:00 PM', '05:30 PM',  4200.00, 'On Time', 32, 1),
('SK-701', 'SkyBook Airlines',     'Chennai (MAA)',   'Delhi (DEL)',         @d0, '07:00 AM', '09:30 AM',  5300.00, 'On Time', 32, 1),
('SK-702', 'SkyBook Express',      'Chennai (MAA)',   'Mumbai (BOM)',        @d0, '11:00 AM', '12:45 PM',  3600.00, 'On Time', 32, 1),
('SK-801', 'SkyBook Airlines',     'Kolkata (CCU)',   'Mumbai (BOM)',        @d0, '06:00 AM', '09:00 AM',  5500.00, 'On Time', 32, 1),
('SK-802', 'SkyBook Airlines',     'Kolkata (CCU)',   'Delhi (DEL)',         @d0, '09:00 AM', '11:30 AM',  4300.00, 'On Time', 32, 1),
-- International
('SK-901', 'SkyBook International','Delhi (DEL)',     'London (LHR)',        @d0, '08:00 PM', '01:00 AM', 45000.00, 'On Time', 32, 1),
('SK-902', 'SkyBook International','Mumbai (BOM)',    'New York (JFK)',      @d0, '10:00 PM', '05:30 AM', 65000.00, 'On Time', 32, 1),
('SK-903', 'SkyBook International','Delhi (DEL)',     'Paris (CDG)',         @d0, '09:30 PM', '02:30 AM', 48000.00, 'On Time', 32, 1),
('SK-1001','SkyBook Airlines',     'Kolkata (CCU)',   'Mumbai (BOM)',        @d0, '06:00 AM', '09:00 AM',  5500.00, 'On Time', 32, 1),
('SK-1002','SkyBook Airlines',     'Kolkata (CCU)',   'Delhi (DEL)',         @d0, '09:00 AM', '11:30 AM',  4300.00, 'On Time', 32, 1),
('SK-1003','SkyBook Express',      'Kolkata (CCU)',   'Bengaluru (BLR)',     @d0, '03:00 PM', '06:00 PM',  5800.00, 'On Time', 32, 1),
-- Day 1
('SK-101', 'SkyBook Airlines',     'Mumbai (BOM)',    'Delhi (DEL)',        @d1, '08:00 AM', '10:15 AM',  4999.00, 'On Time', 32, 1),
('SK-102', 'SkyBook Express',      'Mumbai (BOM)',    'Delhi (DEL)',        @d1, '01:30 PM', '03:45 PM',  5499.00, 'On Time', 32, 1),
('SK-201', 'SkyBook Airlines',     'Delhi (DEL)',     'Mumbai (BOM)',       @d1, '07:00 AM', '09:20 AM',  4500.00, 'On Time', 32, 1),
('SK-202', 'SkyBook Airlines',     'Delhi (DEL)',     'Goa (GOI)',          @d1, '11:30 AM', '02:00 PM',  3499.00, 'On Time', 32, 1),
('SK-203', 'SkyBook Express',      'Delhi (DEL)',     'Bengaluru (BLR)',    @d1, '06:00 AM', '09:00 AM',  5200.00, 'On Time', 32, 1),
('SK-301', 'SkyBook Airlines',     'Mumbai (BOM)',    'Dubai (DXB)',        @d1, '09:00 PM', '11:30 PM', 12500.00, 'On Time', 32, 1),
('SK-302', 'SkyBook International','Mumbai (BOM)',    'Singapore (SIN)',    @d1, '10:00 PM', '06:30 AM', 18000.00, 'On Time', 32, 1),
('SK-303', 'SkyBook Airlines',     'Mumbai (BOM)',    'Goa (GOI)',          @d1, '07:30 AM', '08:45 AM',  2999.00, 'On Time', 32, 1),
('SK-304', 'SkyBook Airlines',     'Mumbai (BOM)',    'Bengaluru (BLR)',    @d1, '06:00 AM', '07:30 AM',  3800.00, 'On Time', 32, 1),
('SK-401', 'SkyBook Airlines',     'Bengaluru (BLR)', 'Delhi (DEL)',        @d1, '05:30 AM', '08:30 AM',  5100.00, 'On Time', 32, 1),
('SK-402', 'SkyBook Express',      'Bengaluru (BLR)', 'Mumbai (BOM)',       @d1, '09:00 AM', '10:30 AM',  3700.00, 'On Time', 32, 1),
('SK-403', 'SkyBook Airlines',     'Bengaluru (BLR)', 'Hyderabad (HYD)',    @d1, '12:00 PM', '01:00 PM',  2200.00, 'On Time', 32, 1),
('SK-501', 'SkyBook Airlines',     'Hyderabad (HYD)', 'Delhi (DEL)',        @d1, '06:00 AM', '08:30 AM',  4800.00, 'On Time', 32, 1),
('SK-502', 'SkyBook Express',      'Hyderabad (HYD)', 'Mumbai (BOM)',       @d1, '10:00 AM', '11:30 AM',  3300.00, 'On Time', 32, 1),
('SK-601', 'SkyBook Airlines',     'Goa (GOI)',       'Mumbai (BOM)',        @d1, '10:00 AM', '11:15 AM',  3100.00, 'On Time', 32, 1),
('SK-701', 'SkyBook Airlines',     'Chennai (MAA)',   'Delhi (DEL)',         @d1, '07:00 AM', '09:30 AM',  5300.00, 'On Time', 32, 1),
('SK-702', 'SkyBook Express',      'Chennai (MAA)',   'Mumbai (BOM)',        @d1, '11:00 AM', '12:45 PM',  3600.00, 'On Time', 32, 1),
('SK-801', 'SkyBook Airlines',     'Kolkata (CCU)',   'Mumbai (BOM)',        @d1, '06:00 AM', '09:00 AM',  5500.00, 'On Time', 32, 1),
('SK-802', 'SkyBook Airlines',     'Kolkata (CCU)',   'Delhi (DEL)',         @d1, '09:00 AM', '11:30 AM',  4300.00, 'On Time', 32, 1),
('SK-901', 'SkyBook International','Delhi (DEL)',     'London (LHR)',        @d1, '08:00 PM', '01:00 AM', 45000.00, 'On Time', 32, 1),
-- Day 2
('SK-101', 'SkyBook Airlines',     'Mumbai (BOM)',    'Delhi (DEL)',        @d2, '08:00 AM', '10:15 AM',  4999.00, 'On Time', 32, 1),
('SK-201', 'SkyBook Airlines',     'Delhi (DEL)',     'Mumbai (BOM)',       @d2, '07:00 AM', '09:20 AM',  4500.00, 'On Time', 32, 1),
('SK-202', 'SkyBook Airlines',     'Delhi (DEL)',     'Goa (GOI)',          @d2, '11:30 AM', '02:00 PM',  3499.00, 'On Time', 32, 1),
('SK-301', 'SkyBook Airlines',     'Mumbai (BOM)',    'Dubai (DXB)',        @d2, '09:00 PM', '11:30 PM', 12500.00, 'On Time', 32, 1),
('SK-401', 'SkyBook Airlines',     'Bengaluru (BLR)', 'Delhi (DEL)',        @d2, '05:30 AM', '08:30 AM',  5100.00, 'On Time', 32, 1),
('SK-501', 'SkyBook Airlines',     'Hyderabad (HYD)', 'Delhi (DEL)',        @d2, '06:00 AM', '08:30 AM',  4800.00, 'On Time', 32, 1),
('SK-701', 'SkyBook Airlines',     'Chennai (MAA)',   'Delhi (DEL)',         @d2, '07:00 AM', '09:30 AM',  5300.00, 'On Time', 32, 1),
('SK-801', 'SkyBook Airlines',     'Kolkata (CCU)',   'Mumbai (BOM)',        @d2, '06:00 AM', '09:00 AM',  5500.00, 'On Time', 32, 1);

-- -------------------------------------------------------
-- Seed: 56 airports (Indian domestic + international)
-- -------------------------------------------------------
INSERT IGNORE INTO airports (code, city, airportName, country, timezone, region) VALUES
('BOM','Mumbai','Chhatrapati Shivaji Maharaj International Airport','India','Asia/Kolkata','domestic'),
('DEL','Delhi','Indira Gandhi International Airport','India','Asia/Kolkata','domestic'),
('BLR','Bengaluru','Kempegowda International Airport','India','Asia/Kolkata','domestic'),
('HYD','Hyderabad','Rajiv Gandhi International Airport','India','Asia/Kolkata','domestic'),
('MAA','Chennai','Chennai International Airport','India','Asia/Kolkata','domestic'),
('CCU','Kolkata','Netaji Subhas Chandra Bose International Airport','India','Asia/Kolkata','domestic'),
('PNQ','Pune','Pune International Airport','India','Asia/Kolkata','domestic'),
('AMD','Ahmedabad','Sardar Vallabhbhai Patel International Airport','India','Asia/Kolkata','domestic'),
('GOI','Goa','Goa International Airport (Dabolim)','India','Asia/Kolkata','domestic'),
('COK','Kochi','Cochin International Airport','India','Asia/Kolkata','domestic'),
('JAI','Jaipur','Jaipur International Airport','India','Asia/Kolkata','domestic'),
('LKO','Lucknow','Chaudhary Charan Singh International Airport','India','Asia/Kolkata','domestic'),
('IXC','Chandigarh','Chandigarh Airport','India','Asia/Kolkata','domestic'),
('IDR','Indore','Devi Ahilyabai Holkar Airport','India','Asia/Kolkata','domestic'),
('NAG','Nagpur','Dr. Babasaheb Ambedkar International Airport','India','Asia/Kolkata','domestic'),
('SXR','Srinagar','Sheikh ul-Alam International Airport','India','Asia/Kolkata','domestic'),
('VNS','Varanasi','Lal Bahadur Shastri International Airport','India','Asia/Kolkata','domestic'),
('BBI','Bhubaneswar','Biju Patnaik International Airport','India','Asia/Kolkata','domestic'),
('GAU','Guwahati','Lokpriya Gopinath Bordoloi International Airport','India','Asia/Kolkata','domestic'),
('PAT','Patna','Jay Prakash Narayan International Airport','India','Asia/Kolkata','domestic'),
('CJB','Coimbatore','Coimbatore International Airport','India','Asia/Kolkata','domestic'),
('TRV','Thiruvananthapuram','Trivandrum International Airport','India','Asia/Kolkata','domestic'),
('IXE','Mangaluru','Mangaluru International Airport','India','Asia/Kolkata','domestic'),
('VTZ','Visakhapatnam','Visakhapatnam Airport','India','Asia/Kolkata','domestic'),
('ATQ','Amritsar','Sri Guru Ram Dass Jee International Airport','India','Asia/Kolkata','domestic'),
('DED','Dehradun','Jolly Grant Airport','India','Asia/Kolkata','domestic'),
('IXR','Ranchi','Birsa Munda Airport','India','Asia/Kolkata','domestic'),
('RPR','Raipur','Swami Vivekananda Airport','India','Asia/Kolkata','domestic'),
('STV','Surat','Surat Airport','India','Asia/Kolkata','domestic'),
('BDQ','Vadodara','Vadodara Airport','India','Asia/Kolkata','domestic'),
('DXB','Dubai','Dubai International Airport','UAE','Asia/Dubai','international'),
('AUH','Abu Dhabi','Abu Dhabi International Airport','UAE','Asia/Dubai','international'),
('SIN','Singapore','Singapore Changi Airport','Singapore','Asia/Singapore','international'),
('BKK','Bangkok','Suvarnabhumi Airport','Thailand','Asia/Bangkok','international'),
('KUL','Kuala Lumpur','Kuala Lumpur International Airport','Malaysia','Asia/Kuala_Lumpur','international'),
('LHR','London','Heathrow Airport','UK','Europe/London','international'),
('CDG','Paris','Charles de Gaulle Airport','France','Europe/Paris','international'),
('JFK','New York','John F. Kennedy International Airport','USA','America/New_York','international'),
('FRA','Frankfurt','Frankfurt Airport','Germany','Europe/Berlin','international'),
('DOH','Doha','Hamad International Airport','Qatar','Asia/Qatar','international'),
('MCT','Muscat','Muscat International Airport','Oman','Asia/Muscat','international'),
('CMB','Colombo','Bandaranaike International Airport','Sri Lanka','Asia/Colombo','international'),
('KTM','Kathmandu','Tribhuvan International Airport','Nepal','Asia/Kathmandu','international'),
('MLE','Male','Velana International Airport','Maldives','Indian/Maldives','international'),
('HKG','Hong Kong','Hong Kong International Airport','Hong Kong','Asia/Hong_Kong','international'),
('HND','Tokyo','Tokyo Haneda Airport','Japan','Asia/Tokyo','international'),
('ICN','Seoul','Incheon International Airport','South Korea','Asia/Seoul','international'),
('IST','Istanbul','Istanbul Airport','Turkey','Europe/Istanbul','international'),
('ZRH','Zurich','Zurich Airport','Switzerland','Europe/Zurich','international'),
('AMS','Amsterdam','Amsterdam Schiphol Airport','Netherlands','Europe/Amsterdam','international'),
('JED','Jeddah','King Abdulaziz International Airport','Saudi Arabia','Asia/Riyadh','international'),
('RUH','Riyadh','King Khalid International Airport','Saudi Arabia','Asia/Riyadh','international'),
('MRU','Mauritius','Sir Seewoosagur Ramgoolam International Airport','Mauritius','Indian/Mauritius','international'),
('PER','Perth','Perth Airport','Australia','Australia/Perth','international'),
('SYD','Sydney','Sydney Kingsford Smith Airport','Australia','Australia/Sydney','international'),
('MEL','Melbourne','Melbourne Airport','Australia','Australia/Melbourne','international');
