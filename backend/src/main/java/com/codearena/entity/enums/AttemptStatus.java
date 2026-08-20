package com.codearena.entity.enums;

/**
 * NOT_STARTED is intentionally absent: it is never a persisted value in
 * test_attempts.status (it means "no attempt row exists yet"). Only these
 * 3 values are ever written by the application.
 */
public enum AttemptStatus {
    IN_PROGRESS("in_progress"),
    SUBMITTED("submitted"),
    AUTO_SUBMITTED("auto_submitted");

    private final String dbValue;

    AttemptStatus(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }

    public static AttemptStatus fromDbValue(String value) {
        for (AttemptStatus s : values()) {
            if (s.dbValue.equals(value)) {
                return s;
            }
        }
        throw new IllegalArgumentException("Unknown attempt status: " + value);
    }
}
