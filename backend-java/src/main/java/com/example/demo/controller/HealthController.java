package com.example.demo.controller;

import com.example.demo.Flight;
import com.example.demo.FlightRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
public class HealthController {

    private final FlightRepository flightRepository;

    public HealthController(FlightRepository flightRepository) {
        this.flightRepository = flightRepository;
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        Map<String, Object> response = new HashMap<>();
        response.put("ok", true);
        response.put("message", "SkyBook backend is running.");
        response.put("version", "2.0");
        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/flights/status?flightNumber=SK-101
     * Look up flight status by flight number.
     */
    @GetMapping("/api/flights/status")
    public ResponseEntity<Map<String, Object>> flightStatus(
            @RequestParam(required = false) String flightNumber) {
        if (flightNumber == null || flightNumber.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("ok", false, "message", "flightNumber parameter is required"));
        }

        String normalized = normalizeFlightNumber(flightNumber.trim())
                .replace("-", "").replace(" ", "").replace("_", "");
        List<Flight> schedules = flightRepository.findActiveByNormalizedFlightNumber(normalized);
        Optional<Flight> found = schedules.stream()
                .filter(flight -> !java.time.LocalDate.parse(flight.getDepartureDate()).isBefore(java.time.LocalDate.now()))
                .findFirst();
        if (found.isEmpty() && !schedules.isEmpty()) {
            found = Optional.of(schedules.get(schedules.size() - 1));
        }

        if (found.isPresent()) {
            Flight f = found.get();
            Map<String, Object> response = new HashMap<>();
            response.put("ok", true);
            Map<String, Object> flight = new HashMap<>();
            flight.put("flightNumber", f.getFlightNumber());
            flight.put("airline", f.getAirline());
            flight.put("origin", f.getOrigin());
            flight.put("destination", f.getDestination());
            flight.put("departureDate", f.getDepartureDate());
            flight.put("departureTime", f.getDepartureTime());
            flight.put("arrivalTime", f.getArrivalTime());
            flight.put("status", f.getStatus() != null ? f.getStatus() : "Status not available");
            String statusSource = java.time.LocalDate.parse(f.getDepartureDate()).isBefore(java.time.LocalDate.now())
                    ? "Historical SkyBook schedule data — the scheduled date has passed; not verified real-time airline information"
                    : "SkyBook schedule data — not verified real-time airline information";
            flight.put("statusSource", statusSource);
            flight.put("terminal", null);
            flight.put("gate", null);
            flight.put("baggageBelt", null);
            response.put("flight", flight);
            return ResponseEntity.ok(response);
        }

        return ResponseEntity.status(404)
                .body(Map.of("ok", false, "message", "Flight " + flightNumber.trim() + " not found in system."));
    }

    private String normalizeFlightNumber(String raw) {
        String cleaned = raw.replaceAll("[\\s_-]", "").toUpperCase();
        if (cleaned.matches("\\d+")) {
            return "SK-" + cleaned;
        }
        if (cleaned.startsWith("SK") && cleaned.length() > 2) {
            return "SK-" + cleaned.substring(2);
        }
        return cleaned;
    }

    /**
     * POST /api/chat — Simple rule-based chatbot for FAQ responses.
     * No external AI provider is connected. Modular for future AI integration.
     */
    @PostMapping("/api/chat")
    public ResponseEntity<Map<String, Object>> chat(@RequestBody Map<String, String> body) {
        String message = body.getOrDefault("message", "").toLowerCase().trim();
        String reply = generateChatReply(message);
        return ResponseEntity.ok(Map.of("ok", true, "reply", reply));
    }

    private String generateChatReply(String message) {
        if (message.contains("baggage") || message.contains("luggage")) {
            return "Baggage allowances are not stored in the SkyBook flight catalog. Please confirm the allowance with the operating airline before travel.";
        }
        if (message.contains("promo") || message.contains("code") || message.contains("discount") || message.contains("offer")) {
            return "Active promo codes: FLYINDIA (30% off domestic routes), WELCOME (₹1,000 off any flight), WORLD20 (20% off Dubai international). Apply at checkout!";
        }
        if (message.contains("cancel") || message.contains("refund")) {
            return "You can cancel an eligible reservation from My Bookings. Refund handling is not integrated in SkyBook, so no refund is processed by this system.";
        }
        if (message.contains("check-in") || message.contains("checkin") || message.contains("boarding")) {
            return "Online check-in and boarding passes are not provided by SkyBook. Please check in with the operating airline.";
        }
        if (message.contains("status") || message.contains("delay") || message.contains("on time")) {
            return "Use Flight Status to look up schedule data stored by SkyBook. This is not a live airline operations feed, and terminal or gate information appears only when provided.";
        }
        if (message.contains("seat") || message.contains("window") || message.contains("aisle")) {
            return "Choose from seats marked available in the booking flow. Seat layouts depend on the inventory configured for each flight.";
        }
        if (message.contains("flight") || message.contains("find") || message.contains("search")) {
            return "Use the Flights search above to find available routes. Choose origin, destination, and date, then click Find Flights. Select a flight to view the seat map.";
        }
        if (message.contains("help") || message.contains("support") || message.contains("contact")) {
            return "I can answer common questions using SkyBook's built-in help topics. This automated assistant is rule-based and does not connect to a human support team.";
        }
        if (message.contains("hello") || message.contains("hi") || message.contains("hey")) {
            return "Hello! I'm the SkyBook travel assistant. I can help with common questions about flight search, seat selection, fares, baggage rules, and schedule lookup.";
        }
        return "I'm the SkyBook rule-based travel assistant. I can help with flight search, applicable promo codes (FLYINDIA, WELCOME, WORLD20), baggage guidance, seats, and schedule lookup.";
    }

    /**
     * GET /api/me — Compatibility endpoint for legacy Node.js frontend calls.
     * Requires Bearer token; returns user info from JWT.
     */
    @GetMapping("/api/me")
    public ResponseEntity<Map<String, Object>> me(java.security.Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(401)
                    .body(Map.of("ok", false, "message", "Unauthorized"));
        }
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "user", Map.of("email", principal.getName())));
    }
}
