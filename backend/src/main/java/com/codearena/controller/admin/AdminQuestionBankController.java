package com.codearena.controller.admin;

import com.codearena.dto.request.QuestionBankCreate;
import com.codearena.dto.request.QuestionBankUpdate;
import com.codearena.dto.response.QuestionBankOut;
import com.codearena.entity.User;
import com.codearena.security.CurrentUserProvider;
import com.codearena.security.RoleGuard;
import com.codearena.service.AdminQuestionBankService;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/question-banks")
public class AdminQuestionBankController {

    private final AdminQuestionBankService service;
    private final CurrentUserProvider currentUserProvider;
    private final RoleGuard roleGuard;

    public AdminQuestionBankController(
            AdminQuestionBankService service, CurrentUserProvider currentUserProvider, RoleGuard roleGuard) {
        this.service = service;
        this.currentUserProvider = currentUserProvider;
        this.roleGuard = roleGuard;
    }

    private User admin() {
        return roleGuard.requireAdmin(currentUserProvider.get());
    }

    @GetMapping
    public List<QuestionBankOut> list() {
        admin();
        return service.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public QuestionBankOut create(@Valid @RequestBody QuestionBankCreate request) {
        admin();
        return service.create(request);
    }

    @GetMapping("/{id}")
    public QuestionBankOut get(@PathVariable Long id) {
        admin();
        return service.get(id);
    }

    @PutMapping("/{id}")
    public QuestionBankOut update(@PathVariable Long id, @RequestBody QuestionBankUpdate request) {
        admin();
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public Map<String, String> delete(@PathVariable Long id) {
        admin();
        service.delete(id);
        return Map.of("message", "Question bank deleted");
    }
}
