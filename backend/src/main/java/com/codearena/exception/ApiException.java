package com.codearena.exception;

import java.util.Map;
import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * Direct equivalent of FastAPI's HTTPException(status_code, detail): always
 * serializes to {"detail": "&lt;message&gt;"}. extraHeaders lets auth failures
 * attach WWW-Authenticate: Bearer, matching the Python auth-failure matrix.
 */
@Getter
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String detail;
    private final Map<String, String> extraHeaders;

    public ApiException(HttpStatus status, String detail) {
        this(status, detail, Map.of());
    }

    public ApiException(HttpStatus status, String detail, Map<String, String> extraHeaders) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.extraHeaders = extraHeaders;
    }

    public static ApiException unauthorized(String detail) {
        return new ApiException(HttpStatus.UNAUTHORIZED, detail, Map.of("WWW-Authenticate", "Bearer"));
    }

    public static ApiException forbidden(String detail) {
        return new ApiException(HttpStatus.FORBIDDEN, detail);
    }

    public static ApiException notFound(String detail) {
        return new ApiException(HttpStatus.NOT_FOUND, detail);
    }

    public static ApiException badRequest(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, detail);
    }
}
