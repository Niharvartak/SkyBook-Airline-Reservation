package com.example.demo.controller;

import com.example.demo.Flight;
import com.example.demo.FlightRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AI Travel Planner — rule-based flight recommendation service.
 *
 * Implementation note: This service uses actual flight data from the
 * application's own MySQL database to make recommendations. It does NOT
 * connect to an external AI provider or live airline pricing API.
 * The recommendation logic is modular so a real AI provider (e.g. OpenAI,
 * Gemini) can be plugged in later by implementing a TravelPlannerAIService
 * interface.
 */
@RestController
@RequestMapping("/api/planner")
public class TravelPlannerController {

    private final FlightRepository flightRepository;

    public TravelPlannerController(FlightRepository flightRepository) {
        this.flightRepository = flightRepository;
    }

    /**
     * POST /api/planner/recommend
     * Body: {
     *   origin: "Mumbai (BOM)",
     *   destination: "Delhi (DEL)",
     *   departureDate: "2026-10-15",
     *   travelers: 2,
     *   budget: 10000,
     *   preferences: ["relaxation", "direct"]  // optional
     * }
     */
    @PostMapping("/recommend")
    public ResponseEntity<Map<String, Object>> recommend(@RequestBody Map<String, Object> req) {
        String origin = getString(req, "origin");
        String destination = getString(req, "destination");
        String departureDateStr = getString(req, "departureDate");
        String returnDateStr = getString(req, "returnDate");
        int travelers = getInt(req, "travelers", 1);
        BigDecimal budget = getBigDecimal(req, "budget");
        List<String> preferences = getStringList(req.get("preferences"));

        if (isBlank(origin) || isBlank(destination)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("ok", false, "message", "Origin and destination are required"));
        }
        if (travelers < 1 || travelers > 9) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "Travelers must be between 1 and 9"));
        }
        if (req.get("budget") != null
                && (budget == null || budget.compareTo(BigDecimal.ZERO) <= 0)) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "Budget must be a positive amount."));
        }

        LocalDate fromDate = LocalDate.now();
        if (!isBlank(departureDateStr)) {
            try {
                fromDate = LocalDate.parse(departureDateStr);
            } catch (Exception e) {
                return ResponseEntity.badRequest()
                        .body(Map.of("ok", false, "message", "Invalid departure date format (use YYYY-MM-DD)"));
            }
        }
        if (fromDate.isBefore(LocalDate.now())) {
            return ResponseEntity.badRequest()
                    .body(Map.of("ok", false, "message", "Departure date must be today or later"));
        }

        LocalDate throughDate = fromDate;
        if (!isBlank(returnDateStr)) {
            try {
                throughDate = LocalDate.parse(returnDateStr);
            } catch (Exception e) {
                return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "Invalid end date format (use YYYY-MM-DD)"));
            }
            if (throughDate.isBefore(fromDate)) {
                return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "End date must not be before departure date"));
            }
        }

        // Fetch matching flights from the database
        List<Flight> flights = flightRepository.findByRouteAndDateRange(origin, destination, fromDate, throughDate);

        // Filter by budget if provided
        final int travelersCount = travelers;
        final BigDecimal effectiveBudget = budget;
        List<Flight> filtered = flights;
        if (effectiveBudget != null) {
            filtered = flights.stream()
                    .filter(f -> f.getPrice().multiply(BigDecimal.valueOf(travelersCount)).compareTo(effectiveBudget) <= 0)
                    .collect(Collectors.toList());
        }
        filtered = filtered.stream()
            .filter(f -> f.getAvailableSeats() != null && f.getAvailableSeats() >= travelersCount)
            .filter(f -> matchesPreferences(f, preferences))
            .collect(Collectors.toList());

        // Build recommendations
        List<Map<String, Object>> recommendations = new ArrayList<>();
        for (int i = 0; i < Math.min(filtered.size(), 5); i++) {
            Flight f = filtered.get(i);
            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("flightId", f.getId());
            rec.put("flightNumber", f.getFlightNumber());
            rec.put("airline", f.getAirline());
            rec.put("origin", f.getOrigin());
            rec.put("destination", f.getDestination());
            rec.put("departureDate", f.getDepartureDate());
            rec.put("departureTime", f.getDepartureTime());
            rec.put("arrivalTime", f.getArrivalTime());
            rec.put("pricePerPerson", f.getPrice());
            BigDecimal totalCost = f.getPrice().multiply(BigDecimal.valueOf(travelersCount));
            rec.put("totalCost", totalCost);
            rec.put("status", f.getStatus());
            rec.put("availableSeats", f.getAvailableSeats());
            rec.put("matchScore", computeMatchScore(f, i, effectiveBudget, travelersCount));
            rec.put("recommendation", buildRecommendationText(f, travelersCount, totalCost));
            recommendations.add(rec);
        }

        // Itinerary suggestion
        String itinerary = buildItinerary(destination, travelersCount, fromDate, req);

        Map<String, Object> response = new HashMap<>();
        response.put("ok", true);
        response.put("recommendations", recommendations);
        response.put("itinerary", itinerary);
        response.put("searchedOrigin", origin);
        response.put("searchedDestination", destination);
        response.put("travelers", travelersCount);
        response.put("budget", effectiveBudget);
        response.put("preferences", preferences);
        response.put("totalFlightsFound", filtered.size());

        if (recommendations.isEmpty()) {
            response.put("message", "No flights found matching your criteria. Try adjusting your dates, route, or budget.");
        } else {
            response.put("message", String.format("Found %d suitable flight(s) for your trip.", recommendations.size()));
        }

        // Disclaimer — important: this is not a live AI
        response.put("disclaimer", "Recommendations are based on flights currently available in the SkyBook database. " +
                "Prices reflect the application's own fare data, not live external airline pricing.");

        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/planner/destinations — Return available origin/destination pairs from DB.
     */
    @GetMapping("/destinations")
    public ResponseEntity<Map<String, Object>> availableDestinations() {
        List<Flight> flights = flightRepository.findAllActiveOrderByDate();
        Set<String> origins = new LinkedHashSet<>();
        Set<String> destinations = new LinkedHashSet<>();
        for (Flight f : flights) {
            origins.add(f.getOrigin());
            destinations.add(f.getDestination());
        }
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "origins", new ArrayList<>(origins),
                "destinations", new ArrayList<>(destinations)
        ));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private int computeMatchScore(Flight f, int rank, BigDecimal budget, int travelers) {
        int score = 100 - (rank * 10); // Base: first result gets 100, next 90, etc.
        if (budget != null) {
            BigDecimal totalCost = f.getPrice().multiply(BigDecimal.valueOf(travelers));
            if (totalCost.compareTo(budget.multiply(BigDecimal.valueOf(0.7))) <= 0) {
                score += 15; // Well under budget
            }
        }
        if (f.getAvailableSeats() >= travelers) {
            score += 5;
        }
        return Math.min(score, 100);
    }

    private String buildRecommendationText(Flight f, int travelers, BigDecimal totalCost) {
        return String.format(
                "%s flight %s on %s departs at %s. Total fare for %d traveler(s): ₹%s.",
                f.getAirline(), f.getFlightNumber(), f.getDepartureDate(),
                f.getDepartureTime(), travelers, totalCost.toPlainString()
        );
    }

    private String buildItinerary(String destination, int travelers, LocalDate fromDate, Map<String, Object> req) {
        @SuppressWarnings("unchecked")
        List<String> preferences = req.get("preferences") instanceof List
                ? (List<String>) req.get("preferences") : List.of();

        String destCity = destination.replaceAll("\\s*\\([^)]*\\)\\s*", "").trim();
        String prefs = preferences.isEmpty() ? "general travel" : String.join(", ", preferences);

        return String.format(
                "Suggested itinerary for %s (%d traveler(s), departing %s):%n" +
                "• Day 1: Arrive and check into your accommodation. Explore the city centre.%n" +
                "• Day 2: Visit popular landmarks and local cuisine.%n" +
                "• Day 3: Leisure / adventure activities based on your %s preference.%n" +
                "• Day 4: Shopping and departure preparation.%n" +
                "Tip: Book early to secure the best fares shown above.",
                destCity, travelers, fromDate, prefs
        );
    }

    private String getString(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v instanceof String s ? s : null;
    }

    private int getInt(Map<String, Object> map, String key, int def) {
        Object v = map.get(key);
        if (v instanceof Number n) return n.intValue();
        if (v instanceof String s) {
            try { return Integer.parseInt(s); } catch (Exception e) { return def; }
        }
        return def;
    }

    private BigDecimal getBigDecimal(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v == null) return null;
        try { return new BigDecimal(v.toString()); } catch (Exception e) { return null; }
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private List<String> getStringList(Object value) {
        if (!(value instanceof List<?> values)) return List.of();
        return values.stream().filter(String.class::isInstance).map(String.class::cast)
                .map(String::trim).map(String::toLowerCase).filter(valueText -> !valueText.isBlank()).toList();
    }

    private boolean matchesPreferences(Flight flight, List<String> preferences) {
        String departureTime = flight.getDepartureTime() == null ? "" : flight.getDepartureTime().toLowerCase();
        for (String preference : preferences) {
            if ("morning".equals(preference) && !departureTime.contains("am")) return false;
            if ("evening".equals(preference) && !departureTime.contains("pm")) return false;
        }
        return true;
    }
}
