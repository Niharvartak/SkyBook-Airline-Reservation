package com.example.demo;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Arrays;

@Entity
@Table(name = "bookings")
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private Long flightId;
    private String travelDate;
    private String passengerName;

    @Column(name = "passengerCount")
    private Integer travelers;

    @Column(name = "seatNumbers", columnDefinition = "longtext")
    private String seatNumbersStr;

    @Transient
    private List<String> seatNumbers;

    private BigDecimal totalPrice;
    private String pnr;
    private String status;
    private String contactEmail;
    private String contactPhone;

    @Column(columnDefinition = "longtext")
    private String passengers;

    private LocalDateTime createdAt;

    @Transient
    private String promoCode;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public Long getFlightId() { return flightId; }
    public void setFlightId(Long flightId) { this.flightId = flightId; }

    public String getTravelDate() { return travelDate; }
    public void setTravelDate(String travelDate) { this.travelDate = travelDate; }

    public String getPassengerName() { return passengerName; }
    public void setPassengerName(String passengerName) { this.passengerName = passengerName; }

    public Integer getTravelers() { return travelers; }
    public void setTravelers(Integer travelers) { this.travelers = travelers; }

    public String getSeatNumbersStr() { return seatNumbersStr; }
    public void setSeatNumbersStr(String seatNumbersStr) { this.seatNumbersStr = seatNumbersStr; }

    public List<String> getSeatNumbers() { 
        if (seatNumbers != null) return seatNumbers;
        if (seatNumbersStr != null && !seatNumbersStr.isEmpty() && !seatNumbersStr.equals("[]")) {
            String clean = seatNumbersStr.replace("[", "").replace("]", "").replace("\"", "");
            return Arrays.asList(clean.split(","));
        }
        return new java.util.ArrayList<>();
    }
    public void setSeatNumbers(List<String> seatNumbers) { 
        this.seatNumbers = seatNumbers; 
        if (seatNumbers != null && !seatNumbers.isEmpty()) {
            this.seatNumbersStr = "[\"" + String.join("\",\"", seatNumbers) + "\"]";
        } else {
            this.seatNumbersStr = "[]";
        }
    }

    public BigDecimal getTotalPrice() { return totalPrice; }
    public void setTotalPrice(BigDecimal totalPrice) { this.totalPrice = totalPrice; }

    public String getPnr() { return pnr; }
    public void setPnr(String pnr) { this.pnr = pnr; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }

    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String contactPhone) { this.contactPhone = contactPhone; }

    public String getPassengers() { return passengers; }
    public void setPassengers(String passengers) { this.passengers = passengers; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public String getPromoCode() { return promoCode; }
    public void setPromoCode(String promoCode) { this.promoCode = promoCode; }
}
