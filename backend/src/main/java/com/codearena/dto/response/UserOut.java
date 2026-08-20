package com.codearena.dto.response;

public record UserOut(
        Long id,
        String email,
        String registerNumber,
        String name,
        String role,
        String department,
        Integer year,
        String section,
        String status) {}
