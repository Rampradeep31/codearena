package com.codearena.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.OffsetDateTime;

@Entity
@Table(name = "gate_attempts")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GateAttempt {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "gate_test_id", nullable = false)
    private Long gateTestId;

    @Column(name = "student_id", nullable = false)
    private Long studentId;

    @Column(name = "start_time")
    private OffsetDateTime startTime;

    @Column(name = "end_time")
    private OffsetDateTime endTime;

    @Column(name = "score")
    @Builder.Default
    private Double score = 0.0;

    /** ONGOING, SUBMITTED */
    @Column(nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String status = "ONGOING";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
