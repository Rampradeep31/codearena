package com.codearena.repository;
import com.codearena.entity.GateTestQuestion;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface GateTestQuestionRepository extends JpaRepository<GateTestQuestion, Long> {
    List<GateTestQuestion> findByGateTestIdOrderByOrderIndex(Long gateTestId);
    void deleteByGateTestId(Long gateTestId);
    long countByGateTestId(Long gateTestId);
}
