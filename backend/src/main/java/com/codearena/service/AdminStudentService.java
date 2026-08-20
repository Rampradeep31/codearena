package com.codearena.service;

import com.codearena.dto.request.StudentCreate;
import com.codearena.dto.response.StudentImportResult;
import com.codearena.dto.response.UserOut;
import com.codearena.entity.User;
import com.codearena.entity.enums.AccountStatus;
import com.codearena.entity.enums.Role;
import com.codearena.exception.ApiException;
import com.codearena.repository.UserRepository;
import com.codearena.util.TokenGenerator;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class AdminStudentService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminStudentService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<UserOut> search(String search, String department, Integer year) {
        return userRepository.searchStudents(Role.STUDENT, blankToNull(search), blankToNull(department), year).stream()
                .map(this::toUserOutActualStatus)
                .toList();
    }

    public UserOut create(StudentCreate request) {
        if (userRepository.existsByRegisterNumberOrEmail(request.getRegisterNumber(), request.getEmail())) {
            throw ApiException.badRequest("Register number or email already exists");
        }
        String password = request.getPassword() != null ? request.getPassword() : TokenGenerator.tokenUrlsafe(12);
        User user =
                User.builder()
                        .name(request.getName())
                        .registerNumber(request.getRegisterNumber())
                        .email(request.getEmail())
                        .department(request.getDepartment())
                        .year(request.getYear())
                        .section(request.getSection())
                        .passwordHash(passwordEncoder.encode(password))
                        .role(Role.STUDENT)
                        .status(AccountStatus.ACTIVE)
                        .isActive(true)
                        .build();
        user = userRepository.saveAndFlush(user);
        return toUserOutHardcoded(user);
    }

    @Transactional
    public UserOut update(Long id, JsonNode body) {
        User student = findStudentOrThrow(id);

        if (body.has("password") && !body.get("password").isNull()) {
            student.setPasswordHash(passwordEncoder.encode(body.get("password").asText()));
        }
        if (body.has("status")) {
            String statusStr = body.get("status").isNull() ? null : body.get("status").asText();
            if (!"active".equals(statusStr) && !"inactive".equals(statusStr)) {
                throw ApiException.badRequest("status must be 'active' or 'inactive'");
            }
            student.setStatus(AccountStatus.fromDbValue(statusStr));
            student.setIsActive("active".equals(statusStr));
        }
        if (body.has("name")) student.setName(body.get("name").asText());
        if (body.has("email")) student.setEmail(body.get("email").asText());
        if (body.has("department")) student.setDepartment(textOrNull(body.get("department")));
        if (body.has("year")) student.setYear(body.get("year").isNull() ? null : body.get("year").asInt());
        if (body.has("section")) student.setSection(textOrNull(body.get("section")));

        student = userRepository.saveAndFlush(student);
        return toUserOutActualStatus(student);
    }

    public void delete(Long id) {
        userRepository.delete(findStudentOrThrow(id));
    }

    @Transactional
    public StudentImportResult importCsv(MultipartFile file) {
        List<String> errors = new ArrayList<>();
        List<String> generatedPasswords = new ArrayList<>();
        int created = 0;
        Set<String> seenRegNumbers = new HashSet<>();
        Set<String> seenEmails = new HashSet<>();

        try (InputStreamReader reader = new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8);
                CSVParser parser =
                        CSVParser.parse(
                                reader, CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).build())) {

            int rowIndex = 1;
            for (CSVRecord record : parser) {
                rowIndex++;
                try {
                    String name = safeGet(record, "name");
                    String regNo = safeGet(record, "register_number");
                    if (regNo.isBlank() || name.isBlank()) {
                        errors.add("Row " + rowIndex + ": register_number and name are required");
                        continue;
                    }
                    if (!seenRegNumbers.add(regNo)) {
                        errors.add("Row " + rowIndex + ": " + regNo + " is a duplicate within the file");
                        continue;
                    }
                    String email = safeGet(record, "email");
                    if (!email.isBlank() && !seenEmails.add(email)) {
                        errors.add("Row " + rowIndex + ": " + email + " is a duplicate within the file");
                        continue;
                    }
                    if (userRepository.existsByRegisterNumberOrEmail(regNo, email.isBlank() ? "\0no-match\0" : email)) {
                        errors.add("Row " + rowIndex + ": " + regNo + " already exists");
                        continue;
                    }

                    String yearStr = safeGet(record, "year");
                    Integer year = yearStr.isBlank() ? null : Integer.parseInt(yearStr.trim());

                    String department = safeGet(record, "department");
                    String section = safeGet(record, "section");
                    String password = safeGet(record, "password");
                    String finalPassword;
                    if (!password.isBlank()) {
                        finalPassword = password;
                    } else {
                        finalPassword = TokenGenerator.tokenUrlsafe(12);
                        generatedPasswords.add(regNo + ": " + finalPassword);
                    }
                    String finalEmail = email.isBlank() ? regNo.toLowerCase() + "@codearena.com" : email;

                    User user =
                            User.builder()
                                    .name(name)
                                    .registerNumber(regNo)
                                    .email(finalEmail)
                                    .department(department.isBlank() ? null : department)
                                    .year(year)
                                    .section(section.isBlank() ? null : section)
                                    .passwordHash(passwordEncoder.encode(finalPassword))
                                    .role(Role.STUDENT)
                                    .status(AccountStatus.ACTIVE)
                                    .isActive(true)
                                    .build();
                    userRepository.save(user);
                    created++;
                } catch (Exception rowEx) {
                    errors.add("Row " + rowIndex + ": " + rowEx.getMessage());
                }
            }
            userRepository.flush();
        } catch (IOException e) {
            throw new ApiException(
                    org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");
        }

        return new StudentImportResult(created, errors, generatedPasswords);
    }

    private String safeGet(CSVRecord record, String column) {
        try {
            String v = record.get(column);
            return v == null ? "" : v.trim();
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    private User findStudentOrThrow(Long id) {
        return userRepository
                .findById(id)
                .filter(u -> u.getRole() == Role.STUDENT)
                .orElseThrow(() -> ApiException.notFound("Student not found"));
    }

    private String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value;
    }

    private String textOrNull(JsonNode node) {
        return node.isNull() ? null : node.asText();
    }

    private UserOut toUserOutHardcoded(User user) {
        return new UserOut(
                user.getId(),
                user.getEmail(),
                user.getRegisterNumber(),
                user.getName(),
                "student",
                user.getDepartment(),
                user.getYear(),
                user.getSection(),
                "active");
    }

    private UserOut toUserOutActualStatus(User user) {
        return new UserOut(
                user.getId(),
                user.getEmail(),
                user.getRegisterNumber(),
                user.getName(),
                "student",
                user.getDepartment(),
                user.getYear(),
                user.getSection(),
                user.getStatus().dbValue());
    }
}
