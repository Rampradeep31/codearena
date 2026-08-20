package com.codearena.controller.admin;

import com.codearena.dto.request.TestCreate;
import com.codearena.dto.response.TestOut;
import com.codearena.entity.User;
import com.codearena.security.CurrentUserProvider;
import com.codearena.security.RoleGuard;
import com.codearena.service.AdminTestService;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/tests")
public class AdminTestController {

    private final AdminTestService service;
    private final CurrentUserProvider currentUserProvider;
    private final RoleGuard roleGuard;

    public AdminTestController(AdminTestService service, CurrentUserProvider currentUserProvider, RoleGuard roleGuard) {
        this.service = service;
        this.currentUserProvider = currentUserProvider;
        this.roleGuard = roleGuard;
    }

    private User admin() {
        return roleGuard.requireAdmin(currentUserProvider.get());
    }

    @GetMapping
    public List<TestOut> list() {
        admin();
        return service.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TestOut create(@Valid @RequestBody TestCreate request) {
        admin();
        return service.create(request);
    }

    @PutMapping("/{id}")
    public TestOut update(@PathVariable Long id, @RequestBody JsonNode body) {
        admin();
        return service.update(id, body);
    }

    @DeleteMapping("/{id}")
    public Map<String, String> delete(@PathVariable Long id) {
        admin();
        service.delete(id);
        return Map.of("message", "Test deleted");
    }
}
