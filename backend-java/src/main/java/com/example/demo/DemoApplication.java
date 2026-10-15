package com.example.demo;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;

@SpringBootApplication
public class DemoApplication implements CommandLineRunner {

    @Autowired
    private JdbcTemplate jdbcTemplate;

	public static void main(String[] args) {
		SpringApplication.run(DemoApplication.class, args);
	}

    @Override
    public void run(String... args) throws Exception {
        // Create users table if it doesn't exist yet
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS users (" +
                "id BIGINT AUTO_INCREMENT PRIMARY KEY," +
                "name VARCHAR(255) NOT NULL DEFAULT ''," +
                "email VARCHAR(255) NOT NULL UNIQUE," +
                "password VARCHAR(255) NOT NULL DEFAULT ''," +
                "role VARCHAR(50) DEFAULT 'USER'" +
                ")");

        // Seed a minimal flight catalog used by the live status tracker and sample UI.
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS flights (" +
                "id INT NOT NULL AUTO_INCREMENT PRIMARY KEY," +
                "flightNumber VARCHAR(50) NOT NULL," +
                "airline VARCHAR(255) NOT NULL," +
                "origin VARCHAR(255) NOT NULL," +
                "destination VARCHAR(255) NOT NULL," +
                "departureDate DATE NOT NULL," +
                "departureTime VARCHAR(20) NOT NULL," +
                "arrivalTime VARCHAR(20) NOT NULL," +
                "price DECIMAL(38,2) NOT NULL," +
                "status VARCHAR(255) DEFAULT NULL," +
                "isActive TINYINT(1) NOT NULL DEFAULT 1," +
                "is_active TINYINT(1) NOT NULL DEFAULT 1," +
                "available_seats INT NOT NULL DEFAULT 0" +
                ")");

        seedFlight("SK-101", "Mumbai (BOM)", "Delhi (DEL)", "2026-12-15", "08:00 AM", "10:15 AM", 4500, "On Time", 32);
        seedFlight("SK-201", "Mumbai (BOM)", "Delhi (DEL)", "2026-12-16", "09:30 AM", "11:45 AM", 4800, "On Time", 30);
        seedFlight("SK-303", "Mumbai (BOM)", "Dubai (DXB)", "2026-12-18", "08:15 PM", "11:45 PM", 12500, "Delayed", 12);

        // Fix: if BOTH 'passwordHash' AND 'password' columns exist, migrate data then drop passwordHash.
        // This happens when a previous CHANGE COLUMN attempt failed (e.g. target column already existed).
        try {
            java.util.List<java.util.Map<String, Object>> phRows = jdbcTemplate.queryForList(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'passwordHash'"
            );
            if (!phRows.isEmpty()) {
                java.util.List<java.util.Map<String, Object>> pwRows = jdbcTemplate.queryForList(
                    "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password'"
                );
                if (!pwRows.isEmpty()) {
                    // Both columns exist: copy data from passwordHash -> password for rows that need it, then drop passwordHash
                    System.out.println(">>> Both 'passwordHash' and 'password' columns found. Migrating data and dropping 'passwordHash'...");
                    jdbcTemplate.execute(
                        "UPDATE users SET `password` = passwordHash WHERE (password IS NULL OR password = '') AND passwordHash IS NOT NULL AND passwordHash != ''"
                    );
                    jdbcTemplate.execute("ALTER TABLE users DROP COLUMN passwordHash");
                    System.out.println(">>> 'passwordHash' column dropped successfully.");
                } else {
                    // Only passwordHash exists: rename it to password
                    System.out.println(">>> Renaming 'passwordHash' column to 'password'...");
                    jdbcTemplate.execute(
                        "ALTER TABLE users CHANGE passwordHash `password` VARCHAR(255) NOT NULL DEFAULT ''"
                    );
                    System.out.println(">>> Column renamed successfully.");
                }
            }
        } catch (Exception e) {
            System.out.println(">>> passwordHash migration error: " + e.getMessage());
        }

        // Ensure 'password' column exists (add if somehow still missing)
        try {
            java.util.List<java.util.Map<String, Object>> pwRows = jdbcTemplate.queryForList(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password'"
            );
            if (pwRows.isEmpty()) {
                jdbcTemplate.execute("ALTER TABLE users ADD COLUMN `password` VARCHAR(255) NOT NULL DEFAULT ''");
                System.out.println(">>> Added 'password' column.");
            }
        } catch (Exception e) {
            System.out.println(">>> Could not add password column: " + e.getMessage());
        }

        System.out.println(">>> users table ready.");
    }

    private void seedFlight(
            String flightNumber,
            String origin,
            String destination,
            String departureDate,
            String departureTime,
            String arrivalTime,
            int price,
            String status,
            int availableSeats) {
        jdbcTemplate.update("""
                INSERT INTO flights
                    (flightNumber, airline, origin, destination, departureDate, departureTime,
                     arrivalTime, price, status, isActive, is_active, available_seats)
                SELECT ?, 'SkyBook Airlines', ?, ?, ?, ?, ?, ?, ?, 1, 1, ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM flights
                    WHERE UPPER(REPLACE(REPLACE(REPLACE(flightNumber, '-', ''), ' ', ''), '_', '')) = ?
                )
                """,
                flightNumber, origin, destination, departureDate, departureTime, arrivalTime,
                price, status, availableSeats, flightNumber.replace("-", ""));
    }
}
