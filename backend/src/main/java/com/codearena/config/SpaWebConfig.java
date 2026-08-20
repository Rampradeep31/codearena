package com.codearena.config;

import java.io.IOException;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the built frontend's static assets and falls back to index.html
 * for any other unmatched GET path (client-side SPA routes like
 * /admin/tests, /login, ...). This resource handler is registered at the
 * lowest handler-mapping priority in Spring MVC, so it never intercepts an
 * actual @GetMapping in one of the API controllers -- those always win for
 * their exact paths first. "/" itself is handled separately by
 * FrontendController, which always wins over this handler too.
 */
@Configuration
public class SpaWebConfig implements WebMvcConfigurer {

    private final FrontendDistLocator frontendDistLocator;

    public SpaWebConfig(FrontendDistLocator frontendDistLocator) {
        this.frontendDistLocator = frontendDistLocator;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        var dist = frontendDistLocator.getPath();
        if (dist == null) {
            return;
        }
        String location = "file:" + dist.toString().replace('\\', '/') + "/";

        registry.addResourceHandler("/**")
                .addResourceLocations(location)
                .resourceChain(true)
                .addResolver(
                        new PathResourceResolver() {
                            @Override
                            protected Resource getResource(String resourcePath, Resource baseLocation) throws IOException {
                                Resource requested = baseLocation.createRelative(resourcePath);
                                if (requested.exists() && requested.isReadable()) {
                                    return requested;
                                }
                                return baseLocation.createRelative("index.html");
                            }
                        });
    }
}
