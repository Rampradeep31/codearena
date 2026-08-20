package com.codearena;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * Base class for tests that need a real Postgres instance running the
 * ACTUAL production schema (supabase_schema.sql), not Hibernate-generated
 * DDL -- per the migration plan's hard requirement that the schema is
 * DB-owned, never auto-migrated.
 */
@Testcontainers
@TestPropertySource(
        properties = "app.jwt.secret=test-only-secret-CHANGE-IN-PRODUCTION-abcdefghijklmnopqrstuvwxyz0123456789")
public abstract class AbstractIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:17"))
                    .withDatabaseName("codearena_test")
                    .withUsername("test")
                    .withPassword("test")
                    .withInitScript("test-schema-with-roles.sql");

    @DynamicPropertySource
    static void registerDatasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        // Several test classes each boot their own Spring context against
        // this one shared container; keep each context's pool small so
        // they don't collectively exceed the container's connection limit.
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "5");
        registry.add("spring.datasource.hikari.minimum-idle", () -> "1");
    }
}
