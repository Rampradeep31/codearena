package com.codearena.dto.response;

public record LoginResponse(String accessToken, String tokenType, String role, UserOut user) {
    public LoginResponse(String accessToken, String role, UserOut user) {
        this(accessToken, "bearer", role, user);
    }
}
