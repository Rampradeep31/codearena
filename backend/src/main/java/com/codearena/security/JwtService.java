package com.codearena.security;

import com.codearena.config.AppProperties;
import com.codearena.entity.enums.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

/**
 * HS256 sign/parse. Deliberate deviation from the Python app (approved by
 * the user, see migration plan Context section): JWT_SECRET must be
 * explicitly configured -- this app fails fast at startup rather than
 * replicating Python's random-secret-on-boot fallback.
 *
 * Bad signature and truly-expired tokens map to the SAME "Session expired"
 * outcome (no distinction), matching the Python app's decode_access_token.
 */
@Service
public class JwtService {

    private final AppProperties properties;
    private SecretKey signingKey;

    public JwtService(AppProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void validateSecretConfigured() {
        if (properties.getJwt().getSecret() == null || properties.getJwt().getSecret().isBlank()) {
            throw new IllegalStateException(
                    "JWT_SECRET is not set. Set it explicitly (e.g. via the JWT_SECRET environment "
                            + "variable) before starting the application -- this app does not fall back to a "
                            + "randomly generated secret.");
        }
        this.signingKey = Keys.hmacShaKeyFor(properties.getJwt().getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(Long userId, Role role) {
        Instant now = Instant.now();
        Instant expiry = now.plusSeconds(properties.getJwt().getExpiryMinutes() * 60L);
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("role", role.dbValue())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(signingKey)
                .compact();
    }

    /** Throws JwtAuthException("Session expired...") for both bad signature and expiry -- no distinction. */
    public Claims parseClaims(String token) {
        try {
            return Jwts.parser().verifyWith(signingKey).build().parseSignedClaims(token).getPayload();
        } catch (JwtException | IllegalArgumentException e) {
            throw new JwtAuthException("Session expired. Please log in again.");
        }
    }

    public static class JwtAuthException extends RuntimeException {
        public JwtAuthException(String message) {
            super(message);
        }
    }
}
