package com.codearena.service;

import com.codearena.dto.response.ResultRow;
import com.codearena.dto.response.StudentMonitorRow;
import com.codearena.dto.response.ViolationOut;
import com.codearena.entity.StudentCode;
import com.codearena.entity.Submission;
import com.codearena.entity.Test;
import com.codearena.entity.TestAttempt;
import com.codearena.entity.User;
import com.codearena.entity.Violation;
import com.codearena.entity.enums.AttemptStatus;
import com.codearena.entity.enums.Role;
import com.codearena.exception.ApiException;
import com.codearena.repository.StudentCodeRepository;
import com.codearena.repository.StudentQuestionRepository;
import com.codearena.repository.SubmissionRepository;
import com.codearena.repository.TestAttemptRepository;
import com.codearena.repository.TestRepository;
import com.codearena.repository.UserRepository;
import com.codearena.repository.ViolationRepository;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Ports monitor_test, get_test_results, list_violations from admin.py. */
@Service
public class AdminMonitoringService {

    private final UserRepository userRepository;
    private final TestRepository testRepository;
    private final TestAttemptRepository attemptRepository;
    private final StudentCodeRepository studentCodeRepository;
    private final SubmissionRepository submissionRepository;
    private final StudentQuestionRepository studentQuestionRepository;
    private final ViolationRepository violationRepository;

    public AdminMonitoringService(
            UserRepository userRepository,
            TestRepository testRepository,
            TestAttemptRepository attemptRepository,
            StudentCodeRepository studentCodeRepository,
            SubmissionRepository submissionRepository,
            StudentQuestionRepository studentQuestionRepository,
            ViolationRepository violationRepository) {
        this.userRepository = userRepository;
        this.testRepository = testRepository;
        this.attemptRepository = attemptRepository;
        this.studentCodeRepository = studentCodeRepository;
        this.submissionRepository = submissionRepository;
        this.studentQuestionRepository = studentQuestionRepository;
        this.violationRepository = violationRepository;
    }

    /** NOTE: intentionally NO 404 on a missing test_id -- matches monitor_test exactly. */
    public List<StudentMonitorRow> monitorTest(Long testId) {
        OffsetDateTime now = OffsetDateTime.now();
        List<User> students = userRepository.findByIsActiveTrue().stream().filter(u -> u.getRole() == Role.STUDENT).toList();

        List<StudentMonitorRow> rows = new ArrayList<>();
        for (User student : students) {
            Optional<TestAttempt> attemptOpt = attemptRepository.findByUserIdAndTestId(student.getId(), testId);
            if (attemptOpt.isEmpty()) {
                rows.add(new StudentMonitorRow(student.getId(), student.getName(), orEmpty(student.getRegisterNumber()), "not_started", 0, 0, 0, null, null));
                continue;
            }
            TestAttempt attempt = attemptOpt.get();

            long questionsAttempted = studentCodeRepository.countAttemptedByAttemptId(attempt.getId());
            long questionsSubmitted = submissionRepository.countByAttemptId(attempt.getId());

            String statusStr;
            OffsetDateTime lastActivity = null;
            if (attempt.getStatus() == AttemptStatus.SUBMITTED || attempt.getStatus() == AttemptStatus.AUTO_SUBMITTED) {
                statusStr = attempt.getStatus().dbValue();
            } else if (attempt.getExpiresAt().isBefore(now)) {
                statusStr = "auto_submitted"; // display only, does not mutate DB here
            } else {
                Optional<StudentCode> lastCode = studentCodeRepository.findFirstByAttemptIdOrderByUpdatedAtDesc(attempt.getId());
                lastActivity = lastCode.map(StudentCode::getUpdatedAt).orElse(null);
                if (lastActivity != null && java.time.Duration.between(lastActivity, now).getSeconds() > 120) {
                    statusStr = "disconnected";
                } else {
                    statusStr = "writing";
                }
            }

            int remaining = attempt.getExpiresAt().isAfter(now) ? (int) Math.max(0, java.time.Duration.between(now, attempt.getExpiresAt()).getSeconds()) : 0;

            rows.add(
                    new StudentMonitorRow(
                            student.getId(),
                            student.getName(),
                            orEmpty(student.getRegisterNumber()),
                            statusStr,
                            (int) questionsAttempted,
                            (int) questionsSubmitted,
                            attempt.getViolationCount() == null ? 0 : attempt.getViolationCount(),
                            remaining,
                            lastActivity));
        }
        return rows;
    }

    public List<ResultRow> getTestResults(Long testId) {
        Test test = testRepository.findById(testId).orElseThrow(() -> ApiException.notFound("Test not found"));
        double totalPossible = test.getTotalMarks() != null ? test.getTotalMarks() : 0;

        List<TestAttempt> attempts = attemptRepository.findByTestId(testId);
        List<ResultRow> rows = new ArrayList<>();

        for (TestAttempt attempt : attempts) {
            User student = userRepository.findById(attempt.getUserId()).orElse(null);
            if (student == null) {
                continue;
            }

            long questionsAssigned = studentQuestionRepository.countByAttemptId(attempt.getId());
            long questionsAttempted = studentCodeRepository.countAttemptedByAttemptId(attempt.getId());

            List<Submission> submissions = submissionRepository.findByAttemptIdOrderByIdAsc(attempt.getId());
            long questionsSolved = submissions.stream().filter(s -> s.getTotalTestCases() != null && s.getTotalTestCases() > 0 && s.getPassedTestCases() != null && s.getPassedTestCases().equals(s.getTotalTestCases())).count();

            double score = attempt.getScore() == null ? 0 : attempt.getScore();
            double percentage = totalPossible > 0 ? Math.round((score / totalPossible * 100) * 100.0) / 100.0 : 0;

            String submissionType =
                    switch (attempt.getStatus()) {
                        case AUTO_SUBMITTED -> "time_expired";
                        case SUBMITTED -> "manual";
                        default -> null;
                    };

            rows.add(
                    new ResultRow(
                            0,
                            student.getName(),
                            orEmpty(student.getRegisterNumber()),
                            student.getDepartment(),
                            (int) questionsAssigned,
                            (int) questionsAttempted,
                            (int) questionsSolved,
                            score,
                            totalPossible,
                            percentage,
                            attempt.getViolationCount() == null ? 0 : attempt.getViolationCount(),
                            submissionType,
                            attempt.getSubmittedAt()));
        }

        rows.sort((a, b) -> Double.compare(b.score(), a.score()));
        List<ResultRow> ranked = new ArrayList<>();
        int rank = 1;
        for (ResultRow r : rows) {
            ranked.add(
                    new ResultRow(
                            rank++,
                            r.studentName(),
                            r.registerNumber(),
                            r.department(),
                            r.questionsAssigned(),
                            r.questionsAttempted(),
                            r.questionsSolved(),
                            r.score(),
                            r.totalPossible(),
                            r.percentage(),
                            r.violationCount(),
                            r.submissionType(),
                            r.submittedAt()));
        }
        return ranked;
    }

    public List<ViolationOut> listViolations(Long testId, Long studentId, String violationType) {
        List<Violation> violations;
        if (testId != null) {
            List<TestAttempt> attemptsForTest = attemptRepository.findByTestId(testId);
            List<Long> attemptIds = attemptsForTest.stream().filter(a -> studentId == null || a.getUserId().equals(studentId)).map(TestAttempt::getId).toList();
            violations = new ArrayList<>();
            for (Long attemptId : attemptIds) {
                violations.addAll(violationRepository.findByAttemptIdOrderByCreatedAtDesc(attemptId));
            }
            violations.sort((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()));
        } else if (studentId != null) {
            List<TestAttempt> attemptsForStudent = attemptRepository.findByUserId(studentId);
            violations = new ArrayList<>();
            for (TestAttempt a : attemptsForStudent) {
                violations.addAll(violationRepository.findByAttemptIdOrderByCreatedAtDesc(a.getId()));
            }
            violations.sort((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()));
        } else {
            violations = violationRepository.findAll();
            violations.sort((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()));
        }

        if (violationType != null) {
            violations = violations.stream().filter(v -> violationType.equals(v.getViolationType())).toList();
        }

        return violations.stream().map(v -> new ViolationOut(v.getId(), v.getAttemptId(), v.getViolationType(), v.getCreatedAt())).toList();
    }

    private String orEmpty(String value) {
        return value == null ? "" : value;
    }
}
