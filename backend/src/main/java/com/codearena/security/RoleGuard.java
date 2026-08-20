package com.codearena.security;

import com.codearena.entity.User;
import com.codearena.entity.enums.Role;
import com.codearena.exception.ApiException;
import org.springframework.stereotype.Component;

/**
 * Explicit role checks (not Spring Security's @PreAuthorize) so the exact
 * detail strings from the Python auth-failure matrix stay direct and don't
 * need reshaping through AccessDeniedHandler machinery.
 */
@Component
public class RoleGuard {

    public User requireAdmin(User user) {
        if (user.getRole() != Role.ADMIN) {
            throw ApiException.forbidden("Admin access required");
        }
        return user;
    }

    public User requireStudent(User user) {
        if (user.getRole() != Role.STUDENT) {
            throw ApiException.forbidden("Student access required");
        }
        return user;
    }
}
