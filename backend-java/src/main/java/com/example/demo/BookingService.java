package com.example.demo;

import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;
import java.math.BigDecimal;

@Service
public class BookingService {

    private final BookingRepository bookingRepository;
    private final FlightRepository flightRepository;
    private final JdbcTemplate jdbcTemplate;

    public BookingService(BookingRepository bookingRepository, FlightRepository flightRepository, JdbcTemplate jdbcTemplate) {
        this.bookingRepository = bookingRepository;
        this.flightRepository = flightRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Booking> getAllBookings() {
        return bookingRepository.findAll();
    }

    public List<Booking> getBookingsByUserId(Long userId) {
        return bookingRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    public Optional<Booking> getBookingById(Long id) {
        return bookingRepository.findById(id);
    }

    public Optional<Booking> getBookingByPnr(String pnr) {
        return bookingRepository.findByPnr(pnr);
    }

    @Transactional
    public Booking createBooking(Booking booking) {
        if (booking.getFlightId() == null) {
            throw new IllegalArgumentException("A flight is required.");
        }
        Flight flight = flightRepository.findById(booking.getFlightId())
                .filter(Flight::isActive)
                .orElseThrow(() -> new IllegalArgumentException("Active flight not found."));
        int travelers = booking.getTravelers() == null ? 1 : booking.getTravelers();
        if (travelers < 1 || travelers > 9) {
            throw new IllegalArgumentException("Traveler count must be between 1 and 9.");
        }
        booking.setTravelers(travelers);
        BigDecimal totalPrice = flight.getPrice().multiply(BigDecimal.valueOf(travelers));
        String promoCode = booking.getPromoCode() == null ? "" : booking.getPromoCode().trim().toUpperCase();
        boolean international = (flight.getOrigin() + " " + flight.getDestination()).toUpperCase().contains("DXB")
                || (flight.getOrigin() + " " + flight.getDestination()).toUpperCase().contains("DUBAI");
        if ("FLYINDIA".equals(promoCode) && !international) {
            totalPrice = totalPrice.multiply(new BigDecimal("0.70")).setScale(0, java.math.RoundingMode.HALF_UP);
        } else if ("WELCOME".equals(promoCode)) {
            totalPrice = totalPrice.subtract(new BigDecimal("1000")).max(BigDecimal.ZERO);
        } else if ("WORLD20".equals(promoCode) && international) {
            totalPrice = totalPrice.multiply(new BigDecimal("0.80")).setScale(0, java.math.RoundingMode.HALF_UP);
        }
        booking.setTotalPrice(totalPrice);
        if (booking.getPnr() == null || booking.getPnr().isEmpty()) {
            booking.setPnr("BK" + System.currentTimeMillis());
        }
        booking.setCreatedAt(LocalDateTime.now());
        booking.setStatus("CONFIRMED");
        if (booking.getPassengers() == null) {
            booking.setPassengers("[]");
        }
        List<String> seats = booking.getSeatNumbers();
        if (seats == null || seats.size() != travelers || seats.stream().distinct().count() != travelers) {
            throw new IllegalArgumentException("Select one unique seat for each traveler.");
        }
        booking.setSeatNumbers(seats);
        Booking saved = bookingRepository.saveAndFlush(booking);
        for (String seatNumber : seats) {
            List<Long> matchingSeatIds = jdbcTemplate.query(
                    "SELECT id FROM seats WHERE flightId = ? AND travelDate = ? AND seatNumber = ? AND status = 'available' FOR UPDATE",
                    (rs, rowNum) -> rs.getLong("id"), saved.getFlightId(), saved.getTravelDate(), seatNumber);
            if (matchingSeatIds.size() != 1) {
                throw new IllegalArgumentException("Seat " + seatNumber + " is no longer available.");
            }
            int updated = jdbcTemplate.update(
                    "UPDATE seats SET status = 'booked', bookingId = ? WHERE id = ? AND status = 'available'",
                    saved.getId(), matchingSeatIds.get(0));
            if (updated != 1) throw new IllegalArgumentException("Seat " + seatNumber + " is no longer available.");
        }
        return saved;
    }

    public Booking updateBooking(Long id, Booking updatedBooking) {
        return bookingRepository.findById(id).map(existingBooking -> {
            if (updatedBooking.getFlightId() != null) existingBooking.setFlightId(updatedBooking.getFlightId());
            if (updatedBooking.getTravelDate() != null) existingBooking.setTravelDate(updatedBooking.getTravelDate());
            if (updatedBooking.getPassengerName() != null) existingBooking.setPassengerName(updatedBooking.getPassengerName());
            if (updatedBooking.getContactEmail() != null) existingBooking.setContactEmail(updatedBooking.getContactEmail());
            if (updatedBooking.getContactPhone() != null) existingBooking.setContactPhone(updatedBooking.getContactPhone());
            if (updatedBooking.getTravelers() != null) existingBooking.setTravelers(updatedBooking.getTravelers());
            if (updatedBooking.getStatus() != null) existingBooking.setStatus(updatedBooking.getStatus());
            if (updatedBooking.getSeatNumbers() != null) {
                existingBooking.setSeatNumbers(updatedBooking.getSeatNumbers());
            }
            return bookingRepository.save(existingBooking);
        }).orElseThrow(() -> new RuntimeException("Booking not found with id " + id));
    }

    @Transactional
    public void deleteBooking(Long id) {
        if (!bookingRepository.existsById(id)) {
            throw new RuntimeException("Booking not found with id " + id);
        }
        releaseSeats(id);
        bookingRepository.deleteById(id);
    }

    @Transactional
    public Booking cancelBooking(Long id) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Booking not found with id " + id));
        if (!"CANCELLED".equalsIgnoreCase(booking.getStatus())) {
            booking.setStatus("CANCELLED");
            releaseSeats(id);
        }
        return bookingRepository.save(booking);
    }

    private void releaseSeats(Long bookingId) {
        jdbcTemplate.update(
                "UPDATE seats SET status = 'available', bookingId = NULL WHERE bookingId = ?",
                bookingId);
    }
}
