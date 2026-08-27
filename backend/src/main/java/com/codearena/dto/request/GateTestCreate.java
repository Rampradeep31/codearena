package com.codearena.dto.request;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.OffsetDateTime;
@Data
public class GateTestCreate {
    @NotBlank private String title;
    private String description;
    @NotNull private Integer durationMinutes;
    private Double totalMarks;
    private Boolean isActive;
    private OffsetDateTime startTime;
    private OffsetDateTime endTime;
    private String instructions;
    private java.util.List<Long> questionIds;
}
