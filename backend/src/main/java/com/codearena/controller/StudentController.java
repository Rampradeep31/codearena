package com.codearena.controller;

import com.codearena.dto.request.CodeSaveRequest;
import com.codearena.dto.request.ViolationCreate;
import com.codearena.dto.response.AttemptOut;
import com.codearena.dto.response.UserOut;
import com.codearena.dto.response.ViolationRecorded;
import com.codearena.entity.User;
import com.codearena.security.CurrentUserProvider;
import com.codearena.security.RoleGuard;
import com.codearena.service.AttemptLifecycleService;
import com.codearena.service.StudentDashboardService;
import com.codearena.service.ViolationService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/student")
public class StudentController {

    private final CurrentUserProvider currentUserProvider;
    private final RoleGuard roleGuard;
    private final AttemptLifecycleService attemptLifecycleService;
    private final StudentDashboardService studentDashboardService;
    private final ViolationService violationService;

    public StudentController(
            CurrentUserProvider currentUserProvider,
            RoleGuard roleGuard,
            AttemptLifecycleService attemptLifecycleService,
            StudentDashboardService studentDashboardService,
            ViolationService violationService) {
        this.currentUserProvider = currentUserProvider;
        this.roleGuard = roleGuard;
        this.attemptLifecycleService = attemptLifecycleService;
        this.studentDashboardService = studentDashboardService;
        this.violationService = violationService;
    }

    private User student() {
        return roleGuard.requireStudent(currentUserProvider.get());
    }

    @GetMapping("/profile")
    public UserOut profile() {
        User user = student();
        return new UserOut(
                user.getId(),
                user.getEmail(),
                user.getRegisterNumber(),
                user.getName(),
                "student",
                user.getDepartment(),
                user.getYear(),
                user.getSection(),
                user.getStatus().dbValue());
    }

    @GetMapping("/tests")
    public Map<String, Object> tests() {
        return studentDashboardService.getStudentTests(student());
    }

    @PostMapping("/tests/{testId}/start")
    public AttemptOut startTest(@PathVariable Long testId) {
        User user = student();
        return attemptLifecycleService.startTest(testId, user.getId());
    }

    @GetMapping("/attempts/{attemptId}")
    public AttemptOut getAttempt(@PathVariable Long attemptId) {
        User user = student();
        return attemptLifecycleService.getAttempt(attemptId, user.getId());
    }

    @GetMapping("/attempts/{attemptId}/questions")
    public Object getAttemptQuestions(@PathVariable Long attemptId) {
        User user = student();
        return attemptLifecycleService.getAttemptQuestions(attemptId, user.getId());
    }

    @PutMapping("/attempts/{attemptId}/code")
    public Map<String, Object> saveCode(@PathVariable Long attemptId, @Valid @RequestBody CodeSaveRequest request) {
        User user = student();
        return attemptLifecycleService.saveCode(attemptId, user.getId(), request);
    }

    @PostMapping("/attempts/{attemptId}/violations")
    public ViolationRecorded recordViolation(@PathVariable Long attemptId, @Valid @RequestBody ViolationCreate request) {
        User user = student();
        return violationService.recordViolation(attemptId, user.getId(), request);
    }

    @PostMapping("/attempts/{attemptId}/finish")
    public Map<String, Object> finish(@PathVariable Long attemptId) {
        User user = student();
        return attemptLifecycleService.finishTest(attemptId, user.getId());
    }
}
