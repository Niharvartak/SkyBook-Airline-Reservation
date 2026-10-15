package com.example.demo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.time.LocalDateTime;

@Repository
public interface BookingRepository extends JpaRepository<Booking, Long> {

    java.util.Optional<Booking> findByPnr(String pnr);

    List<Booking> findByUserIdOrderByCreatedAtDesc(Long userId);

    // Count bookings by status
    @Query("SELECT b.status, COUNT(b) FROM Booking b GROUP BY b.status")
    List<Object[]> countByStatus();

    // Total revenue from confirmed bookings
    @Query("SELECT COALESCE(SUM(b.totalPrice), 0) FROM Booking b WHERE b.status = 'CONFIRMED'")
    java.math.BigDecimal totalRevenue();

    // Total cancellations
    @Query("SELECT COUNT(b) FROM Booking b WHERE b.status = 'CANCELLED'")
    long countCancellations();

    // Recent bookings for admin (last N)
    @Query("SELECT b FROM Booking b ORDER BY b.createdAt DESC")
    List<Booking> findRecentBookings(org.springframework.data.domain.Pageable pageable);

    // Booking trend: count per day
    @Query(value = "SELECT DATE(createdAt) as day, COUNT(*) as cnt FROM bookings GROUP BY DATE(createdAt) ORDER BY day DESC LIMIT 30", nativeQuery = true)
    List<Object[]> bookingTrendPerDay();

    // Revenue trend: sum per day
    @Query(value = "SELECT DATE(createdAt) as day, COALESCE(SUM(totalPrice),0) as revenue FROM bookings WHERE status='CONFIRMED' GROUP BY DATE(createdAt) ORDER BY day DESC LIMIT 30", nativeQuery = true)
    List<Object[]> revenueTrendPerDay();

    // Popular destinations: most booked destination
    @Query(value = "SELECT b.flightId, COUNT(*) as cnt FROM bookings b GROUP BY b.flightId ORDER BY cnt DESC LIMIT 10", nativeQuery = true)
    List<Object[]> popularFlightIds();

    @Query(value = "SELECT f.destination, COUNT(*) as cnt FROM bookings b JOIN flights f ON f.id = b.flightId GROUP BY f.destination ORDER BY cnt DESC LIMIT 10", nativeQuery = true)
    List<Object[]> popularDestinations();

    @Query(value = "SELECT COUNT(*) FROM bookings WHERE createdAt >= :start AND createdAt < :end", nativeQuery = true)
    long countCreatedBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query(value = "SELECT COALESCE(SUM(totalPrice), 0) FROM bookings WHERE status = 'CONFIRMED' AND createdAt >= :start AND createdAt < :end", nativeQuery = true)
    java.math.BigDecimal revenueBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query(value = "SELECT COUNT(*) FROM bookings WHERE status = 'CANCELLED' AND createdAt >= :start AND createdAt < :end", nativeQuery = true)
    long countCancellationsBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query(value = "SELECT status, COUNT(*) FROM bookings WHERE createdAt >= :start AND createdAt < :end GROUP BY status", nativeQuery = true)
    List<Object[]> countStatusesBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query(value = "SELECT DATE(createdAt) as day, COUNT(*) as cnt FROM bookings WHERE createdAt >= :start AND createdAt < :end GROUP BY DATE(createdAt) ORDER BY day", nativeQuery = true)
    List<Object[]> bookingTrendBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query(value = "SELECT DATE(createdAt) as day, COALESCE(SUM(totalPrice), 0) as revenue FROM bookings WHERE status = 'CONFIRMED' AND createdAt >= :start AND createdAt < :end GROUP BY DATE(createdAt) ORDER BY day", nativeQuery = true)
    List<Object[]> revenueTrendBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query(value = "SELECT f.destination, COUNT(*) as cnt FROM bookings b JOIN flights f ON f.id = b.flightId WHERE b.createdAt >= :start AND b.createdAt < :end GROUP BY f.destination ORDER BY cnt DESC LIMIT 10", nativeQuery = true)
    List<Object[]> popularDestinationsBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("SELECT b FROM Booking b WHERE b.createdAt >= :start AND b.createdAt < :end ORDER BY b.createdAt DESC")
    List<Booking> findRecentBookingsBetween(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            org.springframework.data.domain.Pageable pageable);

    // User-specific booking count
    long countByUserId(Long userId);
}
