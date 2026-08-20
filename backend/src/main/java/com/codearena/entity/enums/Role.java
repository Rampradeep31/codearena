package com.codearena.entity.enums;

public enum Role {
    ADMIN("admin"),
    STUDENT("student");

    private final String dbValue;

    Role(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }

    public static Role fromDbValue(String value) {
        for (Role r : values()) {
            if (r.dbValue.equals(value)) {
                return r;
            }
        }
        throw new IllegalArgumentException("Unknown role: " + value);
    }
}
