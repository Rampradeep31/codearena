package com.codearena.dto.response;
import lombok.AllArgsConstructor;
import lombok.Data;
import java.time.OffsetDateTime;
import java.util.List;
@Data @AllArgsConstructor
public class GateTestOut {
    private Long id;
    private String title;
    private String description;
    private Integer durationMinutes;
    private Double totalMarks;
    private Boolean isActive;
    private OffsetDateTime startTime;
    private OffsetDateTime endTime;
    private String instructions;
    private Integer questionCount;
    private OffsetDateTime createdAt;
}
