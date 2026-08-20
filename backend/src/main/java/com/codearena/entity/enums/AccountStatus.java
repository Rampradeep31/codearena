package com.codearena.entity.enums;

public enum AccountStatus {
    ACTIVE("active"),
    INACTIVE("inactive");

    private final String dbValue;

    AccountStatus(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }

    public static AccountStatus fromDbValue(String value) {
        for (AccountStatus s : values()) {
            if (s.dbValue.equals(value)) {
                return s;
            }
        }
        throw new IllegalArgumentException("Unknown status: " + value);
    }
}
