package com.example.demo;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "user_travel_preferences")
public class UserTravelPreference {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "preferences", nullable = false, length = 32)
    private String preferences;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getPreferences() { return preferences; }
    public void setPreferences(String preferences) { this.preferences = preferences; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
