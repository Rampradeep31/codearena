package com.codearena.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.codearena.AbstractIntegrationTest;
import com.codearena.entity.enums.AccountStatus;
import com.codearena.entity.enums.AttemptStatus;
import com.codearena.entity.enums.Difficulty;
import com.codearena.entity.enums.Role;
import com.codearena.entity.enums.ScoringType;
import com.codearena.repository.QuestionBankRepository;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.StudentCodeRepository;
import com.codearena.repository.StudentQuestionAssignmentRepository;
import com.codearena.repository.StudentQuestionRepository;
import com.codearena.repository.SubmissionRepository;
import com.codearena.repository.SubmissionResultRepository;
import com.codearena.repository.TestAttemptRepository;
import com.codearena.repository.TestCaseRepository;
import com.codearena.repository.TestQuestionRepository;
import com.codearena.repository.TestRepository;
import com.codearena.repository.UserRepository;
import com.codearena.repository.ViolationRepository;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

/**
 * Module 1 verification: insert-then-read-back round trip for every entity
 * against a real Postgres instance running the ACTUAL supabase_schema.sql
 * (see AbstractIntegrationTest), not Hibernate-generated DDL. Specifically
 * asserts the jsonb round-trip on Test.allowedLanguages and the
 * Integer/Double score-type split between TestAttempt and Submission.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class EntityRepositoryIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private QuestionBankRepository questionBankRepository;

    @Autowired
    private QuestionRepository questionRepository;

    @Autowired
    private TestCaseRepository testCaseRepository;

    @Autowired
    private TestRepository testRepository;

    @Autowired
    private TestQuestionRepository testQuestionRepository;

    @Autowired
    private TestAttemptRepository testAttemptRepository;

    @Autowired
    private StudentQuestionAssignmentRepository studentQuestionAssignmentRepository;

    @Autowired
    private StudentQuestionRepository studentQuestionRepository;

    @Autowired
    private StudentCodeRepository studentCodeRepository;

    @Autowired
    private SubmissionRepository submissionRepository;

    @Autowired
    private SubmissionResultRepository submissionResultRepository;

    @Autowired
    private ViolationRepository violationRepository;

    @Test
    void insertAndReadBackEveryEntityAgainstTheRealSchema() {
        // 1. User
        User student =
                userRepository.saveAndFlush(
                        User.builder()
                                .email("student1@codearena.com")
                                .registerNumber("STU001")
                                .name("Student One")
                                .passwordHash("hashed")
                                .role(Role.STUDENT)
                                .department("AI & DS")
                                .year(2)
                                .section("A")
                                .status(AccountStatus.ACTIVE)
                                .isActive(true)
                                .build());
        User reloadedStudent = userRepository.findById(student.getId()).orElseThrow();
        assertThat(reloadedStudent.getRole()).isEqualTo(Role.STUDENT);
        assertThat(reloadedStudent.getStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(reloadedStudent.getCreatedAt()).isNotNull();
        assertThat(reloadedStudent.getUpdatedAt()).isNotNull();

        // 2. QuestionBank (includes the updated_at column missing from the Python model)
        QuestionBank bank =
                questionBankRepository.saveAndFlush(
                        QuestionBank.builder().title("Bank 1").description("desc").build());
        QuestionBank reloadedBank = questionBankRepository.findById(bank.getId()).orElseThrow();
        assertThat(reloadedBank.getYear()).isEqualTo("Second Year");
        assertThat(reloadedBank.getStatus()).isEqualTo("Active");
        assertThat(reloadedBank.getUpdatedAt()).isNotNull();

        // 3. Question
        Question question =
                questionRepository.saveAndFlush(
                        Question.builder()
                                .title("Reverse a string")
                                .statement("Reverse the given string")
                                .difficulty(Difficulty.EASY)
                                .marks(10)
                                .questionBankId(bank.getId())
                                .build());
        Question reloadedQuestion = questionRepository.findById(question.getId()).orElseThrow();
        assertThat(reloadedQuestion.getTopic()).isEqualTo("General");
        assertThat(reloadedQuestion.getDifficulty()).isEqualTo(Difficulty.EASY);

        // 4. TestCase
        TestCase testCase =
                testCaseRepository.saveAndFlush(
                        TestCase.builder()
                                .questionId(question.getId())
                                .input("abc")
                                .expectedOutput("cba")
                                .build());
        TestCase reloadedTestCase = testCaseRepository.findById(testCase.getId()).orElseThrow();
        assertThat(reloadedTestCase.getIsHidden()).isFalse();

        // 5. Test -- jsonb round trip + dead scoringType field
        OffsetDateTime start = OffsetDateTime.now();
        OffsetDateTime end = start.plusHours(2);
        com.codearena.entity.Test examTest =
                testRepository.saveAndFlush(
                        com.codearena.entity.Test.builder()
                                .name("Midterm")
                                .questionBankId(bank.getId())
                                .startTime(start)
                                .endTime(end)
                                .durationMinutes(60)
                                .totalMarks(50)
                                .questionsPerStudent(1)
                                .build());
        com.codearena.entity.Test reloadedTest = testRepository.findById(examTest.getId()).orElseThrow();
        assertThat(reloadedTest.getAllowedLanguages()).containsExactly("python", "java", "c", "cpp");
        assertThat(reloadedTest.getScoringType()).isEqualTo(ScoringType.PARTIAL);

        // 6. TestQuestion
        TestQuestion testQuestion =
                testQuestionRepository.saveAndFlush(
                        TestQuestion.builder().testId(examTest.getId()).questionId(question.getId()).build());
        assertThat(testQuestionRepository.findById(testQuestion.getId())).isPresent();

        // 7. TestAttempt -- Integer score, distinct from Submission's Double
        TestAttempt attempt =
                testAttemptRepository.saveAndFlush(
                        TestAttempt.builder()
                                .userId(student.getId())
                                .testId(examTest.getId())
                                .startedAt(OffsetDateTime.now())
                                .expiresAt(OffsetDateTime.now().plusMinutes(60))
                                .build());
        TestAttempt reloadedAttempt = testAttemptRepository.findById(attempt.getId()).orElseThrow();
        assertThat(reloadedAttempt.getStatus()).isEqualTo(AttemptStatus.IN_PROGRESS);
        assertThat(reloadedAttempt.getScore()).isInstanceOf(Integer.class).isEqualTo(0);

        // 8. StudentQuestionAssignment
        StudentQuestionAssignment assignment =
                studentQuestionAssignmentRepository.saveAndFlush(
                        StudentQuestionAssignment.builder()
                                .studentId(student.getId())
                                .testId(examTest.getId())
                                .questionId(question.getId())
                                .build());
        assertThat(studentQuestionAssignmentRepository.findById(assignment.getId())).isPresent();

        // 9. StudentQuestion
        StudentQuestion studentQuestion =
                studentQuestionRepository.saveAndFlush(
                        StudentQuestion.builder()
                                .attemptId(attempt.getId())
                                .questionId(question.getId())
                                .position(1)
                                .build());
        assertThat(studentQuestionRepository.findById(studentQuestion.getId())).isPresent();

        // 10. StudentCode
        StudentCode studentCode =
                studentCodeRepository.saveAndFlush(
                        StudentCode.builder().attemptId(attempt.getId()).questionId(question.getId()).build());
        StudentCode reloadedCode = studentCodeRepository.findById(studentCode.getId()).orElseThrow();
        assertThat(reloadedCode.getLanguage()).isEqualTo("python");

        // 11. Submission -- Double score, distinct from TestAttempt's Integer
        Submission submission =
                submissionRepository.saveAndFlush(
                        Submission.builder()
                                .attemptId(attempt.getId())
                                .questionId(question.getId())
                                .code("print('hi')")
                                .score(7.5)
                                .totalTestCases(2)
                                .passedTestCases(1)
                                .build());
        Submission reloadedSubmission = submissionRepository.findById(submission.getId()).orElseThrow();
        assertThat(reloadedSubmission.getScore()).isInstanceOf(Double.class).isEqualTo(7.5);

        // 12. SubmissionResult -- soft testCaseId reference, no FK
        SubmissionResult result =
                submissionResultRepository.saveAndFlush(
                        SubmissionResult.builder()
                                .submissionId(submission.getId())
                                .testCaseId(testCase.getId())
                                .passed(true)
                                .output("cba")
                                .build());
        assertThat(submissionResultRepository.findById(result.getId())).isPresent();

        // 13. Violation -- plain String, not an entity-level enum
        Violation violation =
                violationRepository.saveAndFlush(
                        Violation.builder().attemptId(attempt.getId()).violationType("tab_hidden").build());
        assertThat(violationRepository.findById(violation.getId())).isPresent();

        List<Submission> byAttempt = submissionRepository.findByAttemptIdOrderByIdAsc(attempt.getId());
        assertThat(byAttempt).hasSize(1);
    }
}
