package com.codearena.security;

import com.codearena.entity.User;
import com.codearena.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Establishes WHO the caller is (token presence/validity, sub claim, user
 * existence, active status) -- the first 5 rows of the Python auth-failure
 * matrix. Role checks ("Student/Admin access required") are deliberately
 * NOT done here; they happen via RoleGuard inside controllers/services so
 * their exceptions flow through the normal @RestControllerAdvice pipeline.
 *
 * Writes its own JSON error responses directly (filters run before the
 * DispatcherServlet, so @RestControllerAdvice cannot catch exceptions
 * thrown from here).
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Set<String> PUBLIC_PATHS =
            Set.of("/health", "/auth/login", "/auth/student-entry", "/code/compiler/status");

    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository, ObjectMapper objectMapper) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return PUBLIC_PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        String token = extractToken(header);

        if (token == null || token.isBlank()) {
            writeError(response, HttpStatus.UNAUTHORIZED, "Authentication required. Please log in again.", true);
            return;
        }

        Claims claims;
        try {
            claims = jwtService.parseClaims(token);
        } catch (JwtService.JwtAuthException e) {
            writeError(response, HttpStatus.UNAUTHORIZED, e.getMessage(), true);
            return;
        }

        String sub = claims.getSubject();
        if (sub == null) {
            writeError(response, HttpStatus.UNAUTHORIZED, "Session expired. Please log in again.", true);
            return;
        }

        Long userId;
        try {
            userId = Long.parseLong(sub);
        } catch (NumberFormatException e) {
            writeError(response, HttpStatus.UNAUTHORIZED, "Invalid authentication token. Please log in again.", true);
            return;
        }

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            writeError(response, HttpStatus.UNAUTHORIZED, "Account not found. Please log in again.", true);
            return;
        }

        User user = userOpt.get();
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            writeError(response, HttpStatus.FORBIDDEN, "Account is deactivated", false);
            return;
        }

        var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
        var authentication = new UsernamePasswordAuthenticationToken(user, null, authorities);
        SecurityContextHolder.getContext().setAuthentication(authentication);

        chain.doFilter(request, response);
    }

    private String extractToken(String header) {
        if (header == null || !header.startsWith("Bearer ")) {
            return null;
        }
        return header.substring(7).trim();
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String detail, boolean withAuthHeader)
            throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        if (withAuthHeader) {
            response.setHeader("WWW-Authenticate", "Bearer");
        }
        objectMapper.writeValue(response.getWriter(), Map.of("detail", detail));
    }
}
