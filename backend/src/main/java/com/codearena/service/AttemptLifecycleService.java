package com.codearena.service;

import com.codearena.config.AppProperties;
import com.codearena.dto.request.CodeSaveRequest;
import com.codearena.dto.response.AttemptOut;
import com.codearena.dto.response.QuestionStudentOut;
import com.codearena.dto.response.StudentQuestionOut;
import com.codearena.dto.response.TestCasePublicOut;
import com.codearena.entity.Question;
import com.codearena.entity.StudentCode;
import com.codearena.entity.StudentQuestion;
import com.codearena.entity.Submission;
import com.codearena.entity.Test;
import com.codearena.entity.TestAttempt;
import com.codearena.entity.enums.AttemptStatus;
import com.codearena.exception.ApiException;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.StudentCodeRepository;
import com.codearena.repository.StudentQuestionAssignmentRepository;
import com.codearena.repository.StudentQuestionRepository;
import com.codearena.repository.SubmissionRepository;
import com.codearena.repository.TestAttemptRepository;
import com.codearena.repository.TestCaseRepository;
import com.codearena.repository.TestRepository;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ports app/services/attempt_lifecycle.py + the attempt-related parts of
 * app/api/students.py (start_test, get_attempt, get_attempt_questions,
 * save_code, finish_test). Every quirk documented in the migration plan
 * (zero-grace auto-submit racing finish_test's grace-aware check,
 * int()-truncated score summation with no ORDER BY, ...) is preserved
 * exactly.
 */
@Slf4j
@Service
public class AttemptLifecycleService {

    private final TestRepository testRepository;
    private final TestAttemptRepository attemptRepository;
    private final StudentQuestionRepository studentQuestionRepository;
    private final StudentCodeRepository studentCodeRepository;
    private final SubmissionRepository submissionRepository;
    private final QuestionRepository questionRepository;
    private final TestCaseRepository testCaseRepository;
    private final StudentQuestionAssignmentRepository assignmentRepository;
    private final QuestionSelectionService questionSelectionService;
    private final AttemptExpiryService attemptExpiryService;
    private final AppProperties properties;

    public AttemptLifecycleService(
            TestRepository testRepository,
            TestAttemptRepository attemptRepository,
            StudentQuestionRepository studentQuestionRepository,
            StudentCodeRepository studentCodeRepository,
            SubmissionRepository submissionRepository,
            QuestionRepository questionRepository,
            TestCaseRepository testCaseRepository,
            StudentQuestionAssignmentRepository assignmentRepository,
            QuestionSelectionService questionSelectionService,
            AttemptExpiryService attemptExpiryService,
            AppProperties properties) {
        this.testRepository = testRepository;
        this.attemptRepository = attemptRepository;
        this.studentQuestionRepository = studentQuestionRepository;
        this.studentCodeRepository = studentCodeRepository;
        this.submissionRepository = submissionRepository;
        this.questionRepository = questionRepository;
        this.testCaseRepository = testCaseRepository;
        this.assignmentRepository = assignmentRepository;
        this.questionSelectionService = questionSelectionService;
        this.attemptExpiryService = attemptExpiryService;
        this.properties = properties;
    }

    @Transactional
    public AttemptOut startTest(Long testId, Long studentId) {
        OffsetDateTime now = OffsetDateTime.now();
        Test test = testRepository.findById(testId).orElseThrow(() -> ApiException.notFound("Test not found"));

        if (test.getStartTime().isAfter(now)) {
            throw ApiException.badRequest("Test has not started yet");
        }
        if (test.getEndTime().isBefore(now)) {
            throw ApiException.badRequest("Test has already ended");
        }

        Optional<TestAttempt> existingOpt = attemptRepository.findByUserIdAndTestId(studentId, testId);
        if (existingOpt.isPresent()) {
            TestAttempt attempt = existingOpt.get();
            if (isCompleted(attempt.getStatus())) {
                throw ApiException.badRequest("Test has already been submitted and cannot be restarted");
            }
            // Recover missing StudentQuestion/StudentCode rows if a previous
            // partial start left the assignment without them.
            if (studentQuestionRepository.countByAttemptId(attempt.getId()) == 0) {
                assignmentRepository
                        .findByStudentIdAndTestId(studentId, testId)
                        .ifPresent(
                                assignment -> {
                                    try {
                                        studentQuestionRepository.saveAndFlush(
                                                StudentQuestion.builder()
                                                        .attemptId(attempt.getId())
                                                        .questionId(assignment.getQuestionId())
                                                        .position(1)
                                                        .build());
                                        studentCodeRepository.saveAndFlush(
                                                StudentCode.builder()
                                                        .attemptId(attempt.getId())
                                                        .questionId(assignment.getQuestionId())
                                                        .language("python")
                                                        .sourceCode("")
                                                        .build());
                                    } catch (Exception e) {
                                        log.error("Failed to recover student_questions for attempt {}", attempt.getId(), e);
                                    }
                                });
            }
            return toAttemptOut(attempt, test);
        }

        List<Question> selected = questionSelectionService.resolveQuestionsForNewAttempt(test, studentId);

        OffsetDateTime expiresAt = now.plusMinutes(test.getDurationMinutes());
        if (test.getEndTime().isBefore(expiresAt)) {
            expiresAt = test.getEndTime();
        }

        TestAttempt attempt =
                TestAttempt.builder()
                        .userId(studentId)
                        .testId(testId)
                        .startedAt(now)
                        .expiresAt(expiresAt)
                        .status(AttemptStatus.IN_PROGRESS)
                        .violationCount(0)
                        .score(0)
                        .build();
        try {
            attempt = attemptRepository.saveAndFlush(attempt);
        } catch (DataIntegrityViolationException raceCondition) {
            Optional<TestAttempt> concurrent = attemptRepository.findByUserIdAndTestId(studentId, testId);
            if (concurrent.isPresent()) {
                return toAttemptOut(concurrent.get(), test);
            }
            throw raceCondition;
        }

        int position = 1;
        for (Question q : selected) {
            studentQuestionRepository.saveAndFlush(
                    StudentQuestion.builder().attemptId(attempt.getId()).questionId(q.getId()).position(position++).build());
            studentCodeRepository.saveAndFlush(
                    StudentCode.builder().attemptId(attempt.getId()).questionId(q.getId()).language("python").sourceCode("").build());
        }

        return toAttemptOut(attempt, test);
    }

    public AttemptOut getAttempt(Long attemptId, Long studentId) {
        TestAttempt attempt = findOwnedOrThrow(attemptId, studentId);
        attemptExpiryService.autoSubmitExpired(attempt);
        Test test = testRepository.findById(attempt.getTestId()).orElse(null);
        return toAttemptOut(attempt, test);
    }

    /**
     * Returns either a Map (the two "already resolved" 200 shapes) or a
     * List&lt;StudentQuestionOut&gt; -- mirrors the Python endpoint's own
     * multi-shape response exactly (see CodeExecutionController's sibling
     * pattern in module 7 for the same technique).
     */
    public Object getAttemptQuestions(Long attemptId, Long studentId) {
        TestAttempt attempt = findOwnedOrThrow(attemptId, studentId);

        boolean wasAutoSubmitted = attemptExpiryService.autoSubmitExpired(attempt);
        if (wasAutoSubmitted) {
            return statusPayload("auto_submitted", true, true, attempt.getId());
        }

        if (isCompleted(attempt.getStatus())) {
            String status = attempt.getStatus().dbValue();
            boolean expired = attempt.getStatus() == AttemptStatus.AUTO_SUBMITTED;
            return statusPayload(status, true, expired, attempt.getId());
        }

        List<StudentQuestion> studentQuestions = studentQuestionRepository.findByAttemptIdOrderByPosition(attemptId);
        return studentQuestions.stream()
                .map(sq -> toStudentQuestionOut(sq, attemptId))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    @Transactional
    public Map<String, Object> saveCode(Long attemptId, Long studentId, CodeSaveRequest request) {
        TestAttempt attempt = findOwnedOrThrow(attemptId, studentId);
        requireActive(attempt);

        studentQuestionRepository
                .findByAttemptIdAndQuestionId(attemptId, request.getQuestionId())
                .orElseThrow(() -> ApiException.badRequest("Question is not part of this attempt"));

        try {
            StudentCode code =
                    studentCodeRepository
                            .findByAttemptIdAndQuestionId(attemptId, request.getQuestionId())
                            .orElseGet(
                                    () ->
                                            StudentCode.builder()
                                                    .attemptId(attemptId)
                                                    .questionId(request.getQuestionId())
                                                    .build());
            code.setSourceCode(request.getSourceCode());
            code.setLanguage(request.getLanguage());
            studentCodeRepository.saveAndFlush(code);
        } catch (DataIntegrityViolationException raceCondition) {
            studentCodeRepository
                    .findByAttemptIdAndQuestionId(attemptId, request.getQuestionId())
                    .ifPresent(
                            code -> {
                                code.setSourceCode(request.getSourceCode());
                                code.setLanguage(request.getLanguage());
                                studentCodeRepository.saveAndFlush(code);
                            });
        }

        return Map.of("message", "Code saved");
    }

    @Transactional
    public Map<String, Object> finishTest(Long attemptId, Long studentId) {
        TestAttempt attempt = findOwnedOrThrow(attemptId, studentId);

        if (isCompleted(attempt.getStatus())) {
            throw ApiException.badRequest("Already submitted");
        }

        // Zero-grace check runs first, exactly like the Python handler --
        // this is the source of the narrow grace-period race documented in
        // the migration plan; preserve the ordering exactly.
        if (attemptExpiryService.autoSubmitExpired(attempt)) {
            throw ApiException.badRequest("Attempt expired and has been auto-submitted");
        }

        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime expiresAt = attempt.getExpiresAt();
        long graceSeconds = properties.getSubmissionGracePeriodSeconds();

        if (now.isAfter(expiresAt.plusSeconds(graceSeconds))) {
            attempt.setStatus(AttemptStatus.AUTO_SUBMITTED);
        } else {
            attempt.setStatus(AttemptStatus.SUBMITTED);
        }
        attempt.setSubmittedAt(now);

        List<Submission> submissions = submissionRepository.findByAttemptIdOrderByIdAsc(attemptId);
        Map<Long, Double> scoresByQuestion = new LinkedHashMap<>();
        for (Submission s : submissions) {
            scoresByQuestion.put(s.getQuestionId(), s.getScore());
        }
        double total = scoresByQuestion.values().stream().mapToDouble(Double::doubleValue).sum();
        attempt.setScore((int) total);

        attemptRepository.saveAndFlush(attempt);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("message", "Test submitted successfully");
        response.put("attempt_id", attempt.getId());
        response.put("test_id", attempt.getTestId());
        response.put("submitted_at", now);
        response.put("status", attempt.getStatus().dbValue());
        response.put("total_score", (double) attempt.getScore());
        response.put("violation_count", attempt.getViolationCount());
        return response;
    }

    TestAttempt findOwnedOrThrow(Long attemptId, Long studentId) {
        return attemptRepository
                .findByIdAndUserId(attemptId, studentId)
                .orElseThrow(() -> ApiException.notFound("Attempt not found"));
    }

    private void requireActive(TestAttempt attempt) {
        if (isCompleted(attempt.getStatus())) {
            throw ApiException.badRequest("Attempt already submitted");
        }
        if (attemptExpiryService.autoSubmitExpired(attempt)) {
            throw ApiException.badRequest("Attempt expired and has been auto-submitted");
        }
    }

    private boolean isCompleted(AttemptStatus status) {
        return status == AttemptStatus.SUBMITTED || status == AttemptStatus.AUTO_SUBMITTED;
    }

    private Map<String, Object> statusPayload(String status, boolean submitted, boolean expired, Long attemptId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("status", status);
        payload.put("submitted", submitted);
        payload.put("expired", expired);
        payload.put("attempt_id", attemptId);
        return payload;
    }

    private StudentQuestionOut toStudentQuestionOut(StudentQuestion sq, Long attemptId) {
        Question q = questionRepository.findById(sq.getQuestionId()).orElse(null);
        if (q == null) {
            return null;
        }
        List<TestCasePublicOut> publicTestCases =
                testCaseRepository.findByQuestionIdAndIsHiddenFalse(q.getId()).stream()
                        .map(tc -> new TestCasePublicOut(tc.getId(), tc.getInput(), tc.getExpectedOutput()))
                        .toList();

        Optional<StudentCode> savedCode = studentCodeRepository.findByAttemptIdAndQuestionId(attemptId, q.getId());
        Optional<Submission> submission =
                submissionRepository.findFirstByAttemptIdAndQuestionIdOrderByCreatedAtDesc(attemptId, q.getId());

        QuestionStudentOut questionOut =
                new QuestionStudentOut(
                        q.getId(),
                        q.getTitle(),
                        q.getStatement(),
                        q.getDifficulty().dbValue(),
                        q.getMarks(),
                        q.getTopic(),
                        q.getInputFormat(),
                        q.getOutputFormat(),
                        q.getConstraints(),
                        q.getSampleInput(),
                        q.getSampleOutput(),
                        q.getExplanation(),
                        publicTestCases);

        return new StudentQuestionOut(
                sq.getId(),
                sq.getAttemptId(),
                sq.getQuestionId(),
                sq.getPosition(),
                questionOut,
                savedCode.map(StudentCode::getSourceCode).orElse(""),
                savedCode.map(StudentCode::getLanguage).orElse("python"),
                submission.isPresent(),
                submission.map(Submission::getScore).orElse(null));
    }

    private AttemptOut toAttemptOut(TestAttempt attempt, Test test) {
        String reason =
                switch (attempt.getStatus()) {
                    case AUTO_SUBMITTED -> "time_expired";
                    case SUBMITTED -> "manual";
                    default -> null;
                };
        return new AttemptOut(
                attempt.getId(),
                attempt.getUserId(),
                attempt.getTestId(),
                attempt.getStartedAt(),
                attempt.getExpiresAt(),
                attempt.getSubmittedAt(),
                attempt.getStatus().dbValue(),
                attempt.getViolationCount() == null ? 0 : attempt.getViolationCount(),
                reason,
                (double) (attempt.getScore() == null ? 0 : attempt.getScore()),
                test != null && test.getTotalMarks() != null ? test.getTotalMarks().doubleValue() : null,
                test != null ? test.getMaxViolations() : 3,
                test != null && test.getAllowCopyPaste() != null ? test.getAllowCopyPaste() : false,
                test != null && test.getAllowedLanguages() != null ? test.getAllowedLanguages() : List.of("python", "java", "c", "cpp"));
    }
}
