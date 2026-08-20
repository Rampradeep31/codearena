package com.codearena.controller.admin;

import com.codearena.dto.request.StudentCreate;
import com.codearena.dto.response.StudentImportResult;
import com.codearena.dto.response.UserOut;
import com.codearena.entity.User;
import com.codearena.security.CurrentUserProvider;
import com.codearena.security.RoleGuard;
import com.codearena.service.AdminStudentService;
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
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/admin/students")
public class AdminStudentController {

    private final AdminStudentService service;
    private final CurrentUserProvider currentUserProvider;
    private final RoleGuard roleGuard;

    public AdminStudentController(
            AdminStudentService service, CurrentUserProvider currentUserProvider, RoleGuard roleGuard) {
        this.service = service;
        this.currentUserProvider = currentUserProvider;
        this.roleGuard = roleGuard;
    }

    private User admin() {
        return roleGuard.requireAdmin(currentUserProvider.get());
    }

    @GetMapping
    public List<UserOut> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) Integer year) {
        admin();
        return service.search(search, department, year);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserOut create(@Valid @RequestBody StudentCreate request) {
        admin();
        return service.create(request);
    }

    @PutMapping("/{id}")
    public UserOut update(@PathVariable Long id, @RequestBody JsonNode body) {
        admin();
        return service.update(id, body);
    }

    @DeleteMapping("/{id}")
    public Map<String, String> delete(@PathVariable Long id) {
        admin();
        service.delete(id);
        return Map.of("message", "Student deleted");
    }

    @PostMapping("/import")
    public StudentImportResult importCsv(@RequestParam("file") MultipartFile file) {
        admin();
        return service.importCsv(file);
    }
}
