package com.example.demo;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "flights")
public class Flight {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "flightNumber", nullable = false)
    private String flightNumber;

    @Column(nullable = false)
    private String airline;

    @Column(nullable = false)
    private String origin;

    @Column(nullable = false)
    private String destination;

    @Column(name = "departureDate", nullable = false)
    private LocalDate departureDate;

    @Column(name = "departureTime")
    private String departureTime;

    @Column(name = "arrivalTime")
    private String arrivalTime;

    @Column(nullable = false)
    private BigDecimal price;

    @Column
    private String status;

    @Column(name = "isActive", nullable = false)
    private boolean active = true;

    // Existing legacy columns are required on INSERT. Do not change the schema.
    @Column(name = "is_active", nullable = false, updatable = false)
    private boolean legacyActive = true;

    @Column(name = "available_seats", nullable = false)
    private Integer availableSeats = 0;

    @Transient
    private java.util.List<java.util.Map<String, Object>> seats = new java.util.ArrayList<>();

    // Default constructor
    public Flight() {
    }

    // Getters and Setters

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getFlightNumber() {
        return flightNumber;
    }

    public void setFlightNumber(String flightNumber) {
        this.flightNumber = flightNumber;
    }

    public String getAirline() {
        return airline;
    }

    public void setAirline(String airline) {
        this.airline = airline;
    }

    public String getOrigin() {
        return origin;
    }

    public void setOrigin(String origin) {
        this.origin = origin;
    }

    public String getDestination() {
        return destination;
    }

    public void setDestination(String destination) {
        this.destination = destination;
    }

    public String getDepartureDate() {
        return departureDate == null ? null : departureDate.toString();
    }

    public void setDepartureDate(String departureDate) {
        this.departureDate = departureDate == null ? null : LocalDate.parse(departureDate);
    }

    public String getDepartureTime() {
        return departureTime;
    }

    public void setDepartureTime(String departureTime) {
        this.departureTime = departureTime;
    }

    public String getArrivalTime() {
        return arrivalTime;
    }

    public void setArrivalTime(String arrivalTime) {
        this.arrivalTime = arrivalTime;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public Integer getAvailableSeats() {
        return availableSeats;
    }

    public void setAvailableSeats(Integer availableSeats) {
        this.availableSeats = availableSeats;
    }

    public java.util.List<java.util.Map<String, Object>> getSeats() {
        return seats;
    }

    public void setSeats(java.util.List<java.util.Map<String, Object>> seats) {
        this.seats = seats;
    }
}