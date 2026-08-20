package com.codearena.service;

import com.codearena.dto.request.LoginRequest;
import com.codearena.dto.request.StudentEntryRequest;
import com.codearena.dto.response.LoginResponse;
import com.codearena.dto.response.UserOut;
import com.codearena.entity.User;
import com.codearena.entity.enums.AccountStatus;
import com.codearena.entity.enums.Role;
import com.codearena.exception.ApiException;
import com.codearena.repository.UserRepository;
import com.codearena.security.JwtService;
import com.codearena.util.PythonTruthy;
import com.codearena.util.TokenGenerator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
public class AuthService {

    private static final Pattern DIGITS = Pattern.compile("\\d+");

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public LoginResponse login(LoginRequest request) {
        try {
            String target = request.getEmail() == null ? "" : request.getEmail().strip();
            User user =
                    userRepository
                            .findByEmailOrRegisterNumber(target, target)
                            .orElseThrow(
                                    () ->
                                            new ApiException(
                                                    HttpStatus.UNAUTHORIZED,
                                                    "User with this email or register number does not exist"));

            if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
                throw new ApiException(HttpStatus.UNAUTHORIZED, "Invalid password");
            }
            if (!Boolean.TRUE.equals(user.getIsActive())) {
                throw ApiException.forbidden("Account is deactivated");
            }

            String token = jwtService.generateToken(user.getId(), user.getRole());
            return new LoginResponse(token, user.getRole().dbValue(), toUserOut(user));
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("Login failure", e);
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "Database or authentication failure: " + e.getMessage());
        }
    }

    @Transactional
    public LoginResponse studentEntry(StudentEntryRequest request) {
        String registerNumberRaw = request.getRegisterNumber() == null ? "" : request.getRegisterNumber();
        if (registerNumberRaw.strip().isEmpty()) {
            throw ApiException.badRequest("Register number is required");
        }
        String nameRaw = request.getName() == null ? "" : request.getName();
        if (nameRaw.strip().isEmpty()) {
            throw ApiException.badRequest("Name is required");
        }

        String regNo = registerNumberRaw.strip().toUpperCase();
        String email = regNo.toLowerCase() + "@codearena.com";
        int yearNum = parseYear(request.getYear());
        String department = PythonTruthy.orDefault(request.getDepartment(), "AI & DS");
        String section = PythonTruthy.orDefault(request.getSection(), "A");

        try {
            User user =
                    userRepository
                            .findByRegisterNumber(regNo)
                            .or(() -> userRepository.findByEmailOrRegisterNumber(email, regNo))
                            .orElse(null);

            if (user == null) {
                String randomPassword = generateUnguessablePassword();
                user =
                        User.builder()
                                .email(email)
                                .registerNumber(regNo)
                                .name(nameRaw)
                                .passwordHash(passwordEncoder.encode(randomPassword))
                                .role(Role.STUDENT)
                                .department(department)
                                .year(yearNum)
                                .section(section)
                                .status(AccountStatus.ACTIVE)
                                .isActive(true)
                                .build();
            } else {
                user.setName(nameRaw);
                user.setDepartment(department);
                user.setYear(yearNum);
                user.setSection(section);
            }
            user = userRepository.saveAndFlush(user);

            String token = jwtService.generateToken(user.getId(), Role.STUDENT);
            UserOut userOut =
                    new UserOut(
                            user.getId(),
                            user.getEmail(),
                            user.getRegisterNumber(),
                            user.getName(),
                            "student",
                            user.getDepartment(),
                            user.getYear(),
                            user.getSection(),
                            "active");
            return new LoginResponse(token, "student", userOut);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("Student entry failure", e);
            String msg = e.getMessage() == null ? "" : e.getMessage();
            String lower = msg.toLowerCase();
            String errMsg =
                    (msg.contains("101") || lower.contains("unreachable") || lower.contains("cannot connect"))
                            ? "Database network unreachable. Please verify container internet access."
                            : msg;
            throw new ApiException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Registration error: " + errMsg);
        }
    }

    private UserOut toUserOut(User user) {
        return new UserOut(
                user.getId(),
                user.getEmail(),
                user.getRegisterNumber(),
                user.getName(),
                user.getRole().dbValue(),
                user.getDepartment(),
                user.getYear(),
                user.getSection(),
                user.getStatus().dbValue());
    }

    private int parseYear(String year) {
        if (year == null) {
            return 1;
        }
        Matcher m = DIGITS.matcher(year);
        return m.find() ? Integer.parseInt(m.group()) : 1;
    }

    private String generateUnguessablePassword() {
        return TokenGenerator.tokenUrlsafe(24);
    }
}
