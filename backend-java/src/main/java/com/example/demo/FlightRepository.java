package com.example.demo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface FlightRepository extends JpaRepository<Flight, Long> {

    List<Flight> findByActiveTrueAndOriginContainingIgnoreCaseAndDestinationContainingIgnoreCase(
            String origin,
            String destination
    );

    List<Flight> findByActiveTrueAndOriginContainingIgnoreCaseAndDestinationContainingIgnoreCaseAndDepartureDate(
            String origin,
            String destination,
            LocalDate departureDate
    );

    long countByActiveTrue();

    @Query("SELECT f FROM Flight f WHERE f.active = true " +
            "AND REPLACE(REPLACE(REPLACE(UPPER(f.flightNumber), '-', ''), ' ', ''), '_', '') = :normalized " +
            "ORDER BY f.departureDate ASC")
    List<Flight> findActiveByNormalizedFlightNumber(
            @org.springframework.data.repository.query.Param("normalized") String normalized);

    // All active flights ordered by departure date
    @Query("SELECT f FROM Flight f WHERE f.active = true ORDER BY f.departureDate ASC")
    List<Flight> findAllActiveOrderByDate();

    // Find flights matching route (for travel planner and fare watch)
    @Query("SELECT f FROM Flight f WHERE f.active = true AND LOWER(f.origin) LIKE LOWER(CONCAT('%',:origin,'%')) AND LOWER(f.destination) LIKE LOWER(CONCAT('%',:destination,'%')) AND f.departureDate >= :fromDate ORDER BY f.price ASC")
    List<Flight> findByRouteAndDateRange(
            @org.springframework.data.repository.query.Param("origin") String origin,
            @org.springframework.data.repository.query.Param("destination") String destination,
            @org.springframework.data.repository.query.Param("fromDate") LocalDate fromDate
    );

    @Query("SELECT f FROM Flight f WHERE f.active = true AND LOWER(f.origin) LIKE LOWER(CONCAT('%',:origin,'%')) AND LOWER(f.destination) LIKE LOWER(CONCAT('%',:destination,'%')) AND f.departureDate BETWEEN :fromDate AND :toDate ORDER BY f.price ASC")
    List<Flight> findByRouteAndDateRange(
            @org.springframework.data.repository.query.Param("origin") String origin,
            @org.springframework.data.repository.query.Param("destination") String destination,
            @org.springframework.data.repository.query.Param("fromDate") LocalDate fromDate,
            @org.springframework.data.repository.query.Param("toDate") LocalDate toDate
    );

    // Find cheapest active flight for a given route
    @Query("SELECT f FROM Flight f WHERE f.active = true AND LOWER(f.origin) LIKE LOWER(CONCAT('%',:origin,'%')) AND LOWER(f.destination) LIKE LOWER(CONCAT('%',:destination,'%')) ORDER BY f.price ASC")
    List<Flight> findCheapestByRoute(
            @org.springframework.data.repository.query.Param("origin") String origin,
            @org.springframework.data.repository.query.Param("destination") String destination
    );
}