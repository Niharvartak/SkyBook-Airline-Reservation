package com.example.demo.controller;

import com.example.demo.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.Principal;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Fare Watch endpoints — all require authentication.
 * Users can only see/manage their own fare watches.
 */
@RestController
@RequestMapping("/api/fare-watches")
public class FareWatchController {

    private final FareWatchRepository fareWatchRepository;
    private final FlightRepository flightRepository;
    private final UserRepository userRepository;
    private final NotificationRepository notificationRepository;
    private final FareWatchSnapshotRepository snapshotRepository;

    public FareWatchController(FareWatchRepository fareWatchRepository,
                               FlightRepository flightRepository,
                               UserRepository userRepository,
                               NotificationRepository notificationRepository,
                               FareWatchSnapshotRepository snapshotRepository) {
        this.fareWatchRepository = fareWatchRepository;
        this.flightRepository = flightRepository;
        this.userRepository = userRepository;
        this.notificationRepository = notificationRepository;
        this.snapshotRepository = snapshotRepository;
    }

    /**
     * GET /api/fare-watches — List all fare watches for the authenticated user.
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getUserFareWatches(Principal principal) {
        if (principal == null) {
            return unauthorized();
        }
        Long userId = resolveUserId(principal.getName());
        if (userId == null) return userNotFound();

        List<FareWatch> watches = fareWatchRepository.findByUserIdOrderByCreatedAtDesc(userId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (FareWatch fw : watches) {
            result.add(enrichFareWatch(fw));
        }
        return ResponseEntity.ok(Map.of("ok", true, "fareWatches", result));
    }

    /**
     * POST /api/fare-watches — Create a new fare watch for an authenticated user.
     * Body: { flightId, targetPrice? }
     */
    @PostMapping
    @Transactional
    public ResponseEntity<Map<String, Object>> createFareWatch(
            @RequestBody Map<String, Object> payload,
            Principal principal) {
        if (principal == null) {
            return unauthorized();
        }
        Long userId = resolveUserId(principal.getName());
        if (userId == null) return userNotFound();

        Object flightIdObj = payload.get("flightId");
        if (flightIdObj == null) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "flightId is required"));
        }
        Long flightId;
        try {
            flightId = new BigDecimal(flightIdObj.toString()).longValueExact();
        } catch (NumberFormatException | ArithmeticException e) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "flightId must be a whole number"));
        }

        Optional<Flight> flightOpt = flightRepository.findById(flightId);
        if (flightOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("ok", false, "message", "Flight not found"));
        }
        Flight flight = flightOpt.get();
        if (!flight.isActive()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("ok", false, "message", "Inactive flights cannot be watched"));
        }

        // Prevent duplicates for the same user+flight
        if (fareWatchRepository.existsByUserIdAndFlightId(userId, flightId)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("ok", false, "message", "You are already watching this flight"));
        }

        FareWatch fw = new FareWatch();
        fw.setUserId(userId);
        fw.setFlightId(flightId);
        fw.setRouteOrigin(flight.getOrigin());
        fw.setRouteDestination(flight.getDestination());
        fw.setDepartureDate(flight.getDepartureDate());
        fw.setCurrentPrice(flight.getPrice());
        fw.setPreviousPrice(null);
        fw.setPriceChange(BigDecimal.ZERO);
        fw.setAlertTriggered(false);
        fw.setCreatedAt(LocalDateTime.now());
        fw.setUpdatedAt(LocalDateTime.now());

        // Optional target price
        Object targetPriceObj = payload.get("targetPrice");
        if (targetPriceObj != null) {
            try {
                BigDecimal targetPrice = new BigDecimal(targetPriceObj.toString());
                if (targetPrice.signum() <= 0) {
                    return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "Target price must be greater than zero"));
                }
                fw.setTargetPrice(targetPrice);
            } catch (NumberFormatException ignored) {
                return ResponseEntity.badRequest().body(Map.of("ok", false, "message", "Target price must be a valid amount"));
            }
        }

        FareWatch saved = fareWatchRepository.save(fw);
        saveSnapshot(saved, flight.getPrice(), LocalDateTime.now());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("ok", true, "fareWatch", enrichFareWatch(saved), "message", "Fare watch created successfully"));
    }

    /**
     * DELETE /api/fare-watches/:id — Delete a fare watch (only if it belongs to the authenticated user).
     */
    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteFareWatch(
            @PathVariable Long id,
            Principal principal) {
        if (principal == null) {
            return unauthorized();
        }
        Long userId = resolveUserId(principal.getName());
        if (userId == null) return userNotFound();

        Optional<FareWatch> watchOpt = fareWatchRepository.findById(id);
        if (watchOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("ok", false, "message", "Fare watch not found"));
        }
        FareWatch fw = watchOpt.get();
        if (!fw.getUserId().equals(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("ok", false, "message", "Access denied"));
        }

        fareWatchRepository.delete(fw);
        return ResponseEntity.ok(Map.of("ok", true, "message", "Fare watch deleted"));
    }

    /**
     * POST /api/fare-watches/check — Manually trigger a fare check for all of the user's watches.
     * Compares current DB price with stored price and records any change.
     */
    @PostMapping("/check")
    @Transactional
    public ResponseEntity<Map<String, Object>> checkFares(Principal principal) {
        if (principal == null) {
            return unauthorized();
        }
        Long userId = resolveUserId(principal.getName());
        if (userId == null) return userNotFound();

        List<FareWatch> watches = fareWatchRepository.findByUserIdOrderByCreatedAtDesc(userId);
        List<Map<String, Object>> updated = new ArrayList<>();

        for (FareWatch fw : watches) {
            flightRepository.findById(fw.getFlightId()).ifPresent(flight -> {
                fw.setUpdatedAt(LocalDateTime.now());
                BigDecimal latestPrice = flight.getPrice();
                BigDecimal storedPrice = fw.getCurrentPrice();

                boolean priceChanged = storedPrice == null || latestPrice.compareTo(storedPrice) != 0;
                if (priceChanged) {
                    fw.setPreviousPrice(storedPrice);
                    fw.setCurrentPrice(latestPrice);
                    fw.setPriceChange(storedPrice != null ? latestPrice.subtract(storedPrice) : BigDecimal.ZERO);
                    fw.setUpdatedAt(LocalDateTime.now());

                        if (fw.getTargetPrice() == null || latestPrice.compareTo(fw.getTargetPrice()) > 0) {
                        fw.setAlertTriggered(false);
                        }
                        if (fw.getPriceChange() != null && fw.getPriceChange().compareTo(BigDecimal.ZERO) < 0
                            && (fw.getTargetPrice() == null || latestPrice.compareTo(fw.getTargetPrice()) > 0)) {
                        // Price dropped — notify
                        Notification notification = new Notification();
                        notification.setUserId(userId);
                        notification.setTitle("📉 Fare Drop Detected");
                        notification.setMessage(String.format(
                                "Flight %s (%s → %s) price dropped by ₹%s to ₹%s!",
                                flight.getFlightNumber(), flight.getOrigin(), flight.getDestination(),
                                fw.getPriceChange().abs().toPlainString(), latestPrice.toPlainString()));
                        notification.setType("PRICE_DROP");
                        notification.setCreatedAt(LocalDateTime.now());
                        notificationRepository.save(notification);
                    }

                }
                if (fw.getTargetPrice() != null && latestPrice.compareTo(fw.getTargetPrice()) <= 0
                        && !fw.isAlertTriggered()) {
                    fw.setAlertTriggered(true);
                    Notification notification = new Notification();
                    notification.setUserId(userId);
                    notification.setTitle("Fare target reached");
                    notification.setMessage(String.format(
                            "Flight %s (%s to %s) is now %s, at or below your target of %s.",
                            flight.getFlightNumber(), flight.getOrigin(), flight.getDestination(),
                            latestPrice.toPlainString(), fw.getTargetPrice().toPlainString()));
                    notification.setType("FARE_ALERT");
                    notification.setCreatedAt(LocalDateTime.now());
                    notificationRepository.save(notification);
                }
                saveSnapshot(fw, latestPrice, LocalDateTime.now());
                fareWatchRepository.save(fw);
                updated.add(enrichFareWatch(fw));
            });
        }

        return ResponseEntity.ok(Map.of("ok", true, "message",
                String.format("Checked %d fare watch(es)", watches.size()), "fareWatches", updated));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private Map<String, Object> enrichFareWatch(FareWatch fw) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", fw.getId());
        map.put("flightId", fw.getFlightId());
        map.put("routeOrigin", fw.getRouteOrigin());
        map.put("routeDestination", fw.getRouteDestination());
        map.put("departureDate", fw.getDepartureDate());
        map.put("currentPrice", fw.getCurrentPrice());
        map.put("previousPrice", fw.getPreviousPrice());
        map.put("priceChange", fw.getPriceChange());
        map.put("targetPrice", fw.getTargetPrice());
        map.put("alertTriggered", fw.isAlertTriggered());
        map.put("createdAt", fw.getCreatedAt() != null ? fw.getCreatedAt().toString() : null);
        map.put("updatedAt", fw.getUpdatedAt() != null ? fw.getUpdatedAt().toString() : null);
        map.put("snapshots", snapshotRepository.findTop10ByFareWatchIdOrderByObservedAtDesc(fw.getId())
                .stream()
                .map(snapshot -> Map.of(
                        "price", snapshot.getObservedPrice(),
                        "observedAt", snapshot.getObservedAt().toString()))
                .toList());

        // Enrich with flight details
        flightRepository.findById(fw.getFlightId()).ifPresent(f -> {
            map.put("flightNumber", f.getFlightNumber());
            map.put("airline", f.getAirline());
            map.put("departureTime", f.getDepartureTime());
            map.put("arrivalTime", f.getArrivalTime());
        });

        // Determine price trend
        BigDecimal change = fw.getPriceChange();
        if (change == null || change.compareTo(BigDecimal.ZERO) == 0) {
            map.put("trend", "stable");
        } else if (change.compareTo(BigDecimal.ZERO) < 0) {
            map.put("trend", "down");
        } else {
            map.put("trend", "up");
        }
        return map;
    }

    private void saveSnapshot(FareWatch watch, BigDecimal price, LocalDateTime observedAt) {
        FareWatchSnapshot snapshot = new FareWatchSnapshot();
        snapshot.setFareWatchId(watch.getId());
        snapshot.setObservedPrice(price);
        snapshot.setObservedAt(observedAt);
        snapshotRepository.save(snapshot);
    }

    private Long resolveUserId(String email) {
        return userRepository.findByEmail(email).map(u -> u.getId()).orElse(null);
    }

    private ResponseEntity<Map<String, Object>> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("ok", false, "message", "Authentication required"));
    }

    private ResponseEntity<Map<String, Object>> userNotFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("ok", false, "message", "User not found"));
    }
}
