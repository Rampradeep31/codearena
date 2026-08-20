package com.codearena.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * NOTE: the Python SQLAlchemy model for this table was missing its
 * UNIQUE(test_id, question_id) constraint entirely (unlike every sibling
 * assignment/junction table). Added here to match the real DB.
 */
@Entity
@Table(
        name = "test_questions",
        uniqueConstraints = @UniqueConstraint(name = "uq_test_question", columnNames = {"test_id", "question_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TestQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "test_id", nullable = false)
    private Long testId;

    @Column(name = "question_id", nullable = false)
    private Long questionId;
}
