package com.codearena.service;

import com.codearena.dto.response.AttemptOut;
import com.codearena.dto.response.DashboardData;
import com.codearena.dto.response.QuestionBankOut;
import com.codearena.dto.response.QuestionOut;
import com.codearena.dto.response.SubmissionOut;
import com.codearena.dto.response.TestOut;
import com.codearena.dto.response.UserOut;
import com.codearena.entity.Question;
import com.codearena.entity.QuestionBank;
import com.codearena.entity.Submission;
import com.codearena.entity.Test;
import com.codearena.entity.TestAttempt;
import com.codearena.entity.User;
import com.codearena.entity.enums.Role;
import com.codearena.repository.QuestionBankRepository;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.SubmissionRepository;
import com.codearena.repository.TestAttemptRepository;
import com.codearena.repository.TestQuestionRepository;
import com.codearena.repository.TestRepository;
import com.codearena.repository.UserRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** Ports get_dashboard_stats from admin.py, including its own quirks (see below). */
@Service
public class AdminDashboardService {

    private final UserRepository userRepository;
    private final TestRepository testRepository;
    private final QuestionRepository questionRepository;
    private final SubmissionRepository submissionRepository;
    private final TestAttemptRepository attemptRepository;
    private final QuestionBankRepository questionBankRepository;
    private final TestQuestionRepository testQuestionRepository;

    public AdminDashboardService(
            UserRepository userRepository,
            TestRepository testRepository,
            QuestionRepository questionRepository,
            SubmissionRepository submissionRepository,
            TestAttemptRepository attemptRepository,
            QuestionBankRepository questionBankRepository,
            TestQuestionRepository testQuestionRepository) {
        this.userRepository = userRepository;
        this.testRepository = testRepository;
        this.questionRepository = questionRepository;
        this.submissionRepository = submissionRepository;
        this.attemptRepository = attemptRepository;
        this.questionBankRepository = questionBankRepository;
        this.testQuestionRepository = testQuestionRepository;
    }

    public DashboardData getDashboard() {
        OffsetDateTime now = OffsetDateTime.now();

        List<User> students = userRepository.findByRoleOrderByName(Role.STUDENT);
        List<Test> tests = testRepository.findAll();
        List<Question> questions = questionRepository.findAllByOrderByCreatedAtDesc();
        List<TestAttempt> attempts = attemptRepository.findAll();
        List<Submission> submissions = submissionRepository.findAll();
        List<QuestionBank> banks = questionBankRepository.findAllByOrderByCreatedAtDesc();

        Map<Long, Integer> testMarks = new java.util.HashMap<>();
        for (Test t : tests) {
            testMarks.put(t.getId(), t.getTotalMarks());
        }

        long activeTests = tests.stream().filter(t -> !t.getStartTime().isAfter(now) && !t.getEndTime().isBefore(now)).count();
        long completedTests = tests.stream().filter(t -> t.getEndTime().isBefore(now)).count();

        return new DashboardData(
                students.size(),
                tests.size(),
                (int) activeTests,
                (int) completedTests,
                questions.size(),
                submissions.size(),
                students.stream().map(this::toUserOut).toList(),
                tests.stream().map(this::toTestOut).toList(),
                // test_cases always [] in this endpoint specifically -- matches
                // the Python app's _question_out(q) call with no test cases arg.
                questions.stream().map(q -> toQuestionOutNoTestCases(q)).toList(),
                attempts.stream().map(a -> toAttemptOut(a, testMarks.get(a.getTestId()))).toList(),
                submissions.stream().map(this::toSubmissionOut).toList(),
                // question_count hardcoded 0 here (from_orm, not computed) --
                // a real inconsistency vs /admin/question-banks' live count,
                // preserved intentionally per the migration plan.
                banks.stream().map(this::toQuestionBankOutZeroCount).toList());
    }

    private UserOut toUserOut(User u) {
        return new UserOut(
                u.getId(), u.getEmail(), u.getRegisterNumber(), u.getName(), u.getRole().dbValue(), u.getDepartment(), u.getYear(), u.getSection(), u.getStatus().dbValue());
    }

    private TestOut toTestOut(Test t) {
        List<Long> questionIds = testQuestionRepository.findByTestId(t.getId()).stream().map(tq -> tq.getQuestionId()).toList();
        return new TestOut(
                t.getId(),
                t.getName(),
                t.getDescription(),
                t.getYear(),
                t.getQuestionBankId(),
                t.getRandomizeQuestions(),
                t.getStartTime(),
                t.getEndTime(),
                t.getDurationMinutes(),
                t.getTotalMarks(),
                t.getQuestionsPerStudent(),
                t.getEasyCount(),
                t.getMediumCount(),
                t.getHardCount(),
                t.getAllowedLanguages(),
                t.getMaxViolations(),
                t.getAllowCopyPaste(),
                t.getScoringType().dbValue(),
                t.getShowResults(),
                questionIds.size(),
                questionIds,
                t.getCreatedAt());
    }

    private QuestionOut toQuestionOutNoTestCases(Question q) {
        return new QuestionOut(
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
                q.getQuestionBankId(),
                List.of(),
                q.getCreatedAt());
    }

    private AttemptOut toAttemptOut(TestAttempt a, Integer totalMarks) {
        String reason =
                switch (a.getStatus()) {
                    case AUTO_SUBMITTED -> "time_expired";
                    case SUBMITTED -> "manual";
                    default -> null;
                };
        return new AttemptOut(
                a.getId(),
                a.getUserId(),
                a.getTestId(),
                a.getStartedAt(),
                a.getExpiresAt(),
                a.getSubmittedAt(),
                a.getStatus().dbValue(),
                a.getViolationCount() == null ? 0 : a.getViolationCount(),
                reason,
                (double) (a.getScore() == null ? 0 : a.getScore()),
                totalMarks != null ? totalMarks.doubleValue() : null,
                null,
                null,
                null);
    }

    private SubmissionOut toSubmissionOut(Submission s) {
        return new SubmissionOut(s.getId(), s.getAttemptId(), s.getQuestionId(), s.getLanguage(), s.getCreatedAt(), s.getScore(), s.getTotalTestCases(), s.getPassedTestCases());
    }

    private QuestionBankOut toQuestionBankOutZeroCount(QuestionBank b) {
        return new QuestionBankOut(b.getId(), b.getTitle(), b.getDescription(), b.getYear(), b.getStatus(), 0, b.getCreatedAt());
    }
}
