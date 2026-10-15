package com.example.demo;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DatabaseFeatureSchemaInitializer implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    public DatabaseFeatureSchemaInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS fare_watches (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    flight_id BIGINT NOT NULL,
                    route_origin VARCHAR(255),
                    route_destination VARCHAR(255),
                    departure_date DATE,
                    target_price DECIMAL(10,2),
                    current_price DECIMAL(10,2),
                    previous_price DECIMAL(10,2),
                    price_change DECIMAL(10,2),
                    alert_triggered BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at DATETIME,
                    updated_at DATETIME,
                    UNIQUE KEY uq_fare_watch_user_flight (user_id, flight_id),
                    KEY idx_fare_watch_user_created (user_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    title VARCHAR(500),
                    message TEXT,
                    type VARCHAR(50),
                    is_read BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at DATETIME,
                    KEY idx_notification_user_created (user_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS fare_watch_snapshots (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    fare_watch_id BIGINT NOT NULL,
                    observed_price DECIMAL(10,2) NOT NULL,
                    observed_at DATETIME NOT NULL,
                    KEY idx_fare_snapshot_watch_time (fare_watch_id, observed_at),
                    CONSTRAINT fk_fare_snapshot_watch
                        FOREIGN KEY (fare_watch_id) REFERENCES fare_watches(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS user_travel_preferences (
                    user_id BIGINT NOT NULL PRIMARY KEY,
                    preferences VARCHAR(32) NOT NULL,
                    updated_at DATETIME NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS newsletter_subscribers (
                    email VARCHAR(254) NOT NULL PRIMARY KEY,
                    created_at DATETIME NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
    }
}