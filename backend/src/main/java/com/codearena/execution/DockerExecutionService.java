package com.codearena.execution;

import com.codearena.config.AppProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/**
 * Direct port of app/services/docker_executor.py: same "docker run" shape,
 * same verdict-mapping priority order, same output/error byte caps.
 * Production judge engine (app.judge.engine=docker, the default).
 */
@Slf4j
@Service
@ConditionalOnProperty(prefix = "app.judge", name = "engine", havingValue = "docker", matchIfMissing = true)
public class DockerExecutionService implements ExecutionService {

    private static final int MAX_OUTPUT_BYTES = 500_000;
    private static final int MAX_ERROR_BYTES = 262_144;
    private static final Pattern PYTHON_SYNTAX_ERROR =
            Pattern.compile("SyntaxError|IndentationError|TabError");

    private record LanguageProfile(String sourceFile, String compileCmd, String runCmd) {}

    private final Map<String, LanguageProfile> profiles =
            Map.of(
                    "python", new LanguageProfile("main.py", null, "python3 main.py"),
                    "java", new LanguageProfile("Main.java", "javac Main.java", "java Main"),
                    "c", new LanguageProfile("main.c", "gcc main.c -o main -O2", "./main"),
                    "cpp", new LanguageProfile("main.cpp", "g++ main.cpp -o main -O2", "./main"));

    private final AppProperties properties;
    private final OutputComparator comparator;
    private final Semaphore semaphore;

    public DockerExecutionService(AppProperties properties, OutputComparator comparator) {
        this.properties = properties;
        this.comparator = comparator;
        this.semaphore = new Semaphore(Math.max(1, properties.getJudge().getMaxConcurrentExecutions()));
    }

    @Override
    public ExecutionResult executeAdHoc(String sourceCode, String language, String stdin, String expectedOutput) {
        return execute(sourceCode, language, stdin);
    }

    @Override
    public List<TestCaseResult> runAgainstTestCases(String sourceCode, String language, List<TestCaseView> testCases) {
        List<TestCaseResult> results = new ArrayList<>();
        for (TestCaseView tc : testCases) {
            ExecutionResult res = execute(sourceCode, language, tc.input());
            String actual = res.output() == null ? "" : res.output().strip();
            String status = res.status();
            boolean passed;
            if (ExecutionResult.ACCEPTED.equals(status)) {
                passed = comparator.compareOutputs(actual, tc.expectedOutput());
                if (!passed) {
                    status = ExecutionResult.WRONG_ANSWER;
                }
            } else {
                passed = false;
            }
            results.add(
                    new TestCaseResult(
                            tc.id(),
                            passed,
                            tc.input(),
                            tc.expectedOutput(),
                            actual,
                            res.executionTime(),
                            res.memoryUsed(),
                            status,
                            res.error(),
                            tc.isHidden()));
        }
        return results;
    }

    @Override
    public Map<String, Object> getDiagnostics() {
        Map<String, Object> diagnostics = new LinkedHashMap<>();
        diagnostics.put("engine", "docker");
        diagnostics.put("available", isDockerAvailable());
        diagnostics.put(
                "images",
                Map.of(
                        "python", properties.getJudge().getImagePython(),
                        "java", properties.getJudge().getImageJava(),
                        "c", properties.getJudge().getImageC(),
                        "cpp", properties.getJudge().getImageCpp()));
        return diagnostics;
    }

    private boolean isDockerAvailable() {
        try {
            Process p = new ProcessBuilder("docker", "info").redirectErrorStream(true).start();
            boolean finished = p.waitFor(5, TimeUnit.SECONDS);
            return finished && p.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    private ExecutionResult execute(String sourceCode, String language, String stdin) {
        String normLang = language == null ? "" : language.toLowerCase().strip();
        LanguageProfile profile = profiles.get(normLang);
        if (profile == null) {
            return buildErrorResult(
                    ExecutionResult.COMPILATION_ERROR,
                    "Compilation Error",
                    "Language '" + language + "' is not supported",
                    1);
        }

        try {
            semaphore.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return buildErrorResult(ExecutionResult.INTERNAL_ERROR, "Internal Error", "Execution interrupted", -1);
        }

        Path workdir = null;
        try {
            workdir = Files.createTempDirectory("codearena-judge-");
            double timeout = properties.getJudge().getCodeTimeoutSeconds();

            Files.writeString(workdir.resolve(profile.sourceFile()), sourceCode == null ? "" : sourceCode);
            Files.writeString(workdir.resolve("input.txt"), stdin == null ? "" : stdin);
            Files.writeString(workdir.resolve("run.sh"), buildRunScript(profile, timeout), StandardOpenOption.CREATE);

            int memMb = Math.max(64, properties.getJudge().getCodeMemoryLimitKb() / 1024);
            List<String> command =
                    List.of(
                            "docker",
                            "run",
                            "--rm",
                            "--network",
                            "none",
                            "--cpus",
                            "0.5",
                            "--memory",
                            memMb + "m",
                            "--pids-limit",
                            String.valueOf(properties.getJudge().getMaxProcessesPerSubmission()),
                            "--ulimit",
                            "nofile=256:256",
                            "-v",
                            workdir.toAbsolutePath() + ":/work",
                            "-w",
                            "/work",
                            "--entrypoint",
                            "/bin/sh",
                            imageFor(normLang),
                            "/work/run.sh");

            long start = System.nanoTime();
            Process process;
            try {
                process = new ProcessBuilder(command).redirectErrorStream(false).start();
            } catch (IOException e) {
                return buildErrorResult(
                        ExecutionResult.INTERNAL_ERROR, "Internal Error", "Docker daemon unavailable: " + e.getMessage(), -1);
            }

            boolean finished = process.waitFor((long) (timeout + 60), TimeUnit.SECONDS);
            double elapsed = (System.nanoTime() - start) / 1_000_000_000.0;
            if (!finished) {
                process.destroyForcibly();
                return buildErrorResult(
                        ExecutionResult.TIME_LIMIT_EXCEEDED, "Time Limit Exceeded", "Execution timed out", 124);
            }

            String output = readCapped(workdir.resolve("output.txt"), MAX_OUTPUT_BYTES);
            String stderr = readCapped(workdir.resolve("error.txt"), MAX_ERROR_BYTES);
            String compileOutput = readCapped(workdir.resolve("compile.txt"), MAX_ERROR_BYTES);
            int exitCode = readExitCode(workdir.resolve("exit.txt"));

            return evaluate(normLang, output, stderr, compileOutput, exitCode, elapsed);
        } catch (Exception e) {
            log.error("Docker judge execution failed", e);
            return buildErrorResult(ExecutionResult.INTERNAL_ERROR, "Internal Error", "Judge internal error: " + e.getMessage(), -1);
        } finally {
            semaphore.release();
            if (workdir != null) {
                deleteRecursively(workdir);
            }
        }
    }

    /** Exact verdict-mapping priority order from docker_executor.py. */
    private ExecutionResult evaluate(
            String language, String output, String stderr, String compileOutput, int exitCode, double elapsed) {
        String effectiveCompileOutput = compileOutput;

        // Python has no separate compile step, but a syntax error surfaces
        // via stderr + non-zero exit -- reclassify it as a compile error.
        if ("python".equals(language) && exitCode != 0 && PYTHON_SYNTAX_ERROR.matcher(stderr).find()) {
            effectiveCompileOutput = stderr;
        }

        String status;
        String description;
        String error;
        int reportedExitCode = exitCode;

        if (effectiveCompileOutput != null && !effectiveCompileOutput.isBlank()) {
            status = ExecutionResult.COMPILATION_ERROR;
            description = "Compilation Error";
            error = effectiveCompileOutput;
            reportedExitCode = 1;
        } else if (exitCode == 124) {
            status = ExecutionResult.TIME_LIMIT_EXCEEDED;
            description = "Time Limit Exceeded";
            error = stderr.isBlank() ? "Execution timed out (Time Limit Exceeded)" : stderr;
        } else if (exitCode != 0) {
            status = ExecutionResult.RUNTIME_ERROR;
            description = "Runtime Error";
            error = stderr;
        } else {
            status = ExecutionResult.ACCEPTED;
            description = "Accepted";
            error = "";
        }

        return new ExecutionResult(
                status, description, output, stderr, error, Math.round(elapsed * 1000.0) / 1000.0, 0, reportedExitCode, "local-machine", compilerLabel(language));
    }

    private String buildRunScript(LanguageProfile profile, double timeoutSeconds) {
        StringBuilder sb = new StringBuilder();
        sb.append("#!/bin/sh\n");
        if (profile.compileCmd() != null) {
            sb.append("timeout ").append((long) (timeoutSeconds + 5)).append("s ").append(profile.compileCmd())
                    .append(" > compile.txt 2>&1\n");
            sb.append("if [ $? -ne 0 ]; then\n");
            sb.append("  echo \"EXIT_CODE=1\" > exit.txt\n");
            sb.append("  touch output.txt error.txt\n");
            sb.append("  exit 0\n");
            sb.append("fi\n");
        } else {
            sb.append("touch compile.txt\n");
        }
        sb.append("timeout ").append((long) timeoutSeconds).append("s ").append(profile.runCmd())
                .append(" < input.txt > output.txt 2> error.txt\n");
        sb.append("echo \"EXIT_CODE=$?\" > exit.txt\n");
        return sb.toString();
    }

    private String imageFor(String language) {
        return switch (language) {
            case "python" -> properties.getJudge().getImagePython();
            case "java" -> properties.getJudge().getImageJava();
            case "c" -> properties.getJudge().getImageC();
            case "cpp" -> properties.getJudge().getImageCpp();
            default -> throw new IllegalStateException("Unreachable: unknown language " + language);
        };
    }

    private String compilerLabel(String language) {
        return switch (language) {
            case "python" -> "Python 3";
            case "java" -> "OpenJDK 17";
            case "c" -> "GCC";
            case "cpp" -> "G++";
            default -> language;
        };
    }

    private String readCapped(Path file, int maxBytes) {
        try {
            if (!Files.exists(file)) {
                return "";
            }
            byte[] bytes = Files.readAllBytes(file);
            if (bytes.length > maxBytes) {
                bytes = java.util.Arrays.copyOf(bytes, maxBytes);
            }
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "";
        }
    }

    private int readExitCode(Path exitFile) {
        try {
            if (!Files.exists(exitFile)) {
                return -1;
            }
            String content = Files.readString(exitFile);
            var matcher = Pattern.compile("EXIT_CODE=(\\d+)").matcher(content);
            return matcher.find() ? Integer.parseInt(matcher.group(1)) : -1;
        } catch (Exception e) {
            return -1;
        }
    }

    private ExecutionResult buildErrorResult(String status, String description, String error, int exitCode) {
        return new ExecutionResult(status, description, "", error, error, 0.0, 0, exitCode, "local-machine", "n/a");
    }

    private void deleteRecursively(Path path) {
        try (var stream = Files.walk(path)) {
            stream.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // best-effort cleanup
                }
            });
        } catch (IOException ignored) {
            // best-effort cleanup
        }
    }
}
