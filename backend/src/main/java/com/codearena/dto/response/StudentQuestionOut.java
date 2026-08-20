package com.codearena.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record StudentQuestionOut(
        Long id,
        Long attemptId,
        Long questionId,
        Integer position,
        QuestionStudentOut question,
        String savedCode,
        String savedLanguage,
        @JsonProperty("is_submitted") boolean isSubmitted,
        Double submissionScore) {}
