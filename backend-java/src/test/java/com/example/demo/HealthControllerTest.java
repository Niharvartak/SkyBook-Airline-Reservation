package com.example.demo;

import com.example.demo.controller.HealthController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HealthControllerTest {

    private FlightRepository flightRepository;
    private HealthController controller;

    @BeforeEach
    void setUp() {
        flightRepository = mock(FlightRepository.class);
        controller = new HealthController(flightRepository);
    }

    @Test
    void returnsFlightStatusForValidFlightNumber() {
        Flight flight = new Flight();
        flight.setFlightNumber("SK-101");
        flight.setAirline("SkyBook Airlines");
        flight.setOrigin("Mumbai (BOM)");
        flight.setDestination("Delhi (DEL)");
        flight.setDepartureDate("2026-12-15");
        flight.setDepartureTime("08:00 AM");
        flight.setArrivalTime("10:15 AM");
        flight.setPrice(new BigDecimal("4500.00"));
        flight.setStatus("On Time");

        when(flightRepository.findActiveByNormalizedFlightNumber("SK101")).thenReturn(java.util.List.of(flight));

        ResponseEntity<Map<String, Object>> response = controller.flightStatus("SK-101");

        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals(Boolean.TRUE, response.getBody().get("ok"));

        @SuppressWarnings("unchecked")
        Map<String, Object> flightBody = (Map<String, Object>) response.getBody().get("flight");
        assertEquals("SK-101", flightBody.get("flightNumber"));
        assertEquals("Mumbai (BOM)", flightBody.get("origin"));
        assertEquals("Delhi (DEL)", flightBody.get("destination"));
        assertTrue(flightBody.get("statusSource").toString().contains("not verified"));
        assertNull(flightBody.get("gate"));
    }

    @Test
    void normalizesDigitFlightNumberLookupAndRejectsUnknownFlight() {
        Flight flight = new Flight();
        flight.setFlightNumber("SK-101");
        flight.setAirline("SkyBook Airlines");
        flight.setOrigin("Mumbai (BOM)");
        flight.setDestination("Delhi (DEL)");
        flight.setDepartureDate("2026-12-15");
        flight.setDepartureTime("08:00 AM");
        flight.setArrivalTime("10:15 AM");
        flight.setPrice(new BigDecimal("4500.00"));
        flight.setStatus("On Time");

        when(flightRepository.findActiveByNormalizedFlightNumber("SK101")).thenReturn(java.util.List.of(flight));

        ResponseEntity<Map<String, Object>> validResponse = controller.flightStatus("101");
        assertEquals(200, validResponse.getStatusCode().value());
        assertEquals(200, controller.flightStatus("SK101").getStatusCode().value());

        when(flightRepository.findActiveByNormalizedFlightNumber("INVALID999")).thenReturn(java.util.List.of());

        ResponseEntity<Map<String, Object>> invalidResponse = controller.flightStatus("INVALID999");
        assertEquals(404, invalidResponse.getStatusCode().value());
        assertNotNull(invalidResponse.getBody());
        assertEquals("Flight INVALID999 not found in system.", invalidResponse.getBody().get("message"));

        when(flightRepository.findActiveByNormalizedFlightNumber("SK1010")).thenReturn(java.util.List.of());
        assertEquals(404, controller.flightStatus("SK-1010").getStatusCode().value());
    }
}
