package com.codearena.repository;

import com.codearena.entity.TestQuestion;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TestQuestionRepository extends JpaRepository<TestQuestion, Long> {
    List<TestQuestion> findByTestId(Long testId);

    void deleteByTestId(Long testId);
}
