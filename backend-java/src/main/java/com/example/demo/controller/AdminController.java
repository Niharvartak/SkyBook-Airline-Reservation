package com.example.demo.controller;

import com.example.demo.*;
import com.example.demo.security.JwtUtil;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * Admin-only controller for analytics, user management, and flight management.
 * All endpoints require ROLE_ADMIN (enforced by SecurityConfig AND @PreAuthorize).
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final BookingRepository bookingRepository;
    private final FlightRepository flightRepository;
    private final UserRepository userRepository;
    private final BookingService bookingService;

    public AdminController(BookingRepository bookingRepository,
                           FlightRepository flightRepository,
                           UserRepository userRepository,
                           BookingService bookingService) {
        this.bookingRepository = bookingRepository;
        this.flightRepository = flightRepository;
        this.userRepository = userRepository;
        this.bookingService = bookingService;
    }

    /**
     * GET /api/admin/dashboard
     * Returns statistics, flight list, user list, recent bookings, and cancellations.
     */
    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getDashboard(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        LocalDate today = LocalDate.now();
        LocalDate firstDay = today.minusDays(29);
        LocalDate lastDay = today;
        try {
            if (startDate != null && !startDate.isBlank()) firstDay = LocalDate.parse(startDate);
            if (endDate != null && !endDate.isBlank()) lastDay = LocalDate.parse(endDate);
        } catch (DateTimeParseException exception) {
            return ResponseEntity.badRequest().body(Map.of(
                    "ok", false, "message", "Dates must use YYYY-MM-DD format."));
        }
        if (lastDay.isBefore(firstDay)) {
            return ResponseEntity.badRequest().body(Map.of(
                    "ok", false, "message", "End date must be on or after the start date."));
        }
        LocalDateTime rangeStart = firstDay.atStartOfDay();
        LocalDateTime rangeEnd = lastDay.plusDays(1).atStartOfDay();

        Map<String, Object> response = new HashMap<>();

        // ── Stats ─────────────────────────────────────────────────────────
        long totalUsers = userRepository.count();
        long totalFlights = flightRepository.count();
        long activeFlights = flightRepository.countByActiveTrue();
        long totalBookings = bookingRepository.countCreatedBetween(rangeStart, rangeEnd);
        long totalCancellations = bookingRepository.countCancellationsBetween(rangeStart, rangeEnd);
        BigDecimal totalRevenue = bookingRepository.revenueBetween(rangeStart, rangeEnd);

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalUsers", totalUsers);
        stats.put("totalFlights", totalFlights);
        stats.put("activeFlights", activeFlights);
        stats.put("totalBookings", totalBookings);
        stats.put("totalCancellations", totalCancellations);
        stats.put("totalRevenue", totalRevenue != null ? totalRevenue : BigDecimal.ZERO);

        // ── Booking status distribution ────────────────────────────────────
        List<Object[]> statusRows = bookingRepository.countStatusesBetween(rangeStart, rangeEnd);
        Map<String, Long> statusDistribution = new LinkedHashMap<>();
        for (Object[] row : statusRows) {
            statusDistribution.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        }
        stats.put("bookingStatusDistribution", statusDistribution);

        // ── Booking trend for the selected date range ─────────────────────
        List<Object[]> bookingTrend = bookingRepository.bookingTrendBetween(rangeStart, rangeEnd);
        List<Map<String, Object>> bookingTrendList = new ArrayList<>();
        for (Object[] row : bookingTrend) {
            Map<String, Object> point = new HashMap<>();
            point.put("date", String.valueOf(row[0]));
            point.put("count", ((Number) row[1]).longValue());
            bookingTrendList.add(point);
        }

        // ── Confirmed booking value trend for the selected date range ─────
        List<Object[]> revenueTrend = bookingRepository.revenueTrendBetween(rangeStart, rangeEnd);
        List<Map<String, Object>> revenueTrendList = new ArrayList<>();
        for (Object[] row : revenueTrend) {
            Map<String, Object> point = new HashMap<>();
            point.put("date", String.valueOf(row[0]));
            point.put("revenue", row[1] != null ? new BigDecimal(row[1].toString()) : BigDecimal.ZERO);
            revenueTrendList.add(point);
        }

        // ── Popular flights (top 10 booked) ───────────────────────────────
        List<Object[]> popularFlightIds = bookingRepository.popularFlightIds();
        List<Map<String, Object>> popularFlights = new ArrayList<>();
        for (Object[] row : popularFlightIds) {
            Long flightId = ((Number) row[0]).longValue();
            long bookingCount = ((Number) row[1]).longValue();
            flightRepository.findById(flightId).ifPresent(f -> {
                Map<String, Object> fl = new HashMap<>();
                fl.put("flightNumber", f.getFlightNumber());
                fl.put("airline", f.getAirline());
                fl.put("origin", f.getOrigin());
                fl.put("destination", f.getDestination());
                fl.put("price", f.getPrice());
                fl.put("bookingCount", bookingCount);
                popularFlights.add(fl);
            });
        }

        // ── Recent bookings (last 20) ──────────────────────────────────────
        List<Booking> recentBookings = bookingRepository.findRecentBookingsBetween(
                rangeStart, rangeEnd, PageRequest.of(0, 20));
        List<Map<String, Object>> bookingsList = new ArrayList<>();
        for (Booking b : recentBookings) {
            Map<String, Object> bMap = buildBookingMap(b);
            bookingsList.add(bMap);
        }

        // ── All flights ────────────────────────────────────────────────────
        List<Flight> allFlights = flightRepository.findAll();
        List<Map<String, Object>> flightsList = new ArrayList<>();
        for (Flight f : allFlights) {
            Map<String, Object> fMap = new HashMap<>();
            fMap.put("id", f.getId());
            fMap.put("flightNumber", f.getFlightNumber());
            fMap.put("airline", f.getAirline());
            fMap.put("origin", f.getOrigin());
            fMap.put("destination", f.getDestination());
            fMap.put("departureDate", f.getDepartureDate());
            fMap.put("departureTime", f.getDepartureTime());
            fMap.put("arrivalTime", f.getArrivalTime());
            fMap.put("price", f.getPrice());
            fMap.put("status", f.getStatus());
            fMap.put("isActive", f.isActive());
            fMap.put("availableSeats", f.getAvailableSeats());
            flightsList.add(fMap);
        }

        // ── All users (without passwords) ─────────────────────────────────
        List<User> allUsers = userRepository.findAll();
        List<Map<String, Object>> usersList = new ArrayList<>();
        for (User u : allUsers) {
            Map<String, Object> uMap = new HashMap<>();
            uMap.put("id", u.getId());
            uMap.put("name", u.getName());
            uMap.put("email", u.getEmail());
            uMap.put("role", u.getRole());
            usersList.add(uMap);
        }

        // ── Cancellations ─────────────────────────────────────────────────
        List<Map<String, Object>> cancellationsList = new ArrayList<>();
        for (Booking b : recentBookings) {
            if ("CANCELLED".equalsIgnoreCase(b.getStatus())) {
                Map<String, Object> cMap = buildBookingMap(b);
                cMap.put("bookedByName", b.getPassengerName());
                cancellationsList.add(cMap);
            }
        }

        // ── Assemble response ──────────────────────────────────────────────
        response.put("ok", true);
        response.put("dateRange", Map.of("startDate", firstDay.toString(), "endDate", lastDay.toString()));
        response.put("stats", stats);
        response.put("bookingTrend", bookingTrendList);
        response.put("revenueTrend", revenueTrendList);
        response.put("popularFlights", popularFlights);
        List<Map<String, Object>> popularDestinations = new ArrayList<>();
        for (Object[] row : bookingRepository.popularDestinationsBetween(rangeStart, rangeEnd)) {
            popularDestinations.add(Map.of("destination", String.valueOf(row[0]), "bookingCount", ((Number) row[1]).longValue()));
        }
        response.put("popularDestinations", popularDestinations);
        response.put("flights", flightsList);
        response.put("users", usersList);
        response.put("bookings", bookingsList);
        response.put("cancellations", cancellationsList);

        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/admin/analytics
     * Focused analytics endpoint with trend data only.
     */
    @GetMapping("/analytics")
    public ResponseEntity<Map<String, Object>> getAnalytics() {
        Map<String, Object> response = new HashMap<>();

        BigDecimal totalRevenue = bookingRepository.totalRevenue();
        response.put("totalRevenue", totalRevenue != null ? totalRevenue : BigDecimal.ZERO);
        response.put("totalBookings", bookingRepository.count());
        response.put("totalUsers", userRepository.count());
        response.put("totalFlights", flightRepository.count());
        response.put("activeFlights", flightRepository.countByActiveTrue());
        response.put("totalCancellations", bookingRepository.countCancellations());

        List<Object[]> bookingTrend = bookingRepository.bookingTrendPerDay();
        List<Map<String, Object>> trendList = new ArrayList<>();
        for (Object[] row : bookingTrend) {
            Map<String, Object> point = new HashMap<>();
            point.put("date", String.valueOf(row[0]));
            point.put("count", ((Number) row[1]).longValue());
            trendList.add(point);
        }
        Collections.reverse(trendList);
        response.put("bookingTrend", trendList);

        List<Object[]> statusRows = bookingRepository.countByStatus();
        Map<String, Long> statusDist = new LinkedHashMap<>();
        for (Object[] row : statusRows) {
            statusDist.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        }
        response.put("statusDistribution", statusDist);

        response.put("ok", true);
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/admin/flights — Create a new flight (admin only).
     */
    @PostMapping("/flights")
    public ResponseEntity<Map<String, Object>> createFlight(@RequestBody Flight flight) {
        if (flight.getId() != null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "Omit id; the database generates it."));
        }
        String error = validateFlight(flight);
        if (error != null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", error));
        }
        flight.setAvailableSeats(0);
        Flight saved = flightRepository.saveAndFlush(flight);
        return ResponseEntity.status(201).body(Map.of("ok", true, "flight", saved, "message", "Flight created successfully"));
    }

    /**
     * PUT /api/admin/flights/:id — Update a flight (admin only).
     */
    @PutMapping("/flights/{id}")
    public ResponseEntity<Map<String, Object>> updateFlight(@PathVariable Long id, @RequestBody Flight updated) {
        return flightRepository.findById(id).map(existing -> {
            existing.setFlightNumber(updated.getFlightNumber());
            existing.setAirline(updated.getAirline());
            existing.setOrigin(updated.getOrigin());
            existing.setDestination(updated.getDestination());
            existing.setDepartureDate(updated.getDepartureDate());
            existing.setDepartureTime(updated.getDepartureTime());
            existing.setArrivalTime(updated.getArrivalTime());
            existing.setPrice(updated.getPrice());
            existing.setStatus(updated.getStatus());
            existing.setActive(updated.isActive());
            Flight saved = flightRepository.saveAndFlush(existing);
            return ResponseEntity.ok(Map.<String, Object>of("ok", true, "flight", saved, "message", "Flight updated"));
        }).orElse(ResponseEntity.notFound().build());
    }

    /**
     * DELETE /api/admin/flights/:id — Soft-delete (deactivate) a flight.
     */
    @DeleteMapping("/flights/{id}")
    public ResponseEntity<Map<String, Object>> deactivateFlight(@PathVariable Long id) {
        return flightRepository.findById(id).map(f -> {
            f.setActive(false);
            flightRepository.saveAndFlush(f);
            return ResponseEntity.ok(Map.<String, Object>of("ok", true, "message", "Flight deactivated"));
        }).orElse(ResponseEntity.notFound().build());
    }

    /**
     * GET /api/admin/users — List all users (admin only).
     */
    @GetMapping("/users")
    public ResponseEntity<Map<String, Object>> getUsers() {
        List<User> users = userRepository.findAll();
        List<Map<String, Object>> usersList = new ArrayList<>();
        for (User u : users) {
            Map<String, Object> uMap = new HashMap<>();
            uMap.put("id", u.getId());
            uMap.put("name", u.getName());
            uMap.put("email", u.getEmail());
            uMap.put("role", u.getRole());
            usersList.add(uMap);
        }
        return ResponseEntity.ok(Map.of("ok", true, "users", usersList));
    }

    // ── Helper ────────────────────────────────────────────────────────────

    private Map<String, Object> buildBookingMap(Booking b) {
        Map<String, Object> bMap = new HashMap<>();
        bMap.put("id", b.getId());
        bMap.put("pnr", b.getPnr());
        bMap.put("userId", b.getUserId());
        bMap.put("flightId", b.getFlightId());
        bMap.put("passengerName", b.getPassengerName());
        bMap.put("totalPrice", b.getTotalPrice());
        bMap.put("status", b.getStatus());
        bMap.put("travelDate", b.getTravelDate());
        bMap.put("createdAt", b.getCreatedAt() != null ? b.getCreatedAt().toString() : null);
        bMap.put("travelers", b.getTravelers());

        // Enrich with flight origin/destination if available
        if (b.getFlightId() != null) {
            flightRepository.findById(b.getFlightId()).ifPresent(f -> {
                bMap.put("origin", f.getOrigin());
                bMap.put("destination", f.getDestination());
                bMap.put("flightNumber", f.getFlightNumber());
                bMap.put("airline", f.getAirline());
            });
        }
        return bMap;
    }

    private String validateFlight(Flight flight) {
        if (isBlank(flight.getFlightNumber()) || isBlank(flight.getAirline())
                || isBlank(flight.getOrigin()) || isBlank(flight.getDestination())
                || isBlank(flight.getDepartureDate()) || isBlank(flight.getDepartureTime())
                || isBlank(flight.getArrivalTime()) || flight.getPrice() == null) {
            return "Flight number, airline, route, departure date, times and price are required.";
        }
        if (flight.getPrice().signum() < 0) {
            return "Price must not be negative.";
        }
        return null;
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
