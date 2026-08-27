package com.codearena.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "gate_attempt_answers")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GateAttemptAnswer {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "gate_attempt_id", nullable = false)
    private Long gateAttemptId;

    @Column(name = "gate_question_id", nullable = false)
    private Long gateQuestionId;

    /** The answer the student gave (option letter or text) */
    @Column(name = "given_answer", columnDefinition = "TEXT")
    private String givenAnswer;

    /** Null = not answered, true = correct, false = wrong */
    @Column(name = "is_correct")
    private Boolean isCorrect;

    @Column(name = "marks_obtained")
    @Builder.Default
    private Double marksObtained = 0.0;

    /** true = flagged for review but not necessarily answered */
    @Column(name = "is_marked_for_review")
    @Builder.Default
    private Boolean isMarkedForReview = false;
}
