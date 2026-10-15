package com.example.demo.controller;

import com.example.demo.Notification;
import com.example.demo.NotificationRepository;
import com.example.demo.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Notification endpoints — authenticated users can view and mark their notifications.
 */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    public NotificationController(NotificationRepository notificationRepository,
                                   UserRepository userRepository) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
    }

    /** GET /api/notifications — Get all notifications for the current user. */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getNotifications(Principal principal) {
        if (principal == null) return unauthorized();
        Long userId = resolveUserId(principal.getName());
        if (userId == null) return userNotFound();

        List<Notification> notifications = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
        long unreadCount = notificationRepository.countByUserIdAndReadFalse(userId);

        List<Map<String, Object>> result = notifications.stream().map(n -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", n.getId());
            map.put("title", n.getTitle());
            map.put("message", n.getMessage());
            map.put("type", n.getType());
            map.put("read", n.isRead());
            map.put("createdAt", n.getCreatedAt() != null ? n.getCreatedAt().toString() : null);
            return map;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "notifications", result,
                "unreadCount", unreadCount));
    }

    /** PUT /api/notifications/:id/read — Mark a notification as read. */
    @PutMapping("/{id}/read")
    public ResponseEntity<Map<String, Object>> markAsRead(@PathVariable Long id, Principal principal) {
        if (principal == null) return unauthorized();
        Long userId = resolveUserId(principal.getName());
        if (userId == null) return userNotFound();

        return notificationRepository.findById(id).map(n -> {
            if (!n.getUserId().equals(userId)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .<Map<String, Object>>body(Map.of("ok", false, "message", "Access denied"));
            }
            n.setRead(true);
            notificationRepository.save(n);
            return ResponseEntity.ok(Map.<String, Object>of("ok", true, "message", "Marked as read"));
        }).orElse(ResponseEntity.notFound().build());
    }

    /** PUT /api/notifications/read-all — Mark all notifications as read. */
    @PutMapping("/read-all")
    public ResponseEntity<Map<String, Object>> markAllAsRead(Principal principal) {
        if (principal == null) return unauthorized();
        Long userId = resolveUserId(principal.getName());
        if (userId == null) return userNotFound();

        List<Notification> unread = notificationRepository.findByUserIdAndReadFalseOrderByCreatedAtDesc(userId);
        for (Notification n : unread) {
            n.setRead(true);
        }
        notificationRepository.saveAll(unread);
        return ResponseEntity.ok(Map.of("ok", true, "message", "All notifications marked as read"));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Long resolveUserId(String email) {
        return userRepository.findByEmail(email).map(u -> u.getId()).orElse(null);
    }

    private ResponseEntity<Map<String, Object>> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("ok", false, "message", "Authentication required"));
    }

    private ResponseEntity<Map<String, Object>> userNotFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("ok", false, "message", "User not found"));
    }
}
