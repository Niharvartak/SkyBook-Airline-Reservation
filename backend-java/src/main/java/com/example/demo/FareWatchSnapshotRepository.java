package com.example.demo;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FareWatchSnapshotRepository extends JpaRepository<FareWatchSnapshot, Long> {
    List<FareWatchSnapshot> findTop10ByFareWatchIdOrderByObservedAtDesc(Long fareWatchId);
}
