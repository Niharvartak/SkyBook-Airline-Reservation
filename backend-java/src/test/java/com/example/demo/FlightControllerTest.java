package com.example.demo;

import com.example.demo.controller.FlightController;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class FlightControllerTest {

    @Test
    void activeCatalogReturnsFlightsWithoutLoadingSeatInventories() {
        FlightRepository flightRepository = mock(FlightRepository.class);
        FlightSeatReader seatReader = mock(FlightSeatReader.class);
        Flight flight = new Flight();
        flight.setFlightNumber("SK-101");
        when(flightRepository.findAllActiveOrderByDate()).thenReturn(List.of(flight));

        FlightController controller = new FlightController(flightRepository, seatReader);
        Map<String, Object> response = controller.getActiveFlightCatalog();

        assertEquals(List.of(flight), response.get("flights"));
        verify(flightRepository).findAllActiveOrderByDate();
        verifyNoInteractions(seatReader);
    }
}
