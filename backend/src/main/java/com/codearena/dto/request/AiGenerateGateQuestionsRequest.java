package com.codearena.dto.request;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;
@Data
public class AiGenerateGateQuestionsRequest {
    @NotBlank private String prompt;
    private int count = 5;
    private String subject;
}
