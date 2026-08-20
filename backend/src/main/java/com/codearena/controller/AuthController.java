package com.codearena.controller;

import com.codearena.dto.request.LoginRequest;
import com.codearena.dto.request.StudentEntryRequest;
import com.codearena.dto.response.LoginResponse;
import com.codearena.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/student-entry")
    public LoginResponse studentEntry(@Valid @RequestBody StudentEntryRequest request) {
        return authService.studentEntry(request);
    }
}
