package com.codearena.execution;

public record TestCaseResult(
        Long testCaseId,
        boolean passed,
        String input,
        String expectedOutput,
        String actualOutput,
        double executionTime,
        int memoryUsed,
        String status,
        String error,
        boolean isHidden) {}
