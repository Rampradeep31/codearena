package com.codearena.dto.response;

import java.time.OffsetDateTime;
import java.util.List;

public record QuestionOut(
        Long id,
        String title,
        String statement,
        String difficulty,
        Integer marks,
        String topic,
        String inputFormat,
        String outputFormat,
        String constraints,
        String sampleInput,
        String sampleOutput,
        String explanation,
        Long questionBankId,
        List<TestCaseOut> testCases,
        OffsetDateTime createdAt) {}
