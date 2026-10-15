package com.example.demo.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.regex.Pattern;

@RestController
public class NewsletterController {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private final JdbcTemplate jdbcTemplate;

    public NewsletterController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostMapping("/api/newsletter")
    public ResponseEntity<Map<String, Object>> subscribe(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.length() > 254 || !EMAIL_PATTERN.matcher(email.trim()).matches()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "ok", false, "message", "Enter a valid email address."));
        }

        String normalizedEmail = email.trim().toLowerCase();
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO newsletter_subscribers (email, created_at) VALUES (?, ?)",
                normalizedEmail, LocalDateTime.now());
        String message = inserted == 0
                ? "This email is already subscribed. Mailing service is not configured; no email was sent."
                : "Your subscription was saved. Mailing service is not configured; no email was sent.";
        return ResponseEntity.ok(Map.of("ok", true, "message", message));
    }
}
