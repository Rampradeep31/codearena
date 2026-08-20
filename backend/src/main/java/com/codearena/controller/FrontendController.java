package com.codearena.controller;

import com.codearena.config.FrontendDistLocator;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Root route only. Serving everything else (assets + SPA client-route
 * fallback) is handled by SpaWebConfig's resource handler, which never
 * gets a chance to run for "/" since this explicit mapping always wins --
 * so the JSON/HTML branch below is the single source of truth for "/".
 */
@RestController
public class FrontendController {

    private final FrontendDistLocator frontendDistLocator;

    public FrontendController(FrontendDistLocator frontendDistLocator) {
        this.frontendDistLocator = frontendDistLocator;
    }

    @GetMapping("/")
    public ResponseEntity<?> root() throws IOException {
        Path dist = frontendDistLocator.getPath();
        if (dist == null) {
            return ResponseEntity.ok(Map.of("message", "CodeArena API", "version", "1.0.0"));
        }
        byte[] html = Files.readAllBytes(dist.resolve("index.html"));
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).header(HttpHeaders.CACHE_CONTROL, "no-cache").body(html);
    }
}
