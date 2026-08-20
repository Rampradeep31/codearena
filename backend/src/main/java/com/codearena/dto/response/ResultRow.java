package com.codearena.dto.response;

import java.time.OffsetDateTime;

public record ResultRow(
        int rank,
        String studentName,
        String registerNumber,
        String department,
        int questionsAssigned,
        int questionsAttempted,
        int questionsSolved,
        double score,
        double totalPossible,
        double percentage,
        int violationCount,
        String submissionType,
        OffsetDateTime submittedAt) {}
