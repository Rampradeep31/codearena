package com.codearena.controller.admin;

import com.codearena.dto.response.DashboardData;
import com.codearena.security.CurrentUserProvider;
import com.codearena.security.RoleGuard;
import com.codearena.service.AdminDashboardService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/dashboard")
public class AdminDashboardController {

    private final AdminDashboardService service;
    private final CurrentUserProvider currentUserProvider;
    private final RoleGuard roleGuard;

    public AdminDashboardController(AdminDashboardService service, CurrentUserProvider currentUserProvider, RoleGuard roleGuard) {
        this.service = service;
        this.currentUserProvider = currentUserProvider;
        this.roleGuard = roleGuard;
    }

    @GetMapping
    public DashboardData dashboard() {
        roleGuard.requireAdmin(currentUserProvider.get());
        return service.getDashboard();
    }
}
