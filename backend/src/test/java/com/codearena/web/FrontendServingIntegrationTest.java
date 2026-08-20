package com.codearena.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.codearena.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Verifies the JwtAuthenticationFilter fix that lets non-API paths (root,
 * assets, SPA client routes) through without requiring a bearer token --
 * without this, deploying the frontend build would make every page load
 * 401 instead of serving anything, since a browser navigation can't attach
 * an Authorization header. No frontend build is present in this test
 * environment, so root() falls back to its JSON response (see
 * FrontendController) -- what's under test here is that the request
 * reaches a handler at all instead of being rejected by the JWT filter.
 */
@SpringBootTest
@AutoConfigureMockMvc
class FrontendServingIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void rootPathNeedsNoAuthToken() throws Exception {
        mockMvc.perform(get("/")).andExpect(status().isOk());
    }

    @Test
    void arbitraryNonApiPathIsNotRejectedByTheAuthFilter() throws Exception {
        // Whether this 404s (no frontend build present) or 200s (SPA
        // fallback serves index.html, if a build happens to exist on disk
        // in this environment) depends on local state -- what actually
        // matters is that it's never a 401 from the JWT filter, which
        // would happen if this path were mistaken for an API route.
        int status = mockMvc.perform(get("/some/client/side/route")).andReturn().getResponse().getStatus();
        assertThat(status).isNotEqualTo(401);
    }

    @Test
    void realApiPathStillRequiresAuth() throws Exception {
        mockMvc.perform(get("/admin/dashboard")).andExpect(status().isUnauthorized());
    }
}
