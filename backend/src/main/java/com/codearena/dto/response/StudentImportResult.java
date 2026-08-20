package com.codearena.dto.response;

import java.util.List;

public record StudentImportResult(int created, List<String> errors, List<String> generatedPasswords) {}
