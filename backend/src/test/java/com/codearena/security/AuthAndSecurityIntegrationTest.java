package com.codearena.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.codearena.AbstractIntegrationTest;
import com.codearena.entity.User;
import com.codearena.entity.enums.AccountStatus;
import com.codearena.entity.enums.Role;
import com.codearena.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Module 2 verification: /auth/login, /auth/student-entry, and the full
 * 7-row auth-failure matrix (JwtAuthenticationFilter + RoleGuard).
 *
 * The matrix is exercised against "/admin/probe-not-yet-built" -- no admin
 * controller exists until module 3, but the filter runs before routing, so
 * every auth-layer response (rows 1-5) is fully testable now. A valid
 * token that reaches Spring's routing layer (and 404s because no handler
 * exists yet) is treated as proof the auth layer let it through.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AuthAndSecurityIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    private static final SecretKey TEST_KEY =
            Keys.hmacShaKeyFor(
                    "test-only-secret-CHANGE-IN-PRODUCTION-abcdefghijklmnopqrstuvwxyz0123456789"
                            .getBytes(StandardCharsets.UTF_8));

    private String tokenMissingSubClaim() {
        Instant now = Instant.now();
        return Jwts.builder()
                .claim("role", "admin")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(3600)))
                .signWith(TEST_KEY)
                .compact();
    }

    private String tokenWithNonIntegerSub() {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject("not-an-integer")
                .claim("role", "admin")
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(3600)))
                .signWith(TEST_KEY)
                .compact();
    }

    private User createUser(String email, String regNo, String rawPassword, Role role, boolean active) {
        return userRepository.saveAndFlush(
                User.builder()
                        .email(email)
                        .registerNumber(regNo)
                        .name("Test User")
                        .passwordHash(passwordEncoder.encode(rawPassword))
                        .role(role)
                        .status(active ? AccountStatus.ACTIVE : AccountStatus.INACTIVE)
                        .isActive(active)
                        .build());
    }

    // ---- /auth/login ----

    @Test
    void loginSucceedsWithEmailOrRegisterNumber() throws Exception {
        createUser("login1@codearena.com", "LOGIN1", "correct-horse", Role.STUDENT, true);

        mockMvc.perform(
                        post("/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"email\":\"LOGIN1\",\"password\":\"correct-horse\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token_type").value("bearer"))
                .andExpect(jsonPath("$.role").value("student"))
                .andExpect(jsonPath("$.user.register_number").value("LOGIN1"));
    }

    @Test
    void loginFailsForUnknownIdentifier() throws Exception {
        mockMvc.perform(
                        post("/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"email\":\"nobody@nowhere.com\",\"password\":\"x\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("User with this email or register number does not exist"));
    }

    @Test
    void loginFailsForWrongPassword() throws Exception {
        createUser("login2@codearena.com", "LOGIN2", "right-password", Role.STUDENT, true);

        mockMvc.perform(
                        post("/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"email\":\"login2@codearena.com\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid password"));
    }

    @Test
    void loginFailsForDeactivatedAccount() throws Exception {
        createUser("login3@codearena.com", "LOGIN3", "pw", Role.STUDENT, false);

        mockMvc.perform(
                        post("/auth/login")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"email\":\"login3@codearena.com\",\"password\":\"pw\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Account is deactivated"));
    }

    // ---- /auth/student-entry ----

    @Test
    void studentEntryCreatesThenUpsertsOnReEntry() throws Exception {
        mockMvc.perform(
                        post("/auth/student-entry")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"name\":\"Alice\",\"register_number\":\"stu100\",\"year\":\"2nd Year\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("student"))
                .andExpect(jsonPath("$.user.status").value("active"))
                .andExpect(jsonPath("$.user.register_number").value("STU100"))
                .andExpect(jsonPath("$.user.year").value(2));

        // Re-entry with a different name/year upserts the SAME row (no auth
        // required on this endpoint, matching the Python app exactly).
        mockMvc.perform(
                        post("/auth/student-entry")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"name\":\"Alice Updated\",\"register_number\":\"stu100\",\"year\":\"3rd Year\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.name").value("Alice Updated"))
                .andExpect(jsonPath("$.user.year").value(3));

        assertThat(userRepository.findByRegisterNumber("STU100")).isPresent();
        assertThat(userRepository.findByRegisterNumber("STU100").get().getName()).isEqualTo("Alice Updated");
    }

    @Test
    void studentEntryRejectsWhitespaceOnlyName() throws Exception {
        mockMvc.perform(
                        post("/auth/student-entry")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"name\":\"   \",\"register_number\":\"STU200\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Name is required"));
    }

    @Test
    void studentEntryRejectsGenuinelyEmptyRegisterNumberAt422() throws Exception {
        // min_length=1 -> Bean Validation 422, not the service's own 400 check.
        mockMvc.perform(
                        post("/auth/student-entry")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"name\":\"Bob\",\"register_number\":\"\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    // ---- Auth-failure matrix (7 rows) ----

    @Test
    void noTokenReturns401AuthenticationRequired() throws Exception {
        mockMvc.perform(get("/admin/probe-not-yet-built"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Authentication required. Please log in again."))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("WWW-Authenticate", "Bearer"));
    }

    @Test
    void malformedTokenReturns401SessionExpired() throws Exception {
        mockMvc.perform(get("/admin/probe-not-yet-built").header("Authorization", "Bearer not-a-real-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Session expired. Please log in again."));
    }

    @Test
    void tokenMissingSubClaimReturns401SessionExpired() throws Exception {
        mockMvc.perform(get("/admin/probe-not-yet-built").header("Authorization", "Bearer " + tokenMissingSubClaim()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Session expired. Please log in again."));
    }

    @Test
    void tokenWithNonIntegerSubReturns401InvalidToken() throws Exception {
        mockMvc.perform(
                        get("/admin/probe-not-yet-built")
                                .header("Authorization", "Bearer " + tokenWithNonIntegerSub()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Invalid authentication token. Please log in again."));
    }

    @Test
    void tokenForNonExistentUserReturns401AccountNotFound() throws Exception {
        String token = jwtService.generateToken(999_999_999L, Role.ADMIN);
        mockMvc.perform(get("/admin/probe-not-yet-built").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("Account not found. Please log in again."));
    }

    @Test
    void tokenForDeactivatedUserReturns403AccountDeactivated() throws Exception {
        User inactive = createUser("inactive@codearena.com", "INACTIVE1", "pw", Role.ADMIN, false);
        String token = jwtService.generateToken(inactive.getId(), Role.ADMIN);

        mockMvc.perform(get("/admin/probe-not-yet-built").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Account is deactivated"));
    }

    @Test
    void validTokenPassesAuthLayerAndReaches404NotYetBuilt() throws Exception {
        User admin = createUser("validadmin@codearena.com", "VALIDADMIN1", "pw", Role.ADMIN, true);
        String token = jwtService.generateToken(admin.getId(), Role.ADMIN);

        // 404, not 401/403 -- proves the auth layer accepted the token and
        // handed off to routing, which has no matching handler yet.
        mockMvc.perform(get("/admin/probe-not-yet-built").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }
}
