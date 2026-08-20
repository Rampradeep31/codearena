package com.codearena.security;

import com.codearena.entity.User;
import com.codearena.exception.ApiException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/** Reads the User resolved by JwtAuthenticationFilter out of the SecurityContext. */
@Component
public class CurrentUserProvider {

    public User get() {
        Object principal = SecurityContextHolder.getContext().getAuthentication() == null
                ? null
                : SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (!(principal instanceof User user)) {
            throw ApiException.unauthorized("Authentication required. Please log in again.");
        }
        return user;
    }
}
