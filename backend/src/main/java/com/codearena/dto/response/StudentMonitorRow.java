package com.codearena.dto.response;

import java.time.OffsetDateTime;

public record StudentMonitorRow(
        Long studentId,
        String studentName,
        String registerNumber,
        String status,
        int questionsAttempted,
        int questionsSubmitted,
        int violationCount,
        Integer remainingSeconds,
        OffsetDateTime lastActivity) {}
