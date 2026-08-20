package com.codearena.controller.admin;

import com.codearena.dto.request.QuestionCreate;
import com.codearena.dto.request.TestCaseCreate;
import com.codearena.dto.response.QuestionOut;
import com.codearena.dto.response.TestCaseOut;
import com.codearena.entity.User;
import com.codearena.security.CurrentUserProvider;
import com.codearena.security.RoleGuard;
import com.codearena.service.AdminQuestionService;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin")
public class AdminQuestionController {

    private final AdminQuestionService service;
    private final CurrentUserProvider currentUserProvider;
    private final RoleGuard roleGuard;

    public AdminQuestionController(
            AdminQuestionService service, CurrentUserProvider currentUserProvider, RoleGuard roleGuard) {
        this.service = service;
        this.currentUserProvider = currentUserProvider;
        this.roleGuard = roleGuard;
    }

    private User admin() {
        return roleGuard.requireAdmin(currentUserProvider.get());
    }

    @GetMapping("/questions")
    public List<QuestionOut> list(
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false) String topic,
            @RequestParam(required = false) String search) {
        admin();
        return service.search(difficulty, topic, search);
    }

    @PostMapping("/questions")
    @ResponseStatus(HttpStatus.CREATED)
    public QuestionOut create(@Valid @RequestBody QuestionCreate request) {
        admin();
        return service.create(request);
    }

    @GetMapping("/questions/{id}")
    public QuestionOut get(@PathVariable Long id) {
        admin();
        return service.get(id);
    }

    @PutMapping("/questions/{id}")
    public QuestionOut update(@PathVariable Long id, @RequestBody JsonNode body) {
        admin();
        return service.update(id, body);
    }

    @DeleteMapping("/questions/{id}")
    public Map<String, String> delete(@PathVariable Long id) {
        admin();
        service.delete(id);
        return Map.of("message", "Question deleted");
    }

    @PostMapping("/questions/{id}/test-cases")
    @ResponseStatus(HttpStatus.CREATED)
    public TestCaseOut addTestCase(@PathVariable Long id, @Valid @RequestBody TestCaseCreate request) {
        admin();
        return service.addTestCase(id, request);
    }

    @DeleteMapping("/test-cases/{id}")
    public Map<String, String> deleteTestCase(@PathVariable Long id) {
        admin();
        service.deleteTestCase(id);
        return Map.of("message", "Test case deleted");
    }
}
