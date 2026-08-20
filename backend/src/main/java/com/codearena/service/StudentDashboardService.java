package com.codearena.service;

import com.codearena.entity.Test;
import com.codearena.entity.TestAttempt;
import com.codearena.entity.User;
import com.codearena.entity.enums.AttemptStatus;
import com.codearena.repository.TestAttemptRepository;
import com.codearena.repository.TestQuestionRepository;
import com.codearena.repository.TestRepository;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ports get_student_tests from students.py: the 5-rule bucketing, the
 * year-label scoping that only applies to not-yet-attempted tests, and
 * the side effect that merely listing tests can auto-submit expired
 * attempts (every candidate test with an attempt runs through
 * autoSubmitExpired here, same as the Python handler).
 */
@Service
public class StudentDashboardService {

    private static final Map<Integer, String> YEAR_LABELS = Map.of(2, "Second Year", 3, "Third Year");

    private final TestRepository testRepository;
    private final TestAttemptRepository attemptRepository;
    private final TestQuestionRepository testQuestionRepository;
    private final AttemptExpiryService attemptExpiryService;

    public StudentDashboardService(
            TestRepository testRepository,
            TestAttemptRepository attemptRepository,
            TestQuestionRepository testQuestionRepository,
            AttemptExpiryService attemptExpiryService) {
        this.testRepository = testRepository;
        this.attemptRepository = attemptRepository;
        this.testQuestionRepository = testQuestionRepository;
        this.attemptExpiryService = attemptExpiryService;
    }

    @Transactional
    public Map<String, Object> getStudentTests(User user) {
        OffsetDateTime now = OffsetDateTime.now();

        List<TestAttempt> existingAttempts = attemptRepository.findByUserId(user.getId());
        Set<Long> attemptedTestIds = new LinkedHashSet<>();
        Map<Long, TestAttempt> attemptsByTest = new LinkedHashMap<>();
        for (TestAttempt a : existingAttempts) {
            attemptedTestIds.add(a.getTestId());
            attemptsByTest.put(a.getTestId(), a);
        }

        String yearLabel = YEAR_LABELS.get(user.getYear());
        List<Test> yearScopedTests =
                yearLabel != null
                        ? testRepository.findByYearOrYearIsNullOrderByStartTimeDesc(yearLabel)
                        : testRepository.findAllByOrderByStartTimeDesc();

        Set<Long> yearScopedIds = new LinkedHashSet<>();
        for (Test t : yearScopedTests) {
            yearScopedIds.add(t.getId());
        }
        Set<Long> missedTestIds = new LinkedHashSet<>(attemptedTestIds);
        missedTestIds.removeAll(yearScopedIds);
        List<Test> extraTests = missedTestIds.isEmpty() ? List.of() : testRepository.findByIdIn(List.copyOf(missedTestIds));

        Set<Long> seenIds = new LinkedHashSet<>();
        List<Test> allTests = new ArrayList<>();
        for (Test t : extraTests) {
            if (seenIds.add(t.getId())) {
                allTests.add(t);
            }
        }
        for (Test t : yearScopedTests) {
            if (seenIds.add(t.getId())) {
                allTests.add(t);
            }
        }

        List<Map<String, Object>> upcoming = new ArrayList<>();
        List<Map<String, Object>> active = new ArrayList<>();
        List<Map<String, Object>> completed = new ArrayList<>();

        for (Test t : allTests) {
            TestAttempt attempt = attemptsByTest.get(t.getId());
            if (attempt != null) {
                attemptExpiryService.autoSubmitExpired(attempt);
            }

            Map<String, Object> testData = new LinkedHashMap<>();
            testData.put("id", t.getId());
            testData.put("name", t.getName());
            testData.put("description", t.getDescription());
            testData.put("year", t.getYear());
            testData.put("start_time", t.getStartTime());
            testData.put("end_time", t.getEndTime());
            testData.put("duration_minutes", t.getDurationMinutes());
            testData.put("total_marks", t.getTotalMarks());
            testData.put("questions_per_student", t.getQuestionsPerStudent());
            testData.put("allowed_languages", t.getAllowedLanguages());
            testData.put("max_violations", t.getMaxViolations());
            testData.put("allow_copy_paste", t.getAllowCopyPaste());
            testData.put("question_count", testQuestionRepository.countByTestId(t.getId()));

            if (attempt != null) {
                testData.put("attempt_id", attempt.getId());
                testData.put("attempt_status", attempt.getStatus().dbValue());
                testData.put("attempt_submitted_at", attempt.getSubmittedAt());
            } else {
                testData.put("attempt_id", null);
                testData.put("attempt_status", null);
                testData.put("attempt_submitted_at", null);
            }

            // Rule 1/2: an attempt always anchors the test (completed vs active-resume).
            if (attempt != null
                    && (attempt.getStatus() == AttemptStatus.SUBMITTED || attempt.getStatus() == AttemptStatus.AUTO_SUBMITTED)) {
                completed.add(testData);
            } else if (attempt != null) {
                active.add(testData);
            } else if (t.getStartTime().isAfter(now)) {
                upcoming.add(testData);
            } else if (!t.getEndTime().isBefore(now)) {
                active.add(testData);
            }
            // else: no attempt + test ended -> intentionally excluded
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("upcoming", upcoming);
        result.put("active", active);
        result.put("completed", completed);
        return result;
    }
}
