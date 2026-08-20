package com.codearena.repository;

import com.codearena.entity.StudentCode;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentCodeRepository extends JpaRepository<StudentCode, Long> {
    Optional<StudentCode> findByAttemptIdAndQuestionId(Long attemptId, Long questionId);

    List<StudentCode> findByAttemptId(Long attemptId);
}
