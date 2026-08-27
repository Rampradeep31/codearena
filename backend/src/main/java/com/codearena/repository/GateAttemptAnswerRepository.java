package com.codearena.repository;
import com.codearena.entity.GateAttemptAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface GateAttemptAnswerRepository extends JpaRepository<GateAttemptAnswer, Long> {
    List<GateAttemptAnswer> findByGateAttemptId(Long gateAttemptId);
    Optional<GateAttemptAnswer> findByGateAttemptIdAndGateQuestionId(Long gateAttemptId, Long gateQuestionId);
    void deleteByGateAttemptId(Long gateAttemptId);
}
