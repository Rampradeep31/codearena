package com.codearena.execution;

import java.util.List;
import java.util.Map;

/**
 * Abstraction over the code-judge engine. The initial implementation
 * (DockerExecutionService) ports the existing self-hosted Docker judge;
 * a future Judge0/RapidAPI implementation can be swapped in later purely
 * via configuration (see ExecutionConfig), without touching any
 * controller or service that depends on this interface.
 */
public interface ExecutionService {

    /** Runs one ad-hoc case with no persistence -- backs /code/run-case. */
    ExecutionResult executeAdHoc(String sourceCode, String language, String stdin, String expectedOutput);

    /** Runs source against a full list of test cases -- backs /code/run and /code/submit. */
    List<TestCaseResult> runAgainstTestCases(String sourceCode, String language, List<TestCaseView> testCases);

    /** Backs GET /code/compiler/status. */
    Map<String, Object> getDiagnostics();
}
