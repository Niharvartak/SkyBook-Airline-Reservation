CREATE TABLE IF NOT EXISTS flights (
    id INT NOT NULL AUTO_INCREMENT,
    flightNumber VARCHAR(50) NOT NULL,
    airline VARCHAR(255) NOT NULL,
    origin VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    departureDate DATE NOT NULL,
    departureTime VARCHAR(20) NOT NULL,
    arrivalTime VARCHAR(20) NOT NULL,
    price DECIMAL(38,2) NOT NULL,
    status VARCHAR(255) DEFAULT NULL,
    isActive TINYINT(1) NOT NULL DEFAULT 1,
    arrival_time VARCHAR(255) DEFAULT NULL,
    available_seats INT NOT NULL DEFAULT 0,
    departure_date VARCHAR(255) DEFAULT NULL,
    departure_time VARCHAR(255) DEFAULT NULL,
    flight_number VARCHAR(255) DEFAULT NULL,
    is_active BIT(1) NOT NULL DEFAULT b'1',
    PRIMARY KEY (id),
    UNIQUE KEY uq_flights_number_date (flightNumber, departureDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS bookings (
    id BIGINT NOT NULL AUTO_INCREMENT,
    userId BIGINT DEFAULT NULL,
    flightId BIGINT DEFAULT NULL,
    travelDate VARCHAR(255) DEFAULT NULL,
    passengerName VARCHAR(255) DEFAULT NULL,
    passengerCount INT DEFAULT NULL,
    seatNumbers LONGTEXT,
    totalPrice DECIMAL(38,2) DEFAULT NULL,
    pnr VARCHAR(255) DEFAULT NULL,
    status VARCHAR(255) DEFAULT NULL,
    contactEmail VARCHAR(255) DEFAULT NULL,
    contactPhone VARCHAR(255) DEFAULT NULL,
    passengers LONGTEXT,
    createdAt DATETIME(6) DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bookings_pnr (pnr),
    KEY idx_bookings_user_created (userId, createdAt),
    KEY idx_bookings_flight (flightId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS seats (
    id BIGINT NOT NULL AUTO_INCREMENT,
    flightId BIGINT NOT NULL,
    travelDate DATE NOT NULL,
    seatNumber VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'available',
    bookingId BIGINT DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_seats_flight_date_number (flightId, travelDate, seatNumber),
    KEY idx_seats_booking (bookingId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;