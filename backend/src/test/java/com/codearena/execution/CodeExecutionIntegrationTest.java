package com.codearena.execution;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.codearena.AbstractIntegrationTest;
import com.codearena.entity.Question;
import com.codearena.entity.StudentQuestion;
import com.codearena.entity.TestAttempt;
import com.codearena.entity.TestCase;
import com.codearena.entity.User;
import com.codearena.entity.enums.AccountStatus;
import com.codearena.entity.enums.AttemptStatus;
import com.codearena.entity.enums.Difficulty;
import com.codearena.entity.enums.Role;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.StudentCodeRepository;
import com.codearena.repository.StudentQuestionRepository;
import com.codearena.repository.SubmissionRepository;
import com.codearena.repository.TestAttemptRepository;
import com.codearena.repository.TestCaseRepository;
import com.codearena.repository.UserRepository;
import com.codearena.security.JwtService;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Module 7 verification: /code/run-case, /code/run, /code/submit wiring
 * the real Docker judge (module 5) into the attempt lifecycle (module 6).
 * Uses real "docker run" invocations with small Python snippets.
 */
@SpringBootTest
@AutoConfigureMockMvc
class CodeExecutionIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private QuestionRepository questionRepository;

    @Autowired
    private TestCaseRepository testCaseRepository;

    @Autowired
    private com.codearena.repository.TestRepository testRepository;

    @Autowired
    private TestAttemptRepository attemptRepository;

    @Autowired
    private StudentQuestionRepository studentQuestionRepository;

    @Autowired
    private StudentCodeRepository studentCodeRepository;

    @Autowired
    private SubmissionRepository submissionRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    private User createStudent() {
        return userRepository.saveAndFlush(
                User.builder()
                        .email("codeexec-" + System.nanoTime() + "@codearena.com")
                        .name("Student")
                        .passwordHash(passwordEncoder.encode("pw"))
                        .role(Role.STUDENT)
                        .status(AccountStatus.ACTIVE)
                        .isActive(true)
                        .build());
    }

    /** Sets up a full attempt with one question that has 1 public + 1 hidden test case. */
    private long[] setupAttemptWithQuestion(User student) {
        Question question =
                questionRepository.saveAndFlush(
                        Question.builder().title("Add").statement("Add two numbers").difficulty(Difficulty.EASY).marks(10).build());
        testCaseRepository.saveAndFlush(
                TestCase.builder().questionId(question.getId()).input("3 4").expectedOutput("7").isHidden(false).build());
        testCaseRepository.saveAndFlush(
                TestCase.builder().questionId(question.getId()).input("10 20").expectedOutput("30").isHidden(true).build());

        com.codearena.entity.Test test =
                testRepository.saveAndFlush(
                        com.codearena.entity.Test.builder()
                                .name("T")
                                .startTime(OffsetDateTime.now().minusMinutes(5))
                                .endTime(OffsetDateTime.now().plusHours(2))
                                .durationMinutes(60)
                                .totalMarks(10)
                                .questionsPerStudent(1)
                                .build());

        TestAttempt attempt =
                attemptRepository.saveAndFlush(
                        TestAttempt.builder()
                                .userId(student.getId())
                                .testId(test.getId())
                                .startedAt(OffsetDateTime.now())
                                .expiresAt(OffsetDateTime.now().plusHours(1))
                                .status(AttemptStatus.IN_PROGRESS)
                                .violationCount(0)
                                .score(0)
                                .build());
        studentQuestionRepository.saveAndFlush(
                StudentQuestion.builder().attemptId(attempt.getId()).questionId(question.getId()).position(1).build());

        return new long[] {attempt.getId(), question.getId()};
    }

    private static final String ADD_TWO_NUMBERS_PY = "a, b = map(int, input().split())\nprint(a + b)\n";

    @Test
    void runCaseIsAdHocWithNoPersistence() throws Exception {
        User student = createStudent();
        String token = jwtService.generateToken(student.getId(), Role.STUDENT);
        long[] ids = setupAttemptWithQuestion(student);

        mockMvc.perform(
                        post("/code/run-case")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"attempt_id\":"
                                                + ids[0]
                                                + ",\"question_id\":"
                                                + ids[1]
                                                + ",\"language\":\"python\",\"source_code\":\""
                                                + ADD_TWO_NUMBERS_PY.replace("\n", "\\n")
                                                + "\",\"input\":\"5 6\",\"expected_output\":\"11\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.passed").value(1))
                .andExpect(jsonPath("$.results[0].actual_output").value("11"));

        assertThat(submissionRepository.findByAttemptIdOrderByIdAsc(ids[0])).isEmpty();
        assertThat(studentCodeRepository.findByAttemptIdAndQuestionId(ids[0], ids[1])).isEmpty();
    }

    @Test
    void runCaseOwnershipAsymmetry() throws Exception {
        User student = createStudent();
        User otherStudent = createStudent();
        String studentToken = jwtService.generateToken(student.getId(), Role.STUDENT);
        String otherToken = jwtService.generateToken(otherStudent.getId(), Role.STUDENT);
        long[] ids = setupAttemptWithQuestion(student);

        // Nonexistent attempt -> 404 with the code-execution-specific message.
        mockMvc.perform(
                        post("/code/run-case")
                                .header("Authorization", "Bearer " + studentToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"attempt_id\":999999,\"question_id\":" + ids[1] + ",\"language\":\"python\",\"source_code\":\"x\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Attempt not found. Start the exam before running code."));

        // Existing attempt, wrong owner -> 403, distinct from the 404 case.
        mockMvc.perform(
                        post("/code/run-case")
                                .header("Authorization", "Bearer " + otherToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"attempt_id\":" + ids[0] + ",\"question_id\":" + ids[1] + ",\"language\":\"python\",\"source_code\":\"x\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Attempt does not belong to the current student"));
    }

    @Test
    void runOnlyUsesPublicCasesAndSavesCodeDraft() throws Exception {
        User student = createStudent();
        String token = jwtService.generateToken(student.getId(), Role.STUDENT);
        long[] ids = setupAttemptWithQuestion(student);

        mockMvc.perform(
                        post("/code/run")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"attempt_id\":"
                                                + ids[0]
                                                + ",\"question_id\":"
                                                + ids[1]
                                                + ",\"language\":\"python\",\"source_code\":\""
                                                + ADD_TWO_NUMBERS_PY.replace("\n", "\\n")
                                                + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1)) // only the 1 public case, not the hidden one
                .andExpect(jsonPath("$.passed").value(1));

        assertThat(studentCodeRepository.findByAttemptIdAndQuestionId(ids[0], ids[1])).isPresent();
        assertThat(submissionRepository.findByAttemptIdOrderByIdAsc(ids[0])).isEmpty(); // /run never creates a Submission
    }

    @Test
    void runRejectsQuestionNotAssignedToAttempt() throws Exception {
        User student = createStudent();
        String token = jwtService.generateToken(student.getId(), Role.STUDENT);
        long[] ids = setupAttemptWithQuestion(student);
        Question otherQuestion =
                questionRepository.saveAndFlush(Question.builder().title("Other").statement("s").difficulty(Difficulty.EASY).marks(5).build());

        mockMvc.perform(
                        post("/code/run")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"attempt_id\":"
                                                + ids[0]
                                                + ",\"question_id\":"
                                                + otherQuestion.getId()
                                                + ",\"language\":\"python\",\"source_code\":\"x\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Question is not part of this attempt"));
    }

    @Test
    void submitScoresAgainstAllCasesAndMasksHiddenOnes() throws Exception {
        User student = createStudent();
        String token = jwtService.generateToken(student.getId(), Role.STUDENT);
        long[] ids = setupAttemptWithQuestion(student);

        mockMvc.perform(
                        post("/code/submit")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"attempt_id\":"
                                                + ids[0]
                                                + ",\"question_id\":"
                                                + ids[1]
                                                + ",\"language\":\"python\",\"source_code\":\""
                                                + ADD_TWO_NUMBERS_PY.replace("\n", "\\n")
                                                + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("accepted"))
                .andExpect(jsonPath("$.score").value(10.0))
                .andExpect(jsonPath("$.total_test_cases").value(2))
                .andExpect(jsonPath("$.passed_test_cases").value(2))
                // The hidden case (input "10 20") must be masked in the response.
                .andExpect(jsonPath("$.results[?(@.input == '[Hidden]')]").exists())
                .andExpect(jsonPath("$.results[?(@.input == '3 4')]").exists());

        assertThat(submissionRepository.findByAttemptIdOrderByIdAsc(ids[0])).hasSize(1);
        assertThat(studentCodeRepository.findByAttemptIdAndQuestionId(ids[0], ids[1])).isPresent();
    }

    @Test
    void submitPartialCreditWhenOnlySomeCasesPass() throws Exception {
        User student = createStudent();
        String token = jwtService.generateToken(student.getId(), Role.STUDENT);
        long[] ids = setupAttemptWithQuestion(student);

        // Always prints 7 -- correct only for the public case (3 4 -> 7), wrong for the hidden one (10 20 -> 30).
        String alwaysSeven = "input()\nprint(7)\n";

        mockMvc.perform(
                        post("/code/submit")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"attempt_id\":"
                                                + ids[0]
                                                + ",\"question_id\":"
                                                + ids[1]
                                                + ",\"language\":\"python\",\"source_code\":\""
                                                + alwaysSeven.replace("\n", "\\n")
                                                + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("partial"))
                .andExpect(jsonPath("$.score").value(5.0)); // 1 of 2 cases -> 50% of 10 marks
    }

    @Test
    void submitWithNoTestCasesIs400() throws Exception {
        User student = createStudent();
        String token = jwtService.generateToken(student.getId(), Role.STUDENT);

        Question bare = questionRepository.saveAndFlush(Question.builder().title("Bare").statement("s").difficulty(Difficulty.EASY).marks(5).build());
        com.codearena.entity.Test test =
                testRepository.saveAndFlush(
                        com.codearena.entity.Test.builder()
                                .name("T2")
                                .startTime(OffsetDateTime.now().minusMinutes(5))
                                .endTime(OffsetDateTime.now().plusHours(2))
                                .durationMinutes(60)
                                .totalMarks(5)
                                .questionsPerStudent(1)
                                .build());
        TestAttempt attempt =
                attemptRepository.saveAndFlush(
                        TestAttempt.builder()
                                .userId(student.getId())
                                .testId(test.getId())
                                .startedAt(OffsetDateTime.now())
                                .expiresAt(OffsetDateTime.now().plusHours(1))
                                .status(AttemptStatus.IN_PROGRESS)
                                .violationCount(0)
                                .score(0)
                                .build());
        studentQuestionRepository.saveAndFlush(
                StudentQuestion.builder().attemptId(attempt.getId()).questionId(bare.getId()).position(1).build());

        mockMvc.perform(
                        post("/code/submit")
                                .header("Authorization", "Bearer " + jwtService.generateToken(student.getId(), Role.STUDENT))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"attempt_id\":"
                                                + attempt.getId()
                                                + ",\"question_id\":"
                                                + bare.getId()
                                                + ",\"language\":\"python\",\"source_code\":\"x\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("This question has no test cases configured; submission is not possible"));
    }

    @Test
    void compilerStatusIsPublic() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/code/compiler/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.engine").value("docker"));
    }
}
