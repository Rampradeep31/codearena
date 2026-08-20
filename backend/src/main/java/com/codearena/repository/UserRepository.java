package com.codearena.repository;

import com.codearena.entity.User;
import com.codearena.entity.enums.Role;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailOrRegisterNumber(String email, String registerNumber);

    Optional<User> findByRegisterNumber(String registerNumber);

    boolean existsByRegisterNumberOrEmail(String registerNumber, String email);

    List<User> findByRoleOrderByName(Role role);

    // CAST(:search AS string) is required -- see the identical note in
    // QuestionRepository.search; without it Postgres fails to plan the
    // query at all ("function lower(bytea) does not exist"), for every
    // call, not just null searches.
    @Query(
            "SELECT u FROM User u WHERE u.role = :role "
                    + "AND (:department IS NULL OR u.department = :department) "
                    + "AND (:year IS NULL OR u.year = :year) "
                    + "AND (:search IS NULL OR "
                    + "     lower(u.name) LIKE lower(concat('%', CAST(:search AS string), '%')) OR "
                    + "     lower(u.registerNumber) LIKE lower(concat('%', CAST(:search AS string), '%')) OR "
                    + "     lower(u.email) LIKE lower(concat('%', CAST(:search AS string), '%'))) "
                    + "ORDER BY u.name")
    List<User> searchStudents(
            @Param("role") Role role,
            @Param("search") String search,
            @Param("department") String department,
            @Param("year") Integer year);

    long countByRole(Role role);

    List<User> findByIsActiveTrue();
}
