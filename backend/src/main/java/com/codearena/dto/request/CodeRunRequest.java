package com.codearena.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CodeRunRequest {
    @NotNull
    private Long attemptId;

    @NotNull
    private Long questionId;

    @NotNull
    private String language;

    @NotNull
    private String sourceCode;
}
