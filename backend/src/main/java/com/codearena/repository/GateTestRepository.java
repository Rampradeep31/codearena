package com.codearena.repository;
import com.codearena.entity.GateTest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface GateTestRepository extends JpaRepository<GateTest, Long> {
    List<GateTest> findByIsActiveTrue();
}
