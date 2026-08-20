package com.codearena.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

/** email is matched against BOTH User.email and User.registerNumber -- see AuthService. */
@Getter
@Setter
public class LoginRequest {
    @NotNull
    private String email;

    @NotNull
    private String password;
}
