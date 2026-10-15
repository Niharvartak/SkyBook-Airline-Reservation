package com.example.demo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Date;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

/** Reads existing seat inventory without creating seats or modifying bookings. */
@Component
public class FlightSeatReader {
    private final JdbcTemplate jdbc;

    public FlightSeatReader(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Flight populate(Flight flight) {
        var seats = jdbc.query(
                "SELECT seatNumber, status FROM seats WHERE flightId = ? AND travelDate = ? ORDER BY id",
                (rs, rowNum) -> {
                    String number = rs.getString("seatNumber");
                    String col = number.replaceAll("[0-9]", "");
                    String row = number.replaceAll("[^0-9]", "");
                    Map<String, Object> seat = new LinkedHashMap<>();
                    seat.put("seatNumber", number);
                    seat.put("status", rs.getString("status"));
                    seat.put("row", row.isEmpty() ? 0 : Integer.parseInt(row));
                    seat.put("col", col);
                    seat.put("isWindow", "A".equals(col) || "D".equals(col));
                    seat.put("isAisle", "B".equals(col) || "C".equals(col));
                    seat.put("cabinClass", "Economy");
                    return seat;
                },
                flight.getId(), Date.valueOf(LocalDate.parse(flight.getDepartureDate())));
        flight.setSeats(seats);
        flight.setAvailableSeats((int) seats.stream()
                .filter(seat -> "available".equals(seat.get("status"))).count());
        return flight;
    }
}