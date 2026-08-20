package com.codearena.entity.enums;

/**
 * NOTE: this field is genuinely dead configuration in the ported business
 * logic (see ScoringService) -- it is stored and returned but never read
 * when computing a submission's score. Preserved exactly as in the Python
 * app; do not wire it into scoring without an explicit follow-up request.
 */
public enum ScoringType {
    PARTIAL("partial"),
    ALL_OR_NOTHING("all_or_nothing");

    private final String dbValue;

    ScoringType(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }

    public static ScoringType fromDbValue(String value) {
        for (ScoringType s : values()) {
            if (s.dbValue.equals(value)) {
                return s;
            }
        }
        throw new IllegalArgumentException("Unknown scoring type: " + value);
    }
}
