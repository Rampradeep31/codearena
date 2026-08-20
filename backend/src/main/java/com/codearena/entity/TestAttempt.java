package com.codearena.entity;

import com.codearena.entity.enums.AttemptStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.OffsetDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Maps to table "test_attempts". score is Integer (not Float/Double) to
 * match finish_test's int()-truncation and the real INT column type -- do
 * not unify with Submission.score, which is a distinct FLOAT column.
 */
@Entity
@Table(
        name = "test_attempts",
        uniqueConstraints = @UniqueConstraint(name = "uq_user_test", columnNames = {"user_id", "test_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "test_id", nullable = false)
    private Long testId;

    // Always explicitly set by AttemptLifecycleService.startTest, mirroring
    // the Python app (which never relies on the DB's DEFAULT NOW()/+1h here).
    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "submitted_at")
    private OffsetDateTime submittedAt;

    @Column(nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private AttemptStatus status = AttemptStatus.IN_PROGRESS;

    @Column(name = "violation_count", nullable = false)
    @Builder.Default
    private Integer violationCount = 0;

    @Column(nullable = false)
    @Builder.Default
    private Integer score = 0;
}
