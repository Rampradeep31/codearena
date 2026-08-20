package com.codearena.entity.enums;

/**
 * The Python model's Difficulty enum also declared lowercase aliases
 * (easy/medium/hard) that collapse to the same 3 members since Python enum
 * treats duplicate values as aliases, not distinct members. Only 3 real
 * values exist in the DB (CHECK difficulty IN ('easy','medium','hard')).
 */
public enum Difficulty {
    EASY("easy"),
    MEDIUM("medium"),
    HARD("hard");

    private final String dbValue;

    Difficulty(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }

    public static Difficulty fromDbValue(String value) {
        for (Difficulty d : values()) {
            if (d.dbValue.equals(value)) {
                return d;
            }
        }
        throw new IllegalArgumentException("Unknown difficulty: " + value);
    }
}
