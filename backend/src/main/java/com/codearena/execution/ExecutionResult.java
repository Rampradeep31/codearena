package com.codearena.execution;

/**
 * Judge0-compatible result shape, mirroring the dict returned by both
 * docker_executor.py and local_executor.py in the Python app.
 */
public record ExecutionResult(
        String status,
        String statusDescription,
        String output,
        String stderr,
        String error,
        double executionTime,
        int memoryUsed,
        int exitCode,
        String containerId,
        String compiler) {

    public static final String ACCEPTED = "accepted";
    public static final String WRONG_ANSWER = "wrong_answer";
    public static final String COMPILATION_ERROR = "compilation_error";
    public static final String COMPILER_NOT_INSTALLED = "compiler_not_installed";
    public static final String TIME_LIMIT_EXCEEDED = "time_limit_exceeded";
    public static final String RUNTIME_ERROR = "runtime_error";
    public static final String INTERNAL_ERROR = "internal_error";
}
