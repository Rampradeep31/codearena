package com.codearena.repository;

import com.codearena.entity.Submission;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubmissionRepository extends JpaRepository<Submission, Long> {

    // No explicit ORDER BY by design -- mirrors the Python app's
    // finish_test aggregation, which relies on natural/insertion row order
    // (id ASC) rather than a real GROUP BY. See AttemptLifecycleService.
    List<Submission> findByAttemptIdOrderByIdAsc(Long attemptId);

    List<Submission> findByAttemptIdAndQuestionId(Long attemptId, Long questionId);
}
