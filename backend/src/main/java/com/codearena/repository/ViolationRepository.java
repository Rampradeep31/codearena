package com.codearena.repository;

import com.codearena.entity.Violation;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ViolationRepository extends JpaRepository<Violation, Long> {

    Optional<Violation> findFirstByAttemptIdAndViolationTypeAndCreatedAtAfterOrderByCreatedAtDesc(
            Long attemptId, String violationType, OffsetDateTime after);

    List<Violation> findByAttemptIdOrderByCreatedAtDesc(Long attemptId);
}
