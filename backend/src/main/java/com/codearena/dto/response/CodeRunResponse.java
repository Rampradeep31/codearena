package com.codearena.dto.response;

import java.util.List;

public record CodeRunResponse(
        String compilationStatus, String compilationError, List<TestCaseResultOut> results, int passed, int total) {}
