package com.codearena.service;

import com.codearena.dto.request.CodeRunCaseRequest;
import com.codearena.dto.request.CodeRunRequest;
import com.codearena.dto.response.CodeRunResponse;
import com.codearena.dto.response.CodeSubmitResponse;
import com.codearena.dto.response.TestCaseResultOut;
import com.codearena.entity.Question;
import com.codearena.entity.StudentCode;
import com.codearena.entity.Submission;
import com.codearena.entity.SubmissionResult;
import com.codearena.entity.TestAttempt;
import com.codearena.entity.TestCase;
import com.codearena.entity.enums.AttemptStatus;
import com.codearena.exception.ApiException;
import com.codearena.execution.ExecutionResult;
import com.codearena.execution.ExecutionService;
import com.codearena.execution.OutputComparator;
import com.codearena.execution.TestCaseResult;
import com.codearena.execution.TestCaseView;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.StudentCodeRepository;
import com.codearena.repository.StudentQuestionRepository;
import com.codearena.repository.SubmissionRepository;
import com.codearena.repository.SubmissionResultRepository;
import com.codearena.repository.TestAttemptRepository;
import com.codearena.repository.TestCaseRepository;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ports app/api/execution.py's three graded/ungraded run endpoints. Two
 * asymmetries vs the attempt endpoints in module 6 are intentional and
 * preserved exactly:
 *  - ownership check here is 404 (attempt missing) vs 403 (wrong owner) as
 *    DISTINCT statuses, unlike the combined-query 404-for-both pattern
 *    used by AttemptLifecycleService.
 *  - /code/run-case skips the "question assigned to this attempt" check
 *    that /code/run and /code/submit both apply.
 */
@Slf4j
@Service
public class CodeExecutionService {

    private final ExecutionService executionService;
    private final OutputComparator comparator;
    private final TestAttemptRepository attemptRepository;
    private final StudentQuestionRepository studentQuestionRepository;
    private final TestCaseRepository testCaseRepository;
    private final QuestionRepository questionRepository;
    private final SubmissionRepository submissionRepository;
    private final SubmissionResultRepository submissionResultRepository;
    private final StudentCodeRepository studentCodeRepository;
    private final AttemptExpiryService attemptExpiryService;

    public CodeExecutionService(
            ExecutionService executionService,
            OutputComparator comparator,
            TestAttemptRepository attemptRepository,
            StudentQuestionRepository studentQuestionRepository,
            TestCaseRepository testCaseRepository,
            QuestionRepository questionRepository,
            SubmissionRepository submissionRepository,
            SubmissionResultRepository submissionResultRepository,
            StudentCodeRepository studentCodeRepository,
            AttemptExpiryService attemptExpiryService) {
        this.executionService = executionService;
        this.comparator = comparator;
        this.attemptRepository = attemptRepository;
        this.studentQuestionRepository = studentQuestionRepository;
        this.testCaseRepository = testCaseRepository;
        this.questionRepository = questionRepository;
        this.submissionRepository = submissionRepository;
        this.submissionResultRepository = submissionResultRepository;
        this.studentCodeRepository = studentCodeRepository;
        this.attemptExpiryService = attemptExpiryService;
    }

    public Map<String, Object> getCompilerStatus() {
        return executionService.getDiagnostics();
    }

    public CodeRunResponse runCase(Long studentId, CodeRunCaseRequest request) {
        TestAttempt attempt = getOwnedAttempt(request.getAttemptId(), studentId);
        requireActive(attempt);
        if (attemptExpiryService.autoSubmitExpired(attempt)) {
            throw ApiException.badRequest("Attempt expired and has been auto-submitted");
        }
        // No "question assigned to this attempt" check here -- intentional asymmetry.

        ExecutionResult result =
                executionService.executeAdHoc(
                        request.getSourceCode(), request.getLanguage(), request.getInput(), request.getExpectedOutput());

        String actualOutput = result.output() == null ? "" : result.output().strip();
        String expected = request.getExpectedOutput() == null ? "" : request.getExpectedOutput().strip();
        String status = result.status() == null ? "error" : result.status();
        // Exact-string comparison here, NOT the lenient compare_outputs --
        // matches run_single_case in the Python app exactly.
        boolean passed = ExecutionResult.ACCEPTED.equals(status) && (request.getExpectedOutput() == null || actualOutput.equals(expected));
        String compilationError =
                (ExecutionResult.COMPILATION_ERROR.equals(status) || ExecutionResult.COMPILER_NOT_INSTALLED.equals(status))
                        ? result.error()
                        : null;

        TestCaseResultOut resultOut =
                new TestCaseResultOut(
                        null,
                        passed,
                        request.getInput(),
                        request.getExpectedOutput(),
                        actualOutput,
                        result.executionTime(),
                        result.memoryUsed(),
                        status,
                        blankToNull(orElse(result.error(), result.stderr())));

        return new CodeRunResponse(
                compilationError != null ? "error" : "success", compilationError, List.of(resultOut), passed ? 1 : 0, 1);
    }

    @Transactional
    public CodeRunResponse run(Long studentId, CodeRunRequest request) {
        TestAttempt attempt = getOwnedAttempt(request.getAttemptId(), studentId);
        requireActive(attempt);
        if (attemptExpiryService.autoSubmitExpired(attempt)) {
            throw ApiException.badRequest("Attempt expired and has been auto-submitted");
        }
        requireAssignedQuestion(request.getAttemptId(), request.getQuestionId());

        List<TestCase> publicTestCases = testCaseRepository.findByQuestionIdAndIsHiddenFalse(request.getQuestionId());
        if (publicTestCases.isEmpty()) {
            return new CodeRunResponse("success", null, List.of(), 0, 0);
        }

        saveCodeDraftBestEffort(request.getAttemptId(), request.getQuestionId(), request.getLanguage(), request.getSourceCode());

        List<TestCaseResult> results =
                executionService.runAgainstTestCases(request.getSourceCode(), request.getLanguage(), toViews(publicTestCases));

        String compilationError = null;
        if (!results.isEmpty() && isCompilationFailure(results.get(0).status())) {
            String err = results.get(0).error();
            compilationError = (err == null || err.isBlank()) ? "Compilation failed" : err;
        }

        int passedCount = (int) results.stream().filter(TestCaseResult::passed).count();

        log.info(
                "[JUDGE LOG] Action=RUN | StudentID={} | AttemptID={} | QuestionID={} | Language={} | Passed={}/{}",
                studentId,
                request.getAttemptId(),
                request.getQuestionId(),
                request.getLanguage(),
                passedCount,
                results.size());

        List<TestCaseResultOut> resultsOut = results.stream().map(this::toResultOut).toList();
        return new CodeRunResponse(
                compilationError != null ? "error" : "success", compilationError, resultsOut, passedCount, results.size());
    }

    @Transactional
    public CodeSubmitResponse submit(Long studentId, CodeRunRequest request) {
        TestAttempt attempt = getOwnedAttempt(request.getAttemptId(), studentId);
        requireActive(attempt);
        if (attemptExpiryService.autoSubmitExpired(attempt)) {
            throw ApiException.badRequest("Attempt expired and has been auto-submitted");
        }
        requireAssignedQuestion(request.getAttemptId(), request.getQuestionId());

        Question question = questionRepository.findById(request.getQuestionId()).orElseThrow(() -> ApiException.notFound("Question not found"));

        List<TestCase> allTestCases = testCaseRepository.findByQuestionId(request.getQuestionId());
        if (allTestCases.isEmpty()) {
            throw ApiException.badRequest("This question has no test cases configured; submission is not possible");
        }

        List<TestCaseResult> results =
                executionService.runAgainstTestCases(request.getSourceCode(), request.getLanguage(), toViews(allTestCases));

        int passedCount = (int) results.stream().filter(TestCaseResult::passed).count();
        int totalCount = results.size();
        int marks = question.getMarks() != null && question.getMarks() > 0 ? question.getMarks() : 50;
        double score = totalCount > 0 ? ((double) passedCount / totalCount) * marks : 0;

        boolean hasCompilationError = results.stream().anyMatch(r -> isCompilationFailure(r.status()));
        String statusStr;
        if (hasCompilationError) {
            statusStr = ExecutionResult.COMPILATION_ERROR;
        } else if (totalCount > 0 && passedCount == totalCount) {
            statusStr = ExecutionResult.ACCEPTED;
        } else if (passedCount > 0) {
            statusStr = "partial";
        } else {
            statusStr = ExecutionResult.WRONG_ANSWER;
        }

        Submission submission =
                submissionRepository.saveAndFlush(
                        Submission.builder()
                                .attemptId(request.getAttemptId())
                                .questionId(request.getQuestionId())
                                .language(request.getLanguage())
                                .code(request.getSourceCode())
                                .score(score)
                                .totalTestCases(totalCount)
                                .passedTestCases(passedCount)
                                .status(statusStr)
                                .build());

        for (TestCaseResult r : results) {
            submissionResultRepository.saveAndFlush(
                    SubmissionResult.builder()
                            .submissionId(submission.getId())
                            .testCaseId(r.testCaseId())
                            .passed(r.passed())
                            .output(r.actualOutput())
                            .executionTime(r.executionTime())
                            .memoryUsed(r.memoryUsed())
                            .status(r.status())
                            .build());
        }

        saveCodeDraftBestEffort(request.getAttemptId(), request.getQuestionId(), request.getLanguage(), request.getSourceCode());

        log.info(
                "[JUDGE LOG] Action=SUBMIT | StudentID={} | AttemptID={} | QuestionID={} | Language={} | Score={}/{} | Verdict={}",
                studentId,
                request.getAttemptId(),
                request.getQuestionId(),
                request.getLanguage(),
                score,
                marks,
                statusStr);

        List<TestCaseResultOut> submitResults =
                results.stream()
                        .map(
                                r ->
                                        new TestCaseResultOut(
                                                r.testCaseId(),
                                                r.passed(),
                                                r.isHidden() ? "[Hidden]" : r.input(),
                                                r.isHidden() ? "[Hidden]" : r.expectedOutput(),
                                                r.isHidden() ? "[Hidden]" : r.actualOutput(),
                                                r.executionTime(),
                                                r.memoryUsed(),
                                                r.status(),
                                                r.isHidden() ? null : r.error()))
                        .toList();

        return new CodeSubmitResponse(score, question.getMarks(), passedCount, totalCount, statusStr, submitResults);
    }

    private TestAttempt getOwnedAttempt(Long attemptId, Long studentId) {
        TestAttempt attempt =
                attemptRepository
                        .findById(attemptId)
                        .orElseThrow(() -> ApiException.notFound("Attempt not found. Start the exam before running code."));
        if (!attempt.getUserId().equals(studentId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Attempt does not belong to the current student");
        }
        return attempt;
    }

    private void requireActive(TestAttempt attempt) {
        if (attempt.getStatus() == AttemptStatus.SUBMITTED || attempt.getStatus() == AttemptStatus.AUTO_SUBMITTED) {
            throw ApiException.badRequest("Attempt already submitted");
        }
    }

    private void requireAssignedQuestion(Long attemptId, Long questionId) {
        studentQuestionRepository
                .findByAttemptIdAndQuestionId(attemptId, questionId)
                .orElseThrow(() -> ApiException.badRequest("Question is not part of this attempt"));
    }

    private void saveCodeDraftBestEffort(Long attemptId, Long questionId, String language, String sourceCode) {
        try {
            StudentCode code =
                    studentCodeRepository
                            .findByAttemptIdAndQuestionId(attemptId, questionId)
                            .orElseGet(() -> StudentCode.builder().attemptId(attemptId).questionId(questionId).build());
            code.setSourceCode(sourceCode);
            code.setLanguage(language);
            studentCodeRepository.saveAndFlush(code);
        } catch (Exception e) {
            log.warn("Could not save draft code for attempt {}, question {}: {}", attemptId, questionId, e.getMessage());
        }
    }

    private List<TestCaseView> toViews(List<TestCase> testCases) {
        return testCases.stream().map(tc -> new TestCaseView(tc.getId(), tc.getInput(), tc.getExpectedOutput(), tc.getIsHidden())).toList();
    }

    private boolean isCompilationFailure(String status) {
        return ExecutionResult.COMPILATION_ERROR.equals(status) || ExecutionResult.COMPILER_NOT_INSTALLED.equals(status);
    }

    private TestCaseResultOut toResultOut(TestCaseResult r) {
        return new TestCaseResultOut(
                r.testCaseId(), r.passed(), r.input(), r.expectedOutput(), r.actualOutput(), r.executionTime(), r.memoryUsed(), r.status(), r.error());
    }

    private String orElse(String primary, String fallback) {
        return (primary != null && !primary.isBlank()) ? primary : fallback;
    }

    private String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value;
    }
}
