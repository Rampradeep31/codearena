package com.codearena.dto.response;

import java.time.OffsetDateTime;

public record ViolationRecorded(
        Long id,
        Long attemptId,
        String violationType,
        OffsetDateTime createdAt,
        int violationCount,
        int maxViolations,
        boolean autoSubmitted) {}
