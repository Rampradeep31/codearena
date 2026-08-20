package com.codearena.execution;

import static org.assertj.core.api.Assertions.assertThat;

import com.codearena.AbstractIntegrationTest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Module 5 verification: real "docker run" invocations for the ported
 * judge, per language, against known-good/bad/compile-error snippets.
 * Requires a live Docker daemon -- run manually with -Ddocker.tests=true
 * (skipped by default so the rest of the suite doesn't require Docker).
 */
@SpringBootTest
@EnabledIfSystemProperty(named = "docker.tests", matches = "true")
class DockerExecutionServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private DockerExecutionService dockerExecutionService;

    @Test
    void pythonAcceptedCase() {
        String code = "s = input()\nprint(s[::-1])\n";
        ExecutionResult result = dockerExecutionService.executeAdHoc(code, "python", "hello", null);
        assertThat(result.status()).isEqualTo(ExecutionResult.ACCEPTED);
        assertThat(result.output().strip()).isEqualTo("olleh");
        assertThat(result.memoryUsed()).isZero();
    }

    @Test
    void pythonSyntaxErrorReclassifiedAsCompilationError() {
        String code = "def broken(:\n    pass\n";
        ExecutionResult result = dockerExecutionService.executeAdHoc(code, "python", "", null);
        assertThat(result.status()).isEqualTo(ExecutionResult.COMPILATION_ERROR);
    }

    @Test
    void pythonRuntimeError() {
        String code = "raise ValueError('boom')\n";
        ExecutionResult result = dockerExecutionService.executeAdHoc(code, "python", "", null);
        assertThat(result.status()).isEqualTo(ExecutionResult.RUNTIME_ERROR);
    }

    @Test
    void javaCompileErrorPath() {
        String code = "public class Main { public static void main(String[] a) { this is not java } }";
        ExecutionResult result = dockerExecutionService.executeAdHoc(code, "java", "", null);
        assertThat(result.status()).isEqualTo(ExecutionResult.COMPILATION_ERROR);
    }

    @Test
    void javaAcceptedCase() {
        String code =
                "import java.util.Scanner;\n"
                        + "public class Main {\n"
                        + "  public static void main(String[] args) {\n"
                        + "    Scanner sc = new Scanner(System.in);\n"
                        + "    System.out.println(sc.nextInt() + sc.nextInt());\n"
                        + "  }\n"
                        + "}\n";
        ExecutionResult result = dockerExecutionService.executeAdHoc(code, "java", "3 4", null);
        assertThat(result.status()).isEqualTo(ExecutionResult.ACCEPTED);
        assertThat(result.output().strip()).isEqualTo("7");
    }

    @Test
    void runAgainstTestCasesAppliesLenientComparison() {
        String code = "print('True')\n"; // lenient bool-normalized match against expected "true"
        List<TestCaseResult> results =
                dockerExecutionService.runAgainstTestCases(
                        code, "python", List.of(new TestCaseView(1L, "", "true", false)));
        assertThat(results).hasSize(1);
        assertThat(results.get(0).passed()).isTrue();
    }

    @Test
    void unsupportedLanguageIsCompilationError() {
        ExecutionResult result = dockerExecutionService.executeAdHoc("code", "cobol", "", null);
        assertThat(result.status()).isEqualTo(ExecutionResult.COMPILATION_ERROR);
    }
}
