package com.codearena.dto.request;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CodeRunCaseRequest extends CodeRunRequest {
    private String input = "";
    private String expectedOutput;
}
