package com.codearena.dto.request;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
@Data
public class GateQuestionCreate {
    @NotBlank private String questionType; // MCQ or FITB
    @NotBlank private String subject;
    @NotBlank private String statement;
    private String optionA;
    private String optionB;
    private String optionC;
    private String optionD;
    @NotBlank private String correctAnswer;
    @NotNull private Double marks;
    private Double negativeMarks;
    private String explanation;
    private String difficulty;
}
