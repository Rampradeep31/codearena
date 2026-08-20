package com.codearena.execution;

/** Decouples ExecutionService from the JPA TestCase entity. */
public record TestCaseView(Long id, String input, String expectedOutput, boolean isHidden) {}
