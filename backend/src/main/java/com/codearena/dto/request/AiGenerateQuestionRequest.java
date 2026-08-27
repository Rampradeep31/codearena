package com.codearena.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AiGenerateQuestionRequest {
    @NotNull
    private String prompt;

    @NotNull
    private Long questionBankId;
}
