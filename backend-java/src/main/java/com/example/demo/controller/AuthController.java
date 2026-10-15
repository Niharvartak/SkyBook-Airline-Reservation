package com.example.demo.controller;

import com.example.demo.User;
import com.example.demo.UserRepository;
import com.example.demo.security.JwtUtil;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final UserDetailsService userDetailsService;
    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthController(AuthenticationManager authenticationManager,
                          UserDetailsService userDetailsService,
                          JwtUtil jwtUtil,
                          UserRepository userRepository,
                          PasswordEncoder passwordEncoder) {
        this.authenticationManager = authenticationManager;
        this.userDetailsService = userDetailsService;
        this.jwtUtil = jwtUtil;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, String> payload) {
        String name = payload.get("name");
        String email = payload.get("email");
        String password = payload.get("password");

        Map<String, Object> response = new HashMap<>();

        if (name == null || name.isBlank() || email == null || email.isBlank() || password == null || password.isBlank()) {
            response.put("ok", false);
            response.put("message", "Name, email, and password are required");
            return ResponseEntity.badRequest().body(response);
        }

        if (password.length() < 6) {
            response.put("ok", false);
            response.put("message", "Password must be at least 6 characters");
            return ResponseEntity.badRequest().body(response);
        }

        if (userRepository.existsByEmail(email.trim().toLowerCase())) {
            response.put("ok", false);
            response.put("message", "Email is already registered");
            return ResponseEntity.status(HttpStatus.CONFLICT).body(response);
        }

        User newUser = new User();
        newUser.setName(name.trim());
        newUser.setEmail(email.trim().toLowerCase());
        newUser.setPassword(passwordEncoder.encode(password));
        // Public registration always creates USER role — never admin
        newUser.setRole("USER");

        userRepository.save(newUser);

        response.put("ok", true);
        response.put("message", "User registered successfully");
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> payload) {
        String email = payload.get("email");
        String password = payload.get("password");

        Map<String, Object> response = new HashMap<>();

        if (email == null || email.isBlank() || password == null || password.isBlank()) {
            response.put("ok", false);
            response.put("message", "Email and password are required");
            return ResponseEntity.badRequest().body(response);
        }

        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email.trim().toLowerCase(), password));
        } catch (AuthenticationException e) {
            response.put("ok", false);
            response.put("message", "Invalid email or password");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
        }

        // Load user to get role
        Optional<User> userOpt = userRepository.findByEmail(email.trim().toLowerCase());
        if (userOpt.isEmpty()) {
            response.put("ok", false);
            response.put("message", "User not found");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
        }

        User user = userOpt.get();
        final String jwt = jwtUtil.generateToken(user.getEmail(), user.getRole());

        // Build user info to return to frontend (no password)
        Map<String, Object> userInfo = new HashMap<>();
        userInfo.put("id", user.getId());
        userInfo.put("name", user.getName());
        userInfo.put("email", user.getEmail());
        userInfo.put("role", user.getRole());

        response.put("ok", true);
        response.put("message", "Login successful");
        response.put("token", jwt);
        response.put("user", userInfo);
        return ResponseEntity.ok(response);
    }

    /**
     * Protected profile endpoint — requires valid JWT Bearer token.
     */
    @GetMapping("/profile")
    public ResponseEntity<Map<String, Object>> profile(java.security.Principal principal) {
        Map<String, Object> response = new HashMap<>();

        if (principal == null) {
            response.put("ok", false);
            response.put("message", "Unauthorized. Invalid or missing JWT.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(response);
        }

        String email = principal.getName();
        Optional<User> userOpt = userRepository.findByEmail(email);

        if (userOpt.isPresent()) {
            User user = userOpt.get();
            Map<String, Object> userData = new HashMap<>();
            userData.put("id", user.getId());
            userData.put("name", user.getName());
            userData.put("email", user.getEmail());
            userData.put("role", user.getRole());

            response.put("ok", true);
            response.put("user", userData);
            return ResponseEntity.ok(response);
        } else {
            response.put("ok", false);
            response.put("message", "User not found");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(response);
        }
    }

    /**
     * Compatibility endpoint: some legacy Node.js callers hit /api/login.
     * This delegates to the same login logic.
     */
    @PostMapping("/api/login")
    public ResponseEntity<Map<String, Object>> legacyLogin(@RequestBody Map<String, String> payload) {
        return login(payload);
    }
}
