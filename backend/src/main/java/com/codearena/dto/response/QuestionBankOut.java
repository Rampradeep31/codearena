package com.codearena.dto.response;

import java.time.OffsetDateTime;

public record QuestionBankOut(
        Long id, String title, String description, String year, String status, int questionCount, OffsetDateTime createdAt) {}
