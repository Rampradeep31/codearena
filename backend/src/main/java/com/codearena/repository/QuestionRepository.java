package com.codearena.repository;

import com.codearena.entity.Question;
import com.codearena.entity.enums.Difficulty;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface QuestionRepository extends JpaRepository<Question, Long> {

    List<Question> findAllByOrderByCreatedAtDesc();

    // CAST(:search AS string) is required: Postgres cannot infer a type for
    // a null-bound parameter inside lower(concat(...)) and fails at query
    //-plan time with "function lower(bytea) does not exist" otherwise --
    // this is not just a null-search edge case, it breaks EVERY call
    // (including non-null searches) because Postgres plans the query once.
    @Query(
            "SELECT q FROM Question q WHERE "
                    + "(:difficulty IS NULL OR q.difficulty = :difficulty) AND "
                    + "(:topic IS NULL OR q.topic = :topic) AND "
                    + "(:search IS NULL OR "
                    + "  lower(q.title) LIKE lower(concat('%', CAST(:search AS string), '%')) OR "
                    + "  lower(q.topic) LIKE lower(concat('%', CAST(:search AS string), '%'))) "
                    + "ORDER BY q.createdAt DESC")
    List<Question> search(
            @Param("difficulty") Difficulty difficulty,
            @Param("topic") String topic,
            @Param("search") String search);

    List<Question> findByIdIn(List<Long> ids);

    long countByQuestionBankId(Long questionBankId);

    @Query("SELECT q FROM Question q JOIN TestQuestion tq ON tq.questionId = q.id WHERE tq.testId = :testId")
    List<Question> findPoolByTestId(@Param("testId") Long testId);
}
