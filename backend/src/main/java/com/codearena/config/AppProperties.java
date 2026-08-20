package com.codearena.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.NestedConfigurationProperty;
import org.springframework.stereotype.Component;

/** Mirrors the Python app's Settings class 1:1 -- see application.yml's app.* tree. */
@Component
@ConfigurationProperties(prefix = "app")
@Getter
@Setter
public class AppProperties {

    @NestedConfigurationProperty
    private Jwt jwt = new Jwt();

    @NestedConfigurationProperty
    private Judge judge = new Judge();

    @NestedConfigurationProperty
    private Violations violations = new Violations();

    @NestedConfigurationProperty
    private Cors cors = new Cors();

    private int autoSaveIntervalSeconds = 15; // unused server-side; kept for parity/documentation
    private int submissionGracePeriodSeconds = 5;

    @Getter
    @Setter
    public static class Jwt {
        private String secret = "";
        private String algorithm = "HS256";
        private int expiryMinutes = 480;
    }

    @Getter
    @Setter
    public static class Judge {
        private String engine = "docker"; // docker | local
        private double codeTimeoutSeconds = 15.0;
        private double timeoutPython = 15.0;
        private double timeoutC = 15.0;
        private double timeoutCpp = 15.0;
        private double timeoutJava = 15.0;
        private int codeMemoryLimitKb = 262144;
        private int maxConcurrentExecutions = 20;
        private int maxProcessesPerSubmission = 64;
        private String imagePython = "python:3.11-slim";
        private String imageJava = "eclipse-temurin:17-jdk-alpine";
        private String imageC = "gcc:13";
        private String imageCpp = "gcc:13";
    }

    @Getter
    @Setter
    public static class Violations {
        private int maxDefault = 3;
        private int maxFaceTurn = 2;
    }

    @Getter
    @Setter
    public static class Cors {
        private String origins = "http://localhost:5173,https://codearena-indol.vercel.app";
    }
}
