package com.codearena.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class QuestionBankCreate {
    @NotNull
    @Size(min = 1, max = 255)
    private String title;

    private String description;
    private String year = "Second Year";
    private String status = "Active";
}
