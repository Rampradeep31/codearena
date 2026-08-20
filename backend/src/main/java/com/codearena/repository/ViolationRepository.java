package com.codearena.repository;

import com.codearena.entity.Violation;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ViolationRepository extends JpaRepository<Violation, Long> {

    Optional<Violation> findFirstByAttemptIdAndViolationTypeOrderByCreatedAtDesc(Long attemptId, String violationType);

    List<Violation> findByAttemptIdOrderByCreatedAtDesc(Long attemptId);
}
