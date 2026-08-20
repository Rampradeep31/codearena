package com.codearena.exception;

import java.util.List;

/** Mirrors FastAPI/Pydantic's 422 error item shape: {"loc": [...], "msg": ..., "type": ...}. */
public record ValidationErrorItem(List<String> loc, String msg, String type) {}
