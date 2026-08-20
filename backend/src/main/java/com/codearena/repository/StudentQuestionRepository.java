package com.codearena.repository;

import com.codearena.entity.StudentQuestion;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentQuestionRepository extends JpaRepository<StudentQuestion, Long> {
    List<StudentQuestion> findByAttemptIdOrderByPosition(Long attemptId);

    Optional<StudentQuestion> findByAttemptIdAndQuestionId(Long attemptId, Long questionId);

    long countByAttemptId(Long attemptId);
}
