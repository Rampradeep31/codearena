package com.codearena.repository;

import com.codearena.entity.StudentQuestionAssignment;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentQuestionAssignmentRepository extends JpaRepository<StudentQuestionAssignment, Long> {
    Optional<StudentQuestionAssignment> findByStudentIdAndTestId(Long studentId, Long testId);
}
