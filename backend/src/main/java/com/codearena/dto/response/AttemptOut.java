package com.codearena.dto.response;

import java.time.OffsetDateTime;
import java.util.List;

public record AttemptOut(
        Long id,
        Long studentId,
        Long testId,
        OffsetDateTime startedAt,
        OffsetDateTime expiresAt,
        OffsetDateTime submittedAt,
        String status,
        Integer violationCount,
        String submissionReason,
        Double totalScore,
        Double totalPossible,
        Integer maxViolations,
        Boolean allowCopyPaste,
        List<String> allowedLanguages) {}

