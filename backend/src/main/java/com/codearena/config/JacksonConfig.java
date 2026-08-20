package com.codearena.config;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Every Pydantic schema field in the Python app is already snake_case
 * (register_number, is_hidden, expected_output, ...). A blanket naming
 * strategy avoids per-field @JsonProperty drift across dozens of DTO
 * fields while keeping Java field names idiomatic camelCase internally.
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer snakeCaseCustomizer() {
        return builder -> builder.propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
    }
}
