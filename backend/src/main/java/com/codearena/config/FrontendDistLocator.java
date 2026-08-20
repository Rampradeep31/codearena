package com.codearena.config;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Locates the built React frontend, mirroring the same candidate-path
 * search the earlier Python single-service setup used: a Docker image
 * copies the build to "frontend_dist" next to the backend, while a local
 * dev checkout without a build falls back gracefully (see
 * FrontendController's JSON response in that case).
 */
@Slf4j
@Component
public class FrontendDistLocator {

    private final Path resolved;

    public FrontendDistLocator() {
        this.resolved = resolve();
        if (resolved != null) {
            log.info("Serving frontend build from {}", resolved);
        } else {
            log.info("No frontend build found; API-only mode (see FrontendController)");
        }
    }

    public Path getPath() {
        return resolved;
    }

    private Path resolve() {
        String cwd = System.getProperty("user.dir");
        List<Path> candidates =
                List.of(
                        Path.of("/app/frontend_dist"), // Docker image (see Dockerfile)
                        Path.of(cwd, "frontend_dist"), // fallback if run from an image-like layout
                        Path.of(cwd, "..", "frontend", "dist") // local dev: run from backend/, repo root sibling
                        );
        for (Path candidate : candidates) {
            if (Files.isRegularFile(candidate.resolve("index.html"))) {
                return candidate.toAbsolutePath().normalize();
            }
        }
        return null;
    }
}
