package com.codearena.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "gate_test_questions")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GateTestQuestion {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "gate_test_id", nullable = false)
    private Long gateTestId;

    @Column(name = "gate_question_id", nullable = false)
    private Long gateQuestionId;

    @Column(name = "order_index", nullable = false)
    @Builder.Default
    private Integer orderIndex = 0;
}
