package com.codearena.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.codearena.AbstractIntegrationTest;
import com.codearena.entity.QuestionBank;
import com.codearena.entity.TestAttempt;
import com.codearena.entity.User;
import com.codearena.entity.enums.AccountStatus;
import com.codearena.entity.enums.AttemptStatus;
import com.codearena.entity.enums.Role;
import com.codearena.repository.QuestionBankRepository;
import com.codearena.repository.TestAttemptRepository;
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

/** Module 8 verification: admin dashboard, live monitoring, results, violations. */
@SpringBootTest
@AutoConfigureMockMvc
class AdminMonitoringIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private QuestionBankRepository questionBankRepository;

    @Autowired
    private TestRepository testRepository;

    @Autowired
    private TestAttemptRepository attemptRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private ObjectMapper objectMapper;

    private String adminToken() {
        User admin =
                userRepository.saveAndFlush(
                        User.builder()
                                .email("admin-mon-" + System.nanoTime() + "@codearena.com")
                                .name("Admin")
                                .passwordHash(passwordEncoder.encode("pw"))
                                .role(Role.ADMIN)
                                .status(AccountStatus.ACTIVE)
                                .isActive(true)
                                .build());
        return jwtService.generateToken(admin.getId(), Role.ADMIN);
    }

    @Test
    void dashboardBankCountIsZeroButQuestionBanksEndpointComputesLive() throws Exception {
        String token = adminToken();
        QuestionBank bank = questionBankRepository.saveAndFlush(QuestionBank.builder().title("Bank").build());

        MvcResult dashboardResult =
                mockMvc.perform(get("/admin/dashboard").header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andReturn();
        JsonNode dashboard = objectMapper.readTree(dashboardResult.getResponse().getContentAsString());
        JsonNode dashboardBank = findById(dashboard.get("banks"), bank.getId());
        assertThat(dashboardBank).isNotNull();
        // Documented inconsistency: dashboard never computes this live.
        assertThat(dashboardBank.get("question_count").asInt()).isZero();

        mockMvc.perform(get("/admin/question-banks/" + bank.getId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.question_count").value(0)); // still 0 here too (no questions linked), but via live COUNT query
    }

    @Test
    void monitorHasNo404ForMissingTest() throws Exception {
        String token = adminToken();
        // No such test exists at all -- Python's monitor_test never checks
        // test existence, it just returns every active student as not_started.
        mockMvc.perform(get("/admin/tests/999999/monitor").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void resultsIsSequentialRankingNotCompetitionRanking() throws Exception {
        String token = adminToken();
        com.codearena.entity.Test test =
                testRepository.saveAndFlush(
                        com.codearena.entity.Test.builder()
                                .name("RankTest")
                                .startTime(OffsetDateTime.now().minusHours(1))
                                .endTime(OffsetDateTime.now().plusHours(1))
                                .durationMinutes(60)
                                .totalMarks(10)
                                .questionsPerStudent(1)
                                .build());

        // Two students tie at the same score, one has a lower score.
        User s1 = createStudentWithScore(test.getId(), 8);
        User s2 = createStudentWithScore(test.getId(), 8);
        User s3 = createStudentWithScore(test.getId(), 5);

        MvcResult result =
                mockMvc.perform(get("/admin/tests/" + test.getId() + "/results").header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andReturn();
        JsonNode rows = objectMapper.readTree(result.getResponse().getContentAsString());

        assertThat(rows).hasSize(3);
        // Sequential ranking: ties still get consecutive ranks (1, 2, 3), not (1, 1, 3).
        assertThat(rows.get(0).get("rank").asInt()).isEqualTo(1);
        assertThat(rows.get(1).get("rank").asInt()).isEqualTo(2);
        assertThat(rows.get(2).get("rank").asInt()).isEqualTo(3);
        // Highest scores come first.
        assertThat(rows.get(2).get("score").asDouble()).isEqualTo(5.0);
    }

    @Test
    void nonExistentTestResultsIs404() throws Exception {
        String token = adminToken();
        mockMvc.perform(get("/admin/tests/999999/results").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Test not found"));
    }

    @Test
    void violationsListFiltersByTestAndStudent() throws Exception {
        String adminTok = adminToken();
        com.codearena.entity.Test test =
                testRepository.saveAndFlush(
                        com.codearena.entity.Test.builder()
                                .name("ViolTest")
                                .startTime(OffsetDateTime.now().minusMinutes(30))
                                .endTime(OffsetDateTime.now().plusHours(1))
                                .durationMinutes(60)
                                .totalMarks(10)
                                .questionsPerStudent(1)
                                .build());
        User student =
                userRepository.saveAndFlush(
                        User.builder()
                                .email("viol-" + System.nanoTime() + "@codearena.com")
                                .name("Violator")
                                .passwordHash(passwordEncoder.encode("pw"))
                                .role(Role.STUDENT)
                                .status(AccountStatus.ACTIVE)
                                .isActive(true)
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
        String studentToken = jwtService.generateToken(student.getId(), Role.STUDENT);

        mockMvc.perform(
                        post("/student/attempts/" + attempt.getId() + "/violations")
                                .header("Authorization", "Bearer " + studentToken)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"violation_type\":\"copy_attempt\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(
                        get("/admin/violations")
                                .param("test_id", String.valueOf(test.getId()))
                                .param("student_id", String.valueOf(student.getId()))
                                .header("Authorization", "Bearer " + adminTok))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].violation_type").value("copy_attempt"));

        mockMvc.perform(
                        get("/admin/violations")
                                .param("violation_type", "face_turned")
                                .header("Authorization", "Bearer " + adminTok))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    private User createStudentWithScore(Long testId, int score) {
        User student =
                userRepository.saveAndFlush(
                        User.builder()
                                .email("rank-" + System.nanoTime() + "@codearena.com")
                                .name("Ranked")
                                .passwordHash(passwordEncoder.encode("pw"))
                                .role(Role.STUDENT)
                                .status(AccountStatus.ACTIVE)
                                .isActive(true)
                                .build());
        attemptRepository.saveAndFlush(
                TestAttempt.builder()
                        .userId(student.getId())
                        .testId(testId)
                        .startedAt(OffsetDateTime.now())
                        .expiresAt(OffsetDateTime.now().plusHours(1))
                        .status(AttemptStatus.SUBMITTED)
                        .submittedAt(OffsetDateTime.now())
                        .violationCount(0)
                        .score(score)
                        .build());
        return student;
    }

    private JsonNode findById(JsonNode array, Long id) {
        for (JsonNode n : array) {
            if (n.get("id").asLong() == id) {
                return n;
            }
        }
        return null;
    }
}
