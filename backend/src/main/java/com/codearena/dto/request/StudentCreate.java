package com.codearena.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class StudentCreate {
    @NotNull
    @Size(min = 1, max = 255)
    private String name;

    @NotNull
    @Size(min = 1, max = 50)
    private String registerNumber;

    @NotNull
    @Size(max = 255)
    private String email;

    private String department;

    @Min(1)
    @Max(5)
    private Integer year;

    private String section;

    @Size(min = 4, max = 128)
    private String password;
}
