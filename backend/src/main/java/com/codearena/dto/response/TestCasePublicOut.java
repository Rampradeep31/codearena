package com.codearena.dto.response;

/** Never includes hidden test case data -- student-facing only. */
public record TestCasePublicOut(Long id, String input, String expectedOutput) {}
