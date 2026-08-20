package com.codearena.util;

/**
 * Mirrors Python's `value or fallback` idiom: null AND empty string are
 * both "falsy" and fall back, matching several endpoints ported from the
 * Python app (e.g. QuestionBankCreate.year/status, AuthService.department).
 */
public final class PythonTruthy {
    private PythonTruthy() {}

    public static String orDefault(String value, String fallback) {
        return (value == null || value.isEmpty()) ? fallback : value;
    }
}
