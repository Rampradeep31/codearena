package com.codearena.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.codearena.AbstractIntegrationTest;
import com.codearena.entity.User;
import com.codearena.entity.enums.AccountStatus;
import com.codearena.entity.enums.Role;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.UserRepository;
import com.codearena.security.JwtService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** Module 3 verification: admin CRUD for question banks, questions/test-cases, students. */
@SpringBootTest
@AutoConfigureMockMvc
class AdminCrudIntegrationTest extends AbstractIntegrationTest {

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
                                .email("admin-" + System.nanoTime() + "@codearena.com")
                                .name("Admin")
                                .passwordHash(passwordEncoder.encode("pw"))
                                .role(Role.ADMIN)
                                .status(AccountStatus.ACTIVE)
                                .isActive(true)
                                .build());
        return jwtService.generateToken(admin.getId(), Role.ADMIN);
    }

    // ---- Question Banks ----

    @Test
    void questionBankCrudAndIfNotNoneUpdateSemantics() throws Exception {
        String token = adminToken();

        MvcResult created =
                mockMvc.perform(
                                post("/admin/question-banks")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"title\":\"Bank A\"}"))
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.year").value("Second Year"))
                        .andExpect(jsonPath("$.status").value("Active"))
                        .andExpect(jsonPath("$.question_count").value(0))
                        .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asLong();

        // Explicit null on "description" must be a no-op (if-not-None semantics),
        // unlike most other PUT endpoints in this app.
        mockMvc.perform(
                        put("/admin/question-banks/" + id)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"title\":\"Bank A Renamed\",\"description\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Bank A Renamed"));

        mockMvc.perform(get("/admin/question-banks/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Bank A Renamed"));

        mockMvc.perform(delete("/admin/question-banks/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Question bank deleted"));

        mockMvc.perform(get("/admin/question-banks/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Question bank not found"));
    }

    // ---- Questions + Test Cases ----

    @Test
    void questionCrudWithTestCasesFullReplaceOnlyWhenKeyPresent() throws Exception {
        String token = adminToken();

        String createBody =
                "{\"title\":\"Reverse\",\"statement\":\"Reverse a string\",\"difficulty\":\"easy\","
                        + "\"test_cases\":[{\"input\":\"abc\",\"expected_output\":\"cba\",\"is_hidden\":false}]}";
        MvcResult created =
                mockMvc.perform(
                                post("/admin/questions")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(createBody))
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.topic").value("General"))
                        .andExpect(jsonPath("$.test_cases.length()").value(1))
                        .andReturn();
        JsonNode createdJson = objectMapper.readTree(created.getResponse().getContentAsString());
        long id = createdJson.get("id").asLong();

        // Update WITHOUT the test_cases key: existing test cases must survive untouched.
        mockMvc.perform(
                        put("/admin/questions/" + id)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"marks\":25}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.marks").value(25))
                .andExpect(jsonPath("$.test_cases.length()").value(1));

        // Update WITH the test_cases key: full replace, even with a smaller set.
        mockMvc.perform(
                        put("/admin/questions/" + id)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"test_cases\":[{\"input\":\"x\",\"expected_output\":\"y\",\"is_hidden\":true}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.test_cases.length()").value(1))
                .andExpect(jsonPath("$.test_cases[0].is_hidden").value(true))
                .andExpect(jsonPath("$.test_cases[0].input").value("x"));

        // question_bank_id: empty-string coerces to null.
        mockMvc.perform(
                        put("/admin/questions/" + id)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"question_bank_id\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.question_bank_id").doesNotExist());

        // Add + delete a standalone test case.
        MvcResult tcCreated =
                mockMvc.perform(
                                post("/admin/questions/" + id + "/test-cases")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{\"input\":\"p\",\"expected_output\":\"q\"}"))
                        .andExpect(status().isCreated())
                        .andReturn();
        long tcId = objectMapper.readTree(tcCreated.getResponse().getContentAsString()).get("id").asLong();

        mockMvc.perform(delete("/admin/test-cases/" + tcId).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Test case deleted"));

        mockMvc.perform(delete("/admin/test-cases/999999").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Test case not found"));

        mockMvc.perform(delete("/admin/questions/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Question deleted"));
    }

    @Test
    void invalidDifficultyIs422() throws Exception {
        String token = adminToken();
        mockMvc.perform(
                        post("/admin/questions")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"title\":\"X\",\"statement\":\"Y\",\"difficulty\":\"impossible\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    // ---- Students ----

    @Test
    void studentCrudAndPartialUpdateSemantics() throws Exception {
        String token = adminToken();

        MvcResult created =
                mockMvc.perform(
                                post("/admin/students")
                                        .header("Authorization", "Bearer " + token)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                "{\"name\":\"Carol\",\"register_number\":\"CRUD1\","
                                                        + "\"email\":\"crud1@codearena.com\"}"))
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.role").value("student"))
                        .andExpect(jsonPath("$.status").value("active"))
                        .andReturn();
        long id = objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asLong();

        // Duplicate register_number/email -> 400.
        mockMvc.perform(
                        post("/admin/students")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"name\":\"Dup\",\"register_number\":\"CRUD1\","
                                                + "\"email\":\"other@codearena.com\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Register number or email already exists"));

        // Invalid status value -> 400 with the exact message.
        mockMvc.perform(
                        put("/admin/students/" + id)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"status\":\"banned\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("status must be 'active' or 'inactive'"));

        // Valid deactivation, reflected as the REAL status (not hardcoded "active").
        mockMvc.perform(
                        put("/admin/students/" + id)
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"status\":\"inactive\",\"name\":\"Carol Updated\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("inactive"))
                .andExpect(jsonPath("$.name").value("Carol Updated"));

        assertThat(userRepository.findById(id).orElseThrow().getIsActive()).isFalse();

        mockMvc.perform(delete("/admin/students/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Student deleted"));

        mockMvc.perform(delete("/admin/students/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Student not found"));
    }

    @Test
    void csvImportAccumulatesErrorsAndNeverTopLevelFails() throws Exception {
        String token = adminToken();
        String csv =
                "name,register_number,email,department,year,section,password\n"
                        + "Import One,IMP001,imp1@codearena.com,CS,2,A,\n"
                        + "Import Two,IMP001,imp2@codearena.com,CS,2,A,\n" // duplicate reg number within file
                        + ",IMP003,imp3@codearena.com,CS,2,A,\n" // missing name
                        + "Bad Year,IMP004,imp4@codearena.com,CS,notanumber,A,\n"; // bad year -> row error

        MockMultipartFile file =
                new MockMultipartFile("file", "students.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/admin/students/import").file(file).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(1))
                .andExpect(jsonPath("$.errors.length()").value(3))
                .andExpect(jsonPath("$.generated_passwords.length()").value(1));

        assertThat(userRepository.findByRegisterNumber("IMP001")).isPresent();
    }
}
