package com.codearena.config;

import java.util.Arrays;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Replicates the Python app's effectively-permissive CORS: an explicit
 * origins list PLUS allow_origin_regex="https?://.*", which in practice
 * allows any http/https origin with credentials enabled. Preserved as-is
 * per the migration plan (flagged as a security-hardening candidate for a
 * later, explicitly-requested change -- not fixed silently here).
 */
@Configuration
public class CorsConfig {

    private final AppProperties properties;

    public CorsConfig(AppProperties properties) {
        this.properties = properties;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> origins =
                Arrays.stream(properties.getCors().getOrigins().split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .toList();
        configuration.setAllowedOrigins(origins);
        configuration.setAllowedOriginPatterns(List.of("https://*", "http://*"));
        configuration.setAllowCredentials(true);
        configuration.setAllowedMethods(List.of("*"));
        configuration.setAllowedHeaders(List.of("*"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
