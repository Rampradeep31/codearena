package com.codearena.dto.response;

import java.util.List;

/** Question output for students -- only includes public (non-hidden) test cases. */
public record QuestionStudentOut(
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
        List<TestCasePublicOut> testCases) {}
