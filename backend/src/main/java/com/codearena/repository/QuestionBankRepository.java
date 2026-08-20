package com.codearena.repository;

import com.codearena.entity.QuestionBank;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestionBankRepository extends JpaRepository<QuestionBank, Long> {
    List<QuestionBank> findAllByOrderByCreatedAtDesc();
}
