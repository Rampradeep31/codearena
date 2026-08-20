package com.codearena.dto.response;

import java.time.OffsetDateTime;

public record ViolationOut(Long id, Long attemptId, String violationType, OffsetDateTime createdAt) {}
