package com.codearena.repository;

import com.codearena.entity.StudentCode;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentCodeRepository extends JpaRepository<StudentCode, Long> {
    Optional<StudentCode> findByAttemptIdAndQuestionId(Long attemptId, Long questionId);

    List<StudentCode> findByAttemptId(Long attemptId);

    @org.springframework.data.jpa.repository.Query(
            "SELECT COUNT(sc) FROM StudentCode sc WHERE sc.attemptId = :attemptId AND sc.sourceCode IS NOT NULL AND sc.sourceCode <> ''")
    long countAttemptedByAttemptId(@org.springframework.data.repository.query.Param("attemptId") Long attemptId);

    java.util.Optional<StudentCode> findFirstByAttemptIdOrderByUpdatedAtDesc(Long attemptId);
}
