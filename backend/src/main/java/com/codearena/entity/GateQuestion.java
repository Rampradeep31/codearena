package com.codearena.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.OffsetDateTime;

@Entity
@Table(name = "gate_questions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GateQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** MCQ or FITB (fill-in-the-blank / numerical) */
    @Column(name = "question_type", nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String questionType = "MCQ";

    @Column(nullable = false, columnDefinition = "TEXT")
    private String subject;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String statement;

    /** Only for MCQ */
    @Column(name = "option_a", columnDefinition = "TEXT")
    private String optionA;

    @Column(name = "option_b", columnDefinition = "TEXT")
    private String optionB;

    @Column(name = "option_c", columnDefinition = "TEXT")
    private String optionC;

    @Column(name = "option_d", columnDefinition = "TEXT")
    private String optionD;

    /**
     * For MCQ: "A", "B", "C", or "D".
     * For FITB: the exact numerical/text answer.
     */
    @Column(name = "correct_answer", nullable = false, columnDefinition = "TEXT")
    private String correctAnswer;

    /** Marks awarded for a correct answer (typically 1 or 2) */
    @Column(nullable = false)
    @Builder.Default
    private Double marks = 1.0;

    /** Marks deducted for a wrong answer (positive value, applied as negative). 0 = no penalty */
    @Column(name = "negative_marks", nullable = false)
    @Builder.Default
    private Double negativeMarks = 0.33;

    @Column(columnDefinition = "TEXT")
    private String explanation;

    @Column(nullable = false, columnDefinition = "TEXT")
    @Builder.Default
    private String difficulty = "medium";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
