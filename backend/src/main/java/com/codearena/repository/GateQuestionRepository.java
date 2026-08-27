package com.codearena.repository;
import com.codearena.entity.GateQuestion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
public interface GateQuestionRepository extends JpaRepository<GateQuestion, Long> {
    List<GateQuestion> findBySubjectIgnoreCase(String subject);
    List<GateQuestion> findByQuestionType(String questionType);
    @Query("SELECT q FROM GateQuestion q WHERE (:subject IS NULL OR LOWER(q.subject) = LOWER(:subject)) AND (:type IS NULL OR q.questionType = :type) AND (:search IS NULL OR LOWER(q.statement) LIKE LOWER(CONCAT('%', :search, '%')))")
    List<GateQuestion> search(@Param("subject") String subject, @Param("type") String type, @Param("search") String search);
}
