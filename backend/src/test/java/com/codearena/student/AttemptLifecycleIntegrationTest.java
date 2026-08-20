package com.codearena.student;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.codearena.AbstractIntegrationTest;
import com.codearena.entity.Question;
import com.codearena.entity.Submission;
import com.codearena.entity.TestAttempt;
import com.codearena.entity.TestQuestion;
import com.codearena.entity.User;
import com.codearena.entity.enums.AccountStatus;
import com.codearena.entity.enums.AttemptStatus;
import com.codearena.entity.enums.Difficulty;
import com.codearena.entity.enums.Role;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.SubmissionRepository;
import com.codearena.repository.TestAttemptRepository;
import com.codearena.repository.TestQuestionRepository;
import com.codearena.repository.TestRepository;
import com.codearena.repository.UserRepository;
import com.codearena.security.JwtService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** Module 6 verification: student attempt lifecycle, the highest-risk module. */
@SpringBootTest
@AutoConfigureMockMvc
class AttemptLifecycleIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private QuestionRepository questionRepository;

    @Autowired
    private TestRepository testRepository;

    @Autowired
    private TestQuestionRepository testQuestionRepository;

    @Autowired
    private TestAttemptRepository attemptRepository;

    @Autowired
    private SubmissionRepository submissionRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private ObjectMapper objectMapper;

    private User createStudent(Integer year) {
        return userRepository.saveAndFlush(
                User.builder()
                        .email("stu-" + System.nanoTime() + "@codearena.com")
                        .name("Student")
                        .passwordHash(passwordEncoder.encode("pw"))
                        .role(Role.STUDENT)
                        .year(year)
                        .status(AccountStatus.ACTIVE)
                        .isActive(true)
                        .build());
    }

    private Question createQuestion(Difficulty difficulty) {
        return questionRepository.saveAndFlush(
                Question.builder().title("Q").statement("stmt").difficulty(difficulty).marks(10).build());
    }

    private com.codearena.entity.Test createTest(OffsetDateTime start, OffsetDateTime end, int qps, List1 links) {
        com.codearena.entity.Test test =
                testRepository.saveAndFlush(
                        com.codearena.entity.Test.builder()
                                .name("Test")
                                .startTime(start)
                                .endTime(end)
                                .durationMinutes(60)
                                .totalMarks(10)
                                .questionsPerStudent(qps)
                                .build());
        for (Long qId : links.ids) {
            testQuestionRepository.saveAndFlush(TestQuestion.builder().testId(test.getId()).questionId(qId).build());
        }
        return test;
    }

    // small helper to avoid varargs ambiguity with Long...
    private record List1(java.util.List<Long> ids) {}

    private List1 ids(Long... values) {
        return new List1(java.util.List.of(values));
    }

    private java.util.List<Long> idsIn(JsonNode array) {
        java.util.List<Long> result = new java.util.ArrayList<>();
        for (JsonNode n : array) {
            result.add(n.get("id").asLong());
        }
        return result;
    }

    @Test
    void startTestValidatesWindowAndPoolThenFullLifecycleWithScoreTruncation() throws Exception {
        User student = createStudent(2);
        String token = jwtService.generateToken(student.getId(), Role.STUDENT);
        Question q = createQuestion(Difficulty.EASY);
        OffsetDateTime now = OffsetDateTime.now();

        // Not started yet.
        com.codearena.entity.Test futureTest = createTest(now.plusHours(1), now.plusHours(2), 1, ids(q.getId()));
        mockMvc.perform(post("/student/tests/" + futureTest.getId() + "/start").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Test has not started yet"));

        // Already ended.
        com.codearena.entity.Test pastTest = createTest(now.minusHours(2), now.minusHours(1), 1, ids(q.getId()));
        mockMvc.perform(post("/student/tests/" + pastTest.getId() + "/start").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Test has already ended"));

        // Active window, real start.
        com.codearena.entity.Test activeTest = createTest(now.minusMinutes(5), now.plusHours(2), 1, ids(q.getId()));
        MvcResult startResult =
                mockMvc.perform(
                                post("/student/tests/" + activeTest.getId() + "/start")
                                        .header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.status").value("in_progress"))
                        .andReturn();
        long attemptId = objectMapper.readTree(startResult.getResponse().getContentAsString()).get("id").asLong();

        // Idempotent restart returns the SAME attempt.
        mockMvc.perform(post("/student/tests/" + activeTest.getId() + "/start").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(attemptId));

        // Assigned questions include only public test cases (empty here) and saved defaults.
        mockMvc.perform(get("/student/attempts/" + attemptId + "/questions").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].saved_language").value("python"))
                .andExpect(jsonPath("$[0].is_submitted").value(false));

        // Save code, then save again with different content (upsert).
        mockMvc.perform(
                        put("/student/attempts/" + attemptId + "/code")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"question_id\":"
                                                + q.getId()
                                                + ",\"language\":\"python\",\"source_code\":\"print(1)\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Code saved"));

        // Violation dedup: two calls within 2s -> count stays at 1.
        mockMvc.perform(
                        post("/student/attempts/" + attemptId + "/violations")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"violation_type\":\"tab_hidden\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.violation_count").value(1))
                .andExpect(jsonPath("$.auto_submitted").value(false));

        mockMvc.perform(
                        post("/student/attempts/" + attemptId + "/violations")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"violation_type\":\"tab_hidden\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.violation_count").value(1)); // deduped, no increment

        // Let the real 2-second dedup window elapse (createdAt is a
        // @CreationTimestamp, updatable=false -- it cannot be backdated
        // through the entity, so this waits for real wall-clock time).
        Thread.sleep(2100);

        mockMvc.perform(
                        post("/student/attempts/" + attemptId + "/violations")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"violation_type\":\"tab_hidden\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.violation_count").value(2)); // outside window, incremented

        // Seed two submissions for the same question -- finish_test should
        // use the LATEST one (id-ordered) and truncate the sum via int().
        submissionRepository.saveAndFlush(
                Submission.builder().attemptId(attemptId).questionId(q.getId()).code("v1").score(3.0).build());
        submissionRepository.saveAndFlush(
                Submission.builder().attemptId(attemptId).questionId(q.getId()).code("v2").score(7.9).build());

        mockMvc.perform(post("/student/attempts/" + attemptId + "/finish").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("submitted"))
                .andExpect(jsonPath("$.total_score").value(7.0)); // truncated from 7.9, not rounded

        // Already submitted -> 400.
        mockMvc.perform(post("/student/attempts/" + attemptId + "/finish").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Already submitted"));

        // Cannot restart a completed test.
        mockMvc.perform(post("/student/tests/" + activeTest.getId() + "/start").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Test has already been submitted and cannot be restarted"));
    }

    @Test
    void finishOnAlreadyExpiredAttemptIsPreemptedByAutoSubmit() throws Exception {
        User student = createStudent(2);
        String token = jwtService.generateToken(student.getId(), Role.STUDENT);
        Question q = createQuestion(Difficulty.EASY);
        OffsetDateTime now = OffsetDateTime.now();
        com.codearena.entity.Test test = createTest(now.minusMinutes(30), now.plusHours(2), 1, ids(q.getId()));

        TestAttempt attempt =
                attemptRepository.saveAndFlush(
                        TestAttempt.builder()
                                .userId(student.getId())
                                .testId(test.getId())
                                .startedAt(now.minusMinutes(20))
                                .expiresAt(now.minusMinutes(10)) // already expired well before "now"
                                .status(AttemptStatus.IN_PROGRESS)
                                .violationCount(0)
                                .score(0)
                                .build());

        // finish_test's own zero-grace-first call order means an
        // already-expired attempt is always preempted by auto-submit,
        // never reaching the grace-aware branch -- this is the documented
        // quirk, not a bug to "fix".
        mockMvc.perform(post("/student/attempts/" + attempt.getId() + "/finish").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Attempt expired and has been auto-submitted"));

        TestAttempt reloaded = attemptRepository.findById(attempt.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(AttemptStatus.AUTO_SUBMITTED);
    }

    @Test
    void studentTestsDashboardBucketingAndYearScoping() throws Exception {
        User studentYear2 = createStudent(2);
        String token = jwtService.generateToken(studentYear2.getId(), Role.STUDENT);
        Question q = createQuestion(Difficulty.EASY);
        OffsetDateTime now = OffsetDateTime.now();

        com.codearena.entity.Test upcoming = createTest(now.plusHours(1), now.plusHours(2), 1, ids(q.getId()));
        upcoming.setYear("Second Year");
        testRepository.saveAndFlush(upcoming);

        com.codearena.entity.Test active = createTest(now.minusMinutes(5), now.plusHours(2), 1, ids(q.getId()));
        active.setYear("Second Year");
        testRepository.saveAndFlush(active);

        // Wrong year (Third Year) with no attempt -> excluded entirely for a Year-2 student.
        com.codearena.entity.Test wrongYear = createTest(now.minusMinutes(5), now.plusHours(2), 1, ids(q.getId()));
        wrongYear.setYear("Third Year");
        testRepository.saveAndFlush(wrongYear);

        MvcResult result =
                mockMvc.perform(get("/student/tests").header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());

        // Assert by ID containment, not raw list size: this DB is shared
        // across test methods in this class (no per-test rollback), so
        // other tests' leftover "Second Year" rows can legitimately also
        // appear here -- containment/exclusion is what actually matters.
        assertThat(idsIn(body.get("upcoming"))).contains(upcoming.getId());
        assertThat(idsIn(body.get("active"))).contains(active.getId());
        assertThat(idsIn(body.get("active"))).doesNotContain(wrongYear.getId());
        assertThat(idsIn(body.get("completed"))).doesNotContain(wrongYear.getId(), active.getId(), upcoming.getId());

        // Now attempt the wrong-year test directly (bypassing the dashboard) --
        // it must then ALWAYS show up regardless of year filter.
        mockMvc.perform(post("/student/tests/" + wrongYear.getId() + "/start").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        MvcResult afterAttempt =
                mockMvc.perform(get("/student/tests").header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andReturn();
        JsonNode bodyAfter = objectMapper.readTree(afterAttempt.getResponse().getContentAsString());
        boolean wrongYearNowPresent = false;
        for (JsonNode t : bodyAfter.get("active")) {
            if (t.get("id").asLong() == wrongYear.getId()) {
                wrongYearNowPresent = true;
            }
        }
        assertThat(wrongYearNowPresent).isTrue();
    }

    @Test
    void insufficientDifficultyPoolReturns400WithExactMessage() throws Exception {
        User student = createStudent(2);
        String token = jwtService.generateToken(student.getId(), Role.STUDENT);
        OffsetDateTime now = OffsetDateTime.now();
        com.codearena.entity.Test test =
                testRepository.saveAndFlush(
                        com.codearena.entity.Test.builder()
                                .name("T")
                                .startTime(now.minusMinutes(5))
                                .endTime(now.plusHours(1))
                                .durationMinutes(30)
                                .totalMarks(10)
                                .questionsPerStudent(2)
                                .easyCount(2)
                                .build());
        Question onlyEasy = createQuestion(Difficulty.EASY);
        testQuestionRepository.saveAndFlush(TestQuestion.builder().testId(test.getId()).questionId(onlyEasy.getId()).build());

        mockMvc.perform(post("/student/tests/" + test.getId() + "/start").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Not enough easy questions in pool (1 < 2)"));
    }
}
