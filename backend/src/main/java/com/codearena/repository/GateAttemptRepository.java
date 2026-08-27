package com.codearena.repository;
import com.codearena.entity.GateAttempt;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface GateAttemptRepository extends JpaRepository<GateAttempt, Long> {
    Optional<GateAttempt> findByGateTestIdAndStudentId(Long gateTestId, Long studentId);
    List<GateAttempt> findByStudentId(Long studentId);
    List<GateAttempt> findByGateTestId(Long gateTestId);
}
