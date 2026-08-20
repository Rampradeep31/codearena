package com.codearena.dto.response;

import java.time.OffsetDateTime;
import java.util.List;

public record TestOut(
        Long id,
        String name,
        String description,
        String year,
        Long questionBankId,
        boolean randomizeQuestions,
        OffsetDateTime startTime,
        OffsetDateTime endTime,
        Integer durationMinutes,
        Integer totalMarks,
        Integer questionsPerStudent,
        Integer easyCount,
        Integer mediumCount,
        Integer hardCount,
        List<String> allowedLanguages,
        Integer maxViolations,
        boolean allowCopyPaste,
        String scoringType,
        boolean showResults,
        Integer questionCount,
        List<Long> questionIds,
        OffsetDateTime createdAt) {}
