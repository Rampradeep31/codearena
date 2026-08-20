package com.codearena.repository;

import com.codearena.entity.SubmissionResult;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubmissionResultRepository extends JpaRepository<SubmissionResult, Long> {
    List<SubmissionResult> findBySubmissionId(Long submissionId);
}
