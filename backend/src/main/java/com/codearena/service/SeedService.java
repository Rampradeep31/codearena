package com.codearena.service;

import com.codearena.entity.User;
import com.codearena.entity.enums.AccountStatus;
import com.codearena.entity.enums.Role;
import com.codearena.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Ports ensure_admin_user() from the Python app's connection.py, called
 * from the FastAPI lifespan hook on every startup: best-effort, creates
 * the default admin@codearena.com account only if it doesn't already
 * exist.
 */
@Slf4j
@Component
public class SeedService implements ApplicationRunner {

    private static final String ADMIN_EMAIL = "admin@codearena.com";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public SeedService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            if (userRepository.findByEmailOrRegisterNumber(ADMIN_EMAIL, ADMIN_EMAIL).isPresent()) {
                return;
            }
            userRepository.saveAndFlush(
                    User.builder()
                            .email(ADMIN_EMAIL)
                            .name("Admin User")
                            .passwordHash(passwordEncoder.encode("admin123"))
                            .role(Role.ADMIN)
                            .status(AccountStatus.ACTIVE)
                            .isActive(true)
                            .build());
            log.info("[STARTUP] Default admin user ensured ({})", ADMIN_EMAIL);
        } catch (Exception e) {
            log.warn("[STARTUP] ensure_admin_user warning: {}", e.getMessage());
        }
    }
}
