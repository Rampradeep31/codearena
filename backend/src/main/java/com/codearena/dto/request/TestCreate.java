package com.codearena.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TestCreate {
    @NotNull
    @Size(min = 1, max = 500)
    private String name;

    private String description;
    private String year = "Second Year";
    private Long questionBankId;
    private boolean randomizeQuestions = false;

    @NotNull
    private OffsetDateTime startTime;

    @NotNull
    private OffsetDateTime endTime;

    @Min(1)
    private Integer durationMinutes;

    @Min(1)
    private Integer totalMarks;

    @Min(1)
    private Integer questionsPerStudent;

    @Min(0)
    private int easyCount = 0;

    @Min(0)
    private int mediumCount = 0;

    @Min(0)
    private int hardCount = 0;

    private List<String> allowedLanguages = new ArrayList<>(List.of("python", "java", "c", "cpp"));

    @Min(1)
    private int maxViolations = 3;

    private boolean allowCopyPaste = false;
    private String scoringType = "partial";
    private boolean showResults = false;
    private List<Long> questionIds = new ArrayList<>();

    @AssertTrue(message = "end_time must be after start_time")
    private boolean isWindowValid() {
        return startTime == null || endTime == null || endTime.isAfter(startTime);
    }

    @AssertTrue(message = "duration_minutes cannot exceed the start/end window")
    private boolean isDurationWithinWindow() {
        if (startTime == null || endTime == null || durationMinutes == null) {
            return true;
        }
        long windowMinutes = ChronoUnit.SECONDS.between(startTime, endTime) / 60;
        return durationMinutes <= windowMinutes;
    }

    @AssertTrue(message = "easy_count + medium_count + hard_count cannot exceed questions_per_student")
    private boolean isDifficultyCountsValid() {
        return questionsPerStudent == null || (easyCount + mediumCount + hardCount) <= questionsPerStudent;
    }

    @AssertTrue(message = "scoring_type must be 'partial' or 'all_or_nothing'")
    private boolean isScoringTypeValid() {
        return scoringType != null && Set.of("partial", "all_or_nothing").contains(scoringType);
    }
}
