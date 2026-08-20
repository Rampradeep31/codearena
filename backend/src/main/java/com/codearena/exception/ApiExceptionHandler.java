package com.codearena.exception;

import jakarta.validation.ConstraintViolationException;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Reproduces FastAPI's exact error response shapes:
 * - HTTPException(status, detail)   -> {status} {"detail": "&lt;string&gt;"}
 * - Pydantic validation error        -> 422 {"detail": [{"loc":[...],"msg":...,"type":...}]}
 * - anything else                    -> 500 {"detail": "Internal server error"} (never leaks ex.getMessage())
 *
 * Two endpoints (/auth/login, /auth/student-entry) intentionally bypass this
 * handler's no-leak rule via their own local try/catch -- see AuthService.
 */
@Slf4j
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, String>> handleApiException(ApiException ex) {
        HttpHeaders headers = new HttpHeaders();
        ex.getExtraHeaders().forEach(headers::add);
        return ResponseEntity.status(ex.getStatus()).headers(headers).body(Map.of("detail", ex.getDetail()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, List<ValidationErrorItem>>> handleValidation(
            MethodArgumentNotValidException ex) {
        List<ValidationErrorItem> items =
                ex.getBindingResult().getFieldErrors().stream()
                        .map(this::toValidationItem)
                        .toList();
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("detail", items));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, List<ValidationErrorItem>>> handleConstraintViolation(
            ConstraintViolationException ex) {
        List<ValidationErrorItem> items =
                ex.getConstraintViolations().stream()
                        .map(
                                v ->
                                        new ValidationErrorItem(
                                                List.of("query", String.valueOf(v.getPropertyPath())),
                                                v.getMessage(),
                                                "value_error"))
                        .toList();
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("detail", items));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, List<ValidationErrorItem>>> handleMalformedBody(
            HttpMessageNotReadableException ex) {
        ValidationErrorItem item = new ValidationErrorItem(List.of("body"), "Invalid or malformed request body", "json_invalid");
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(Map.of("detail", List.of(item)));
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class})
    public ResponseEntity<Map<String, String>> handleNoHandler(Exception ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("detail", "Not Found"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex) {
        log.error("[GLOBAL EXCEPTION] Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("detail", "Internal server error"));
    }

    private ValidationErrorItem toValidationItem(FieldError fe) {
        String type =
                switch (fe.getCode() == null ? "" : fe.getCode()) {
                    case "NotNull", "NotBlank", "NotEmpty" -> "missing";
                    case "Size" -> "string_too_short";
                    case "Min" -> "greater_than_equal";
                    case "Max" -> "less_than_equal";
                    default -> "value_error";
                };
        return new ValidationErrorItem(List.of("body", fe.getField()), fe.getDefaultMessage(), type);
    }
}
