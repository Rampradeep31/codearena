package com.codearena.dto.response;

public record TestCaseResultOut(
        Long testCaseId,
        boolean passed,
        String input,
        String expectedOutput,
        String actualOutput,
        double executionTime,
        int memoryUsed,
        String status,
        String error) {}
