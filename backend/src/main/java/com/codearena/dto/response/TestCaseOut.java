package com.codearena.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record TestCaseOut(Long id, String input, String expectedOutput, @JsonProperty("is_hidden") boolean isHidden) {}
