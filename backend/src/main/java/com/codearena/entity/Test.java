package com.codearena.entity;

import com.codearena.entity.enums.ScoringType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

/**
 * Maps to table "tests". Named "Test" to mirror the Python model 1:1 -- note
 * this collides by simple-name with org.junit.jupiter.api.Test; always
 * fully-qualify one of the two in any file that needs both.
 *
 * DB-level CHECK constraint tests_window_valid (end_time > start_time) is
 * enforced by the real schema; AdminTestService re-validates it at the
 * application layer too, matching the Python create_test/update_test
 * behavior (see plan Part A).
 */
@Entity
@Table(name = "tests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Test {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String name;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String year = "Second Year";

    @Column(name = "question_bank_id")
    private Long questionBankId;

    @Column(name = "randomize_questions", nullable = false)
    @Builder.Default
    private Boolean randomizeQuestions = false;

    @Column(name = "start_time", nullable = false)
    private OffsetDateTime startTime;

    @Column(name = "end_time", nullable = false)
    private OffsetDateTime endTime;

    @Column(name = "duration_minutes", nullable = false)
    private Integer durationMinutes;

    @Column(name = "total_marks", nullable = false)
    private Integer totalMarks;

    @Column(name = "questions_per_student", nullable = false)
    private Integer questionsPerStudent;

    @Column(name = "easy_count", nullable = false)
    @Builder.Default
    private Integer easyCount = 0;

    @Column(name = "medium_count", nullable = false)
    @Builder.Default
    private Integer mediumCount = 0;

    @Column(name = "hard_count", nullable = false)
    @Builder.Default
    private Integer hardCount = 0;

    // Real column is jsonb; must round-trip as real jsonb (not plain json)
    // per the migration plan's corrected mapping.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "allowed_languages", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<String> allowedLanguages = new ArrayList<>(List.of("python", "java", "c", "cpp"));

    @Column(name = "max_violations", nullable = false)
    @Builder.Default
    private Integer maxViolations = 3;

    @Column(name = "allow_copy_paste", nullable = false)
    @Builder.Default
    private Boolean allowCopyPaste = false;

    // Dead configuration -- stored/returned but never read by ScoringService.
    // Preserve exactly; do not wire up without an explicit follow-up request.
    @Column(name = "scoring_type", nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private ScoringType scoringType = ScoringType.PARTIAL;

    @Column(name = "show_results", nullable = false)
    @Builder.Default
    private Boolean showResults = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
