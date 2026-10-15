package com.example.demo.controller;

import com.example.demo.Flight;
import com.example.demo.FlightRepository;
import com.example.demo.FlightSeatReader;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/flights")
public class FlightController {
    private final FlightRepository flightRepository;
    private final FlightSeatReader seatReader;

    public FlightController(FlightRepository flightRepository, FlightSeatReader seatReader) {
        this.flightRepository = flightRepository;
        this.seatReader = seatReader;
    }

    @GetMapping
    public Map<String, Object> getAllFlights() {
        return Map.of("flights", flightRepository.findAll().stream().map(seatReader::populate).toList());
    }

    @GetMapping("/catalog")
    public Map<String, Object> getActiveFlightCatalog() {
        return Map.of("flights", flightRepository.findAllActiveOrderByDate());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getFlightById(@PathVariable Long id) {
        return flightRepository.findById(id)
                .map(flight -> ResponseEntity.ok(Map.<String, Object>of("flight", seatReader.populate(flight))))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/search")
    public ResponseEntity<Map<String, Object>> searchFlights(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String origin,
            @RequestParam(required = false) String destination,
            @RequestParam(required = false) String departureDate) {
        String finalOrigin = from != null ? from : origin;
        String finalDestination = to != null ? to : destination;
        if (blank(finalOrigin) || blank(finalDestination)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Origin and destination are required."));
        }

        LocalDate date = null;
        if (!blank(departureDate)) {
            try {
                date = LocalDate.parse(departureDate);
            } catch (DateTimeParseException ex) {
                return ResponseEntity.badRequest().body(Map.of("message", "Invalid departure date. Use YYYY-MM-DD."));
            }
        }
        List<Flight> flights = date == null
                ? flightRepository.findByActiveTrueAndOriginContainingIgnoreCaseAndDestinationContainingIgnoreCase(
                        finalOrigin, finalDestination)
                : flightRepository.findByActiveTrueAndOriginContainingIgnoreCaseAndDestinationContainingIgnoreCaseAndDepartureDate(
                        finalOrigin, finalDestination, date);
        return ResponseEntity.ok(Map.of("flights", flights.stream().map(seatReader::populate).toList()));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> addFlight(@RequestBody Flight flight) {
        if (flight.getId() != null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Omit id; the database generates it."));
        }
        String error = validate(flight);
        if (error != null) {
            return ResponseEntity.badRequest().body(Map.of("message", error));
        }
        // Inventory comes from the seats table, not client-supplied display fields.
        flight.setAvailableSeats(0);
        Flight saved = flightRepository.saveAndFlush(flight);
        return ResponseEntity.status(201).body(Map.of(
                "flight", seatReader.populate(saved), "message", "Flight created successfully"));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateFlight(
            @PathVariable Long id, @RequestBody Flight updatedFlight) {
        var existing = flightRepository.findById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        if (updatedFlight.getId() != null && !id.equals(updatedFlight.getId())) {
            return ResponseEntity.badRequest().body(Map.of("message", "Body id must match the URL id."));
        }
        String error = validate(updatedFlight);
        if (error != null) {
            return ResponseEntity.badRequest().body(Map.of("message", error));
        }
        Flight flight = existing.get();
        flight.setFlightNumber(updatedFlight.getFlightNumber());
        flight.setAirline(updatedFlight.getAirline());
        flight.setOrigin(updatedFlight.getOrigin());
        flight.setDestination(updatedFlight.getDestination());
        flight.setDepartureDate(updatedFlight.getDepartureDate());
        flight.setDepartureTime(updatedFlight.getDepartureTime());
        flight.setArrivalTime(updatedFlight.getArrivalTime());
        flight.setPrice(updatedFlight.getPrice());
        flight.setStatus(updatedFlight.getStatus());
        flight.setActive(updatedFlight.isActive());
        Flight saved = flightRepository.saveAndFlush(flight);
        return ResponseEntity.ok(Map.of(
                "flight", seatReader.populate(saved), "message", "Flight updated successfully"));
    }

    // Keep the record and booking/seat foreign keys intact.
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteFlight(@PathVariable Long id) {
        var existing = flightRepository.findById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Flight flight = existing.get();
        flight.setActive(false);
        flightRepository.saveAndFlush(flight);
        return ResponseEntity.ok(Map.of("message", "Flight deactivated successfully"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> dataConflict() {
        return ResponseEntity.status(409).body(Map.of(
                "message", "Flight conflicts with existing data. Check flight number and departure date."));
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String validate(Flight flight) {
        if (blank(flight.getFlightNumber()) || blank(flight.getAirline())
                || blank(flight.getOrigin()) || blank(flight.getDestination())
                || blank(flight.getDepartureDate()) || blank(flight.getDepartureTime())
                || blank(flight.getArrivalTime()) || flight.getPrice() == null) {
            return "Flight number, airline, route, departure date, times and price are required.";
        }
        if (flight.getPrice().signum() < 0) {
            return "Price must not be negative.";
        }
        if (flight.getFlightNumber().length() > 50 || flight.getAirline().length() > 255
                || flight.getOrigin().length() > 255 || flight.getDestination().length() > 255
                || flight.getDepartureTime().length() > 20 || flight.getArrivalTime().length() > 20
                || (flight.getStatus() != null && flight.getStatus().length() > 255)) {
            return "A flight field exceeds its database column length.";
        }
        return null;
    }
}