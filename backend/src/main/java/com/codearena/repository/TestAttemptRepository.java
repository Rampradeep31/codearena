package com.codearena.repository;

import com.codearena.entity.TestAttempt;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TestAttemptRepository extends JpaRepository<TestAttempt, Long> {
    Optional<TestAttempt> findByUserIdAndTestId(Long userId, Long testId);

    Optional<TestAttempt> findByIdAndUserId(Long id, Long userId);

    List<TestAttempt> findByUserId(Long userId);

    List<TestAttempt> findByTestId(Long testId);
}
