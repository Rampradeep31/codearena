package com.codearena.dto.response;

import java.util.List;

public record CodeSubmitResponse(
        double score,
        double totalMarks,
        int passedTestCases,
        int totalTestCases,
        String status,
        List<TestCaseResultOut> results) {}
