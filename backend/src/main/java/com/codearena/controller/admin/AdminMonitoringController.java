package com.codearena.controller.admin;

import com.codearena.dto.response.ResultRow;
import com.codearena.dto.response.StudentMonitorRow;
import com.codearena.dto.response.ViolationOut;
import com.codearena.security.CurrentUserProvider;
import com.codearena.security.RoleGuard;
import com.codearena.service.AdminMonitoringService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin")
public class AdminMonitoringController {

    private final AdminMonitoringService service;
    private final CurrentUserProvider currentUserProvider;
    private final RoleGuard roleGuard;

    public AdminMonitoringController(AdminMonitoringService service, CurrentUserProvider currentUserProvider, RoleGuard roleGuard) {
        this.service = service;
        this.currentUserProvider = currentUserProvider;
        this.roleGuard = roleGuard;
    }

    @GetMapping("/tests/{testId}/monitor")
    public List<StudentMonitorRow> monitor(@PathVariable Long testId) {
        roleGuard.requireAdmin(currentUserProvider.get());
        return service.monitorTest(testId);
    }

    @GetMapping("/tests/{testId}/results")
    public List<ResultRow> results(@PathVariable Long testId) {
        roleGuard.requireAdmin(currentUserProvider.get());
        return service.getTestResults(testId);
    }

    @GetMapping("/violations")
    public List<ViolationOut> violations(
            @RequestParam(required = false) Long testId,
            @RequestParam(required = false) Long studentId,
            @RequestParam(required = false) String violationType) {
        roleGuard.requireAdmin(currentUserProvider.get());
        return service.listViolations(testId, studentId, violationType);
    }
}
