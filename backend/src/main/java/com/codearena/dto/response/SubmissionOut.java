package com.codearena.dto.response;

import java.time.OffsetDateTime;

public record SubmissionOut(
        Long id, Long attemptId, Long questionId, String language, OffsetDateTime createdAt, double score, int totalTestCases, int passedTestCases) {}
