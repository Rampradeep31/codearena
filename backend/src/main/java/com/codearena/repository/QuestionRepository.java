package com.codearena.repository;

import com.codearena.entity.Question;
import com.codearena.entity.enums.Difficulty;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface QuestionRepository extends JpaRepository<Question, Long> {

    List<Question> findAllByOrderByCreatedAtDesc();

    @Query(
            "SELECT q FROM Question q WHERE "
                    + "(:difficulty IS NULL OR q.difficulty = :difficulty) AND "
                    + "(:topic IS NULL OR q.topic = :topic) AND "
                    + "(:search IS NULL OR "
                    + "  lower(q.title) LIKE lower(concat('%', :search, '%')) OR "
                    + "  lower(q.topic) LIKE lower(concat('%', :search, '%'))) "
                    + "ORDER BY q.createdAt DESC")
    List<Question> search(
            @Param("difficulty") Difficulty difficulty,
            @Param("topic") String topic,
            @Param("search") String search);

    List<Question> findByIdIn(List<Long> ids);
}
