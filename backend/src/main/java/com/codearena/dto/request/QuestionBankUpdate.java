package com.codearena.dto.request;

import lombok.Getter;
import lombok.Setter;

/** Applied field-by-field only "if not null" (absence AND explicit null both mean "skip"). */
@Getter
@Setter
public class QuestionBankUpdate {
    private String title;
    private String description;
    private String year;
    private String status;
}
