package com.example.demo.controller;

import com.example.demo.Booking;
import com.example.demo.BookingService;
import com.example.demo.UserRepository;
import com.example.demo.FlightRepository;
import com.example.demo.Flight;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private final BookingService bookingService;
    private final UserRepository userRepository;
    private final FlightRepository flightRepository;

    public BookingController(BookingService bookingService, UserRepository userRepository, FlightRepository flightRepository) {
        this.bookingService = bookingService;
        this.userRepository = userRepository;
        this.flightRepository = flightRepository;
    }

    // CREATE - POST /api/bookings
    @PostMapping
    public ResponseEntity<Map<String, Object>> createBooking(
            @RequestBody Booking booking,
            Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("ok", false, "message", "Authentication required"));
        }
        try {
            Long userId = userRepository.findByEmail(principal.getName())
                    .map(user -> user.getId()).orElse(null);
            if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("ok", false, "message", "User not found"));
            booking.setId(null);
            booking.setPnr(null);
            booking.setCreatedAt(null);
            booking.setStatus(null);
            booking.setTotalPrice(null);
            booking.setUserId(userId);

            Booking savedBooking = bookingService.createBooking(booking);
            Map<String, Object> response = new HashMap<>();
            response.put("ok", true);
            response.put("message", "Booking confirmed");

            // Format for frontend
            Map<String, Object> bookingMap = new HashMap<>();
            bookingMap.put("id", savedBooking.getPnr()); // Frontend expects PNR as ID
            bookingMap.put("pnr", savedBooking.getPnr());
            bookingMap.put("status", savedBooking.getStatus());
            bookingMap.put("createdAt", savedBooking.getCreatedAt() != null ? savedBooking.getCreatedAt().toString() : null);
            bookingMap.put("flightId", savedBooking.getFlightId());
            bookingMap.put("travelDate", savedBooking.getTravelDate());
            bookingMap.put("passengerName", savedBooking.getPassengerName());
            bookingMap.put("passengerCount", savedBooking.getTravelers());
            bookingMap.put("totalPrice", savedBooking.getTotalPrice());
            bookingMap.put("seatNumbers", savedBooking.getSeatNumbers());
            bookingMap.put("promoCode", booking.getPromoCode());
            flightRepository.findById(savedBooking.getFlightId()).ifPresent(flight -> {
                bookingMap.put("flightNumber", flight.getFlightNumber());
                bookingMap.put("airline", flight.getAirline());
                bookingMap.put("origin", flight.getOrigin());
                bookingMap.put("destination", flight.getDestination());
                bookingMap.put("departureDate", flight.getDepartureDate());
                bookingMap.put("departureTime", flight.getDepartureTime());
                bookingMap.put("arrivalTime", flight.getArrivalTime());
                BigDecimal basePrice = flight.getPrice().multiply(BigDecimal.valueOf(savedBooking.getTravelers()));
                bookingMap.put("discount", basePrice.subtract(savedBooking.getTotalPrice()).max(BigDecimal.ZERO));
            });
            bookingMap.put("dbId", savedBooking.getId()); // Actual DB ID

            response.put("booking", bookingMap);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", e.getMessage()));
        } catch (Exception e) {
            Map<String, Object> error = new HashMap<>();
            error.put("ok", false);
            error.put("message", "Booking could not be completed.");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    // READ ALL - GET /api/bookings
    // Returns only the authenticated user's bookings (if JWT present), or all (fallback for admin/demo)
    @GetMapping
    public ResponseEntity<Map<String, Object>> getAllBookings(Principal principal) {
        List<Booking> bookings;
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("ok", false, "message", "Authentication required"));
        bookings = userRepository.findByEmail(principal.getName())
            .map(user -> isAdmin(principal) ? bookingService.getAllBookings() : bookingService.getBookingsByUserId(user.getId()))
            .orElseGet(List::of);
        Map<String, Object> response = new HashMap<>();
        response.put("ok", true);
        response.put("bookings", bookings.stream().map(this::bookingView).toList());
        return ResponseEntity.ok(response);
    }

    // READ ONE - GET /api/bookings/:id
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getBookingById(@PathVariable String id, Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("ok", false, "message", "Authentication required"));
        Optional<Booking> bookingOpt;
        if (id.startsWith("BK")) {
            bookingOpt = bookingService.getBookingByPnr(id);
        } else {
            try {
                bookingOpt = bookingService.getBookingById(Long.parseLong(id));
            } catch (NumberFormatException e) {
                bookingOpt = Optional.empty();
            }
        }

        if (bookingOpt.isPresent()) {
            if (!canManage(bookingOpt.get(), principal)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("ok", false, "message", "Access denied"));
            }
            Map<String, Object> response = new HashMap<>();
            response.put("ok", true);
            response.put("booking", bookingOpt.get());
            return ResponseEntity.ok(response);
        } else {
            Map<String, Object> response = new HashMap<>();
            response.put("ok", false);
            response.put("message", "Booking not found");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
        }
    }

    // CANCEL - POST /api/bookings/:id/cancel
    @PostMapping("/{id}/cancel")
    public ResponseEntity<Map<String, Object>> cancelBooking(
            @PathVariable String id,
            Principal principal) {
        try {
            Long dbId = parseId(id);
            Optional<Booking> bookingOpt = bookingService.getBookingById(dbId);
            if (bookingOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("ok", false, "message", "Booking not found"));
            }
            Booking booking = bookingOpt.get();

            // Ownership check: authenticated users can only cancel their own bookings
            if (principal != null) {
                Long callerUserId = userRepository.findByEmail(principal.getName())
                        .map(u -> u.getId()).orElse(null);
                if (callerUserId == null || !isAdmin(principal)
                    && !callerUserId.equals(booking.getUserId())) {
                    return ResponseEntity.status(HttpStatus.FORBIDDEN)
                            .body(Map.of("ok", false, "message", "You can only cancel your own bookings"));
                }
            }

            bookingService.cancelBooking(dbId);

            return ResponseEntity.ok(Map.of("ok", true, "message", "Booking cancelled and seats released"));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("ok", false, "message", e.getMessage()));
        }
    }

    // UPDATE - PUT /api/bookings/:id
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateBooking(@PathVariable String id, @RequestBody Booking bookingDetails, Principal principal) {
        try {
            Long dbId = parseId(id);
            Optional<Booking> existing = bookingService.getBookingById(dbId);
            if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("ok", false, "message", "Authentication required"));
            if (existing.isEmpty()) return ResponseEntity.notFound().build();
            if (!isAdmin(principal)) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("ok", false, "message", "Only admins can edit bookings"));
            Booking updatedBooking = bookingService.updateBooking(dbId, bookingDetails);
            Map<String, Object> response = new HashMap<>();
            response.put("ok", true);
            response.put("message", "Booking updated successfully");
            response.put("booking", updatedBooking);
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            Map<String, Object> response = new HashMap<>();
            response.put("ok", false);
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
        }
    }

    // DELETE - DELETE /api/bookings/:id
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteBooking(@PathVariable String id, Principal principal) {
        try {
            Long dbId = parseId(id);
            Optional<Booking> existing = bookingService.getBookingById(dbId);
            if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("ok", false, "message", "Authentication required"));
            if (existing.isEmpty()) return ResponseEntity.notFound().build();
            if (!canManage(existing.get(), principal)) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("ok", false, "message", "Access denied"));
            bookingService.deleteBooking(dbId);
            Map<String, Object> response = new HashMap<>();
            response.put("ok", true);
            response.put("message", "Booking deleted successfully");
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            Map<String, Object> response = new HashMap<>();
            response.put("ok", false);
            response.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
        }
    }

    private Long parseId(String idStr) {
        if (idStr.startsWith("BK")) {
            return bookingService.getBookingByPnr(idStr)
                .map(Booking::getId)
                .orElseThrow(() -> new RuntimeException("Booking not found with pnr " + idStr));
        }
        return Long.parseLong(idStr);
    }

    private boolean canManage(Booking booking, Principal principal) {
        if (isAdmin(principal)) return true;
        Long callerId = userRepository.findByEmail(principal.getName()).map(user -> user.getId()).orElse(null);
        return callerId != null && callerId.equals(booking.getUserId());
    }

    private boolean isAdmin(Principal principal) {
        return userRepository.findByEmail(principal.getName())
                .map(user -> "ADMIN".equalsIgnoreCase(user.getRole())).orElse(false);
    }

    private Map<String, Object> bookingView(Booking booking) {
        Map<String, Object> view = new HashMap<>();
        view.put("id", booking.getId());
        view.put("dbId", booking.getId());
        view.put("pnr", booking.getPnr());
        view.put("flightId", booking.getFlightId());
        view.put("travelDate", booking.getTravelDate());
        view.put("passengerName", booking.getPassengerName());
        view.put("passengerCount", booking.getTravelers());
        view.put("seatNumbers", booking.getSeatNumbers());
        view.put("totalPrice", booking.getTotalPrice());
        view.put("status", booking.getStatus());
        view.put("contactEmail", booking.getContactEmail());
        view.put("createdAt", booking.getCreatedAt() == null ? null : booking.getCreatedAt().toString());
        flightRepository.findById(booking.getFlightId()).ifPresent(flight -> {
            view.put("flightNumber", flight.getFlightNumber());
            view.put("airline", flight.getAirline());
            view.put("origin", flight.getOrigin());
            view.put("destination", flight.getDestination());
            view.put("departureDate", flight.getDepartureDate());
            view.put("departureTime", flight.getDepartureTime());
            view.put("arrivalTime", flight.getArrivalTime());
        });
        return view;
    }
}
