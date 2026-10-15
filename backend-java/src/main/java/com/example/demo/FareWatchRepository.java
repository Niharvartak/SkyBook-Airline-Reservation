package com.example.demo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface FareWatchRepository extends JpaRepository<FareWatch, Long> {

    List<FareWatch> findByUserIdOrderByCreatedAtDesc(Long userId);

    boolean existsByUserIdAndFlightId(Long userId, Long flightId);

    @Query("SELECT fw FROM FareWatch fw WHERE fw.userId = :userId AND fw.flightId = :flightId")
    java.util.Optional<FareWatch> findByUserIdAndFlightId(@Param("userId") Long userId, @Param("flightId") Long flightId);
}
