package com.example.demo;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "fare_watch_snapshots")
public class FareWatchSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "fare_watch_id", nullable = false)
    private Long fareWatchId;

    @Column(name = "observed_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal observedPrice;

    @Column(name = "observed_at", nullable = false)
    private LocalDateTime observedAt;

    public Long getId() { return id; }
    public Long getFareWatchId() { return fareWatchId; }
    public void setFareWatchId(Long fareWatchId) { this.fareWatchId = fareWatchId; }
    public BigDecimal getObservedPrice() { return observedPrice; }
    public void setObservedPrice(BigDecimal observedPrice) { this.observedPrice = observedPrice; }
    public LocalDateTime getObservedAt() { return observedAt; }
    public void setObservedAt(LocalDateTime observedAt) { this.observedAt = observedAt; }
}
