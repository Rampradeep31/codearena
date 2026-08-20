package com.codearena.repository;

import com.codearena.entity.Test;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TestRepository extends JpaRepository<Test, Long> {

    List<Test> findAllByOrderByCreatedAtDesc();

    long countByStartTimeLessThanEqualAndEndTimeGreaterThanEqual(OffsetDateTime now1, OffsetDateTime now2);

    long countByEndTimeLessThan(OffsetDateTime now);

    @Query("SELECT t FROM Test t WHERE t.year = :year OR t.year IS NULL")
    List<Test> findByYearOrYearIsNull(@Param("year") String year);
}
