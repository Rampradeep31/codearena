package com.codearena.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class QuestionCreate {
    @NotNull
    @Size(min = 1, max = 500)
    private String title;

    @NotNull
    private String statement;

    @NotNull
    private String difficulty;

    @Min(1)
    private Integer marks = 10;

    private String topic = "General";
    private String inputFormat;
    private String outputFormat;
    private String constraints;
    private String sampleInput;
    private String sampleOutput;
    private String explanation;
    private Long questionBankId;

    @Valid
    private List<TestCaseCreate> testCases = new ArrayList<>();

    // Mirrors the Python model_validator: 422 if difficulty isn't one of the 3 values.
    @AssertTrue(message = "difficulty must be one of: easy, medium, hard")
    private boolean isDifficultyValid() {
        return difficulty != null && Set.of("easy", "medium", "hard").contains(difficulty);
    }
}
