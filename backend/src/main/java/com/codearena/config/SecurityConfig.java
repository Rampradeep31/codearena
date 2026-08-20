package com.codearena.config;

import com.codearena.repository.UserRepository;
import com.codearena.security.JwtAuthenticationFilter;
import com.codearena.security.JwtService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Authorization (role checks) is deliberately NOT done via Spring
 * Security's own mechanism here -- everything is permitAll() at this
 * layer, and JwtAuthenticationFilter + RoleGuard handle authentication and
 * authorization explicitly so the exact Python error bodies/status codes
 * are reproducible without fighting AccessDeniedHandler defaults.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    // Matches Python bcrypt.gensalt()'s implicit cost-12 default so
    // existing $2b$12$... hashes in the DB stay verifiable.
    private static final int BCRYPT_STRENGTH = 12;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(BCRYPT_STRENGTH);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http, JwtService jwtService, UserRepository userRepository, ObjectMapper objectMapper)
            throws Exception {
        http.csrf(csrf -> csrf.disable())
                .cors(cors -> {})
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .addFilterBefore(
                        new JwtAuthenticationFilter(jwtService, userRepository, objectMapper),
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
