package com.codearena.controller;

import com.codearena.dto.request.CodeRunCaseRequest;
import com.codearena.dto.request.CodeRunRequest;
import com.codearena.dto.response.CodeRunResponse;
import com.codearena.dto.response.CodeSubmitResponse;
import com.codearena.entity.User;
import com.codearena.security.CurrentUserProvider;
import com.codearena.security.RoleGuard;
import com.codearena.service.CodeExecutionService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/code")
public class CodeExecutionController {

    private final CodeExecutionService codeExecutionService;
    private final CurrentUserProvider currentUserProvider;
    private final RoleGuard roleGuard;

    public CodeExecutionController(
            CodeExecutionService codeExecutionService, CurrentUserProvider currentUserProvider, RoleGuard roleGuard) {
        this.codeExecutionService = codeExecutionService;
        this.currentUserProvider = currentUserProvider;
        this.roleGuard = roleGuard;
    }

    /** Public -- no auth, unlike every other endpoint in this controller. */
    @GetMapping("/compiler/status")
    public Map<String, Object> compilerStatus() {
        return codeExecutionService.getCompilerStatus();
    }

    @PostMapping("/run-case")
    public CodeRunResponse runCase(@Valid @RequestBody CodeRunCaseRequest request) {
        User student = roleGuard.requireStudent(currentUserProvider.get());
        return codeExecutionService.runCase(student.getId(), request);
    }

    @PostMapping("/run")
    public CodeRunResponse run(@Valid @RequestBody CodeRunRequest request) {
        User student = roleGuard.requireStudent(currentUserProvider.get());
        return codeExecutionService.run(student.getId(), request);
    }

    @PostMapping("/submit")
    public CodeSubmitResponse submit(@Valid @RequestBody CodeRunRequest request) {
        User student = roleGuard.requireStudent(currentUserProvider.get());
        return codeExecutionService.submit(student.getId(), request);
    }
}
