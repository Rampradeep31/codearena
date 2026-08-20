package com.codearena.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

/**
 * min_length=1 here catches genuinely-empty strings at the Bean Validation
 * layer (422); AuthService additionally rejects whitespace-only values
 * (e.g. " ") that pass this check but are blank after .strip(), matching
 * the Python app's two-layer validation exactly.
 */
@Getter
@Setter
public class StudentEntryRequest {
    @NotNull
    @Size(min = 1, max = 255)
    private String name;

    @NotNull
    @Size(min = 1, max = 50)
    private String registerNumber;

    private String department = "AI & DS";
    private String section = "A";
    private String year = "1st Year";
}
