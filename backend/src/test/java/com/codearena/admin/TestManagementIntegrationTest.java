package com.codearena.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.codearena.AbstractIntegrationTest;
import com.codearena.entity.Question;
import com.codearena.entity.User;
import com.codearena.entity.enums.AccountStatus;
import com.codearena.entity.enums.Difficulty;
import com.codearena.entity.enums.Role;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.UserRepository;
import com.codearena.security.JwtService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** Module 4 verification: test creation cross-field validation, pool-size checks, update semantics. */
@SpringBootTest
@AutoConfigureMockMvc
class TestManagementIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private QuestionRepository questionRepository;

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
                                .email("admin-tm-" + System.nanoTime() + "@codearena.com")
                                .name("Admin")
                                .passwordHash(passwordEncoder.encode("pw"))
                                .role(Role.ADMIN)
                                .status(AccountStatus.ACTIVE)
                                .isActive(true)
                                .build());
        return jwtService.generateToken(admin.getId(), Role.ADMIN);
    }

    private long createQuestion(String title, Difficulty difficulty) {
        Question q =
                questionRepository.saveAndFlush(
                        Question.builder().title(title).statement("stmt").difficulty(difficulty).marks(10).build());
        return q.getId();
    }

    private String iso(OffsetDateTime dt) {
        return dt.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    @Test
    void endTimeBeforeStartTimeIs422() throws Exception {
        String token = adminToken();
        OffsetDateTime start = OffsetDateTime.now().plusHours(1);
        OffsetDateTime end = start.minusMinutes(30);
        String body =
                "{\"name\":\"T\",\"start_time\":\""
                        + iso(start)
                        + "\",\"end_time\":\""
                        + iso(end)
                        + "\",\"duration_minutes\":10,\"total_marks\":10,\"questions_per_student\":1}";

        mockMvc.perform(
                        post("/admin/tests")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void durationExceedingWindowIs422() throws Exception {
        String token = adminToken();
        OffsetDateTime start = OffsetDateTime.now().plusHours(1);
        OffsetDateTime end = start.plusMinutes(30);
        String body =
                "{\"name\":\"T\",\"start_time\":\""
                        + iso(start)
                        + "\",\"end_time\":\""
                        + iso(end)
                        + "\",\"duration_minutes\":60,\"total_marks\":10,\"questions_per_student\":1}";

        mockMvc.perform(
                        post("/admin/tests")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void difficultyCountsExceedingQpsIs422() throws Exception {
        String token = adminToken();
        OffsetDateTime start = OffsetDateTime.now().plusHours(1);
        OffsetDateTime end = start.plusHours(2);
        String body =
                "{\"name\":\"T\",\"start_time\":\""
                        + iso(start)
                        + "\",\"end_time\":\""
                        + iso(end)
                        + "\",\"duration_minutes\":30,\"total_marks\":10,\"questions_per_student\":1,"
                        + "\"easy_count\":1,\"medium_count\":1}";

        mockMvc.perform(
                        post("/admin/tests")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void poolSmallerThanQuestionsPerStudentIs400() throws Exception {
        String token = adminToken();
        long q1 = createQuestion("Q1", Difficulty.EASY);
        OffsetDateTime start = OffsetDateTime.now().plusHours(1);
        OffsetDateTime end = start.plusHours(2);
        String body =
                "{\"name\":\"T\",\"start_time\":\""
                        + iso(start)
                        + "\",\"end_time\":\""
                        + iso(end)
                        + "\",\"duration_minutes\":30,\"total_marks\":10,\"questions_per_student\":2,"
                        + "\"question_ids\":["
                        + q1
                        + "]}";

        mockMvc.perform(
                        post("/admin/tests")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Question pool has 1 questions but test requires 2 per student"));
    }

    @Test
    void nonExistentQuestionIdIs400() throws Exception {
        String token = adminToken();
        OffsetDateTime start = OffsetDateTime.now().plusHours(1);
        OffsetDateTime end = start.plusHours(2);
        String body =
                "{\"name\":\"T\",\"start_time\":\""
                        + iso(start)
                        + "\",\"end_time\":\""
                        + iso(end)
                        + "\",\"duration_minutes\":30,\"total_marks\":10,\"questions_per_student\":1,"
                        + "\"question_ids\":[999999999]}";

        mockMvc.perform(
                        post("/admin/tests")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("One or more question ids do not exist"));
    }

    @Test
    void createThenUpdateWithoutCrossFieldRevalidationAndFullReplaceQuestionIds() throws Exception {
        String token = adminToken();
        long q1 = createQuestion("Q1", Difficulty.EASY);
        long q2 = createQuestion("Q2", Difficulty.EASY);
        OffsetDateTime start = OffsetDateTime.now().plusHours(1);
        OffsetDateTime end = start.plusHours(2);
        String createBody =
                "{\"name\":\"T\",\"start_time\":\""
                        + iso(start)
                        + "\",\"end_time\":\""
                        + iso(end)
                        + "\",\"duration_minutes\":30,\"total_marks\":10,\"questions_per_student\":1,"
                        + "\"question_ids\":["
                        + q1
                        + "]}";

        MvcResult created =
                mockMvc.perform(
                                post("/admin/tests")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(createBody))
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.allowed_languages[0]").value("python"))
                        .andExpect(jsonPath("$.question_count").value(1))
                        .andReturn();
        JsonNode json = objectMapper.readTree(created.getResponse().getContentAsString());
        long id = json.get("id").asLong();

        // Update: end_time <= start_time would normally be invalid, but
        // TestUpdate has NO cross-field re-validation -- only the pool-size
        // check runs, and only if question_ids is provided.
        mockMvc.perform(
                        put("/admin/tests/" + id)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"question_ids\":[" + q1 + "," + q2 + "],\"total_marks\":99}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total_marks").value(99))
                .andExpect(jsonPath("$.question_count").value(2));
    }
}
