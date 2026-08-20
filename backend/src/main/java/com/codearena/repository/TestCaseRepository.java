package com.codearena.repository;

import com.codearena.entity.TestCase;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TestCaseRepository extends JpaRepository<TestCase, Long> {
    List<TestCase> findByQuestionId(Long questionId);

    List<TestCase> findByQuestionIdAndIsHiddenFalse(Long questionId);

    void deleteByQuestionId(Long questionId);
}
