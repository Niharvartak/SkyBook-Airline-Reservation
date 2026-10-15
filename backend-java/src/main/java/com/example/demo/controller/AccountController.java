package com.example.demo.controller;

import com.example.demo.UserRepository;
import com.example.demo.UserTravelPreference;
import com.example.demo.UserTravelPreferenceRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/account")
public class AccountController {

    private static final List<String> SUPPORTED_PREFERENCES = List.of("morning", "evening");

    private final UserRepository userRepository;
    private final UserTravelPreferenceRepository preferenceRepository;

    public AccountController(
            UserRepository userRepository,
            UserTravelPreferenceRepository preferenceRepository) {
        this.userRepository = userRepository;
        this.preferenceRepository = preferenceRepository;
    }

    @GetMapping("/preferences")
    public ResponseEntity<Map<String, Object>> getPreferences(Principal principal) {
        Long userId = resolveUserId(principal);
        if (userId == null) return ResponseEntity.status(404).body(Map.of("ok", false, "message", "User not found."));
        List<String> preferences = preferenceRepository.findById(userId)
                .map(this::readPreferences)
                .orElse(List.of());
        return ResponseEntity.ok(Map.of("ok", true, "preferences", preferences));
    }

    @PutMapping("/preferences")
    public ResponseEntity<Map<String, Object>> updatePreferences(
            @RequestBody Map<String, Object> payload,
            Principal principal) {
        Long userId = resolveUserId(principal);
        if (userId == null) return ResponseEntity.status(404).body(Map.of("ok", false, "message", "User not found."));
        Object rawPreferences = payload.get("preferences");
        if (!(rawPreferences instanceof List<?> values)
                || values.stream().anyMatch(value -> !(value instanceof String))) {
            return ResponseEntity.badRequest().body(Map.of(
                    "ok", false, "message", "Preferences must be a list of supported values."));
        }
        List<String> preferences = values.stream()
                .map(String.class::cast)
                .map(String::trim)
                .map(String::toLowerCase)
                .distinct()
                .toList();
        if (preferences.stream().anyMatch(value -> !SUPPORTED_PREFERENCES.contains(value))) {
            return ResponseEntity.badRequest().body(Map.of(
                    "ok", false, "message", "Supported preferences are morning and evening departures."));
        }

        UserTravelPreference saved = preferenceRepository.findById(userId).orElseGet(UserTravelPreference::new);
        saved.setUserId(userId);
        saved.setPreferences(String.join(",", preferences));
        saved.setUpdatedAt(LocalDateTime.now());
        preferenceRepository.save(saved);
        return ResponseEntity.ok(Map.of("ok", true, "preferences", preferences, "message", "Travel preferences saved."));
    }

    private Long resolveUserId(Principal principal) {
        if (principal == null) return null;
        return userRepository.findByEmail(principal.getName()).map(user -> user.getId()).orElse(null);
    }

    private List<String> readPreferences(UserTravelPreference preference) {
        if (preference.getPreferences() == null || preference.getPreferences().isBlank()) return List.of();
        return List.of(preference.getPreferences().split(","));
    }
}
