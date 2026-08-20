package com.codearena.service;

import com.codearena.entity.Question;
import com.codearena.entity.StudentQuestionAssignment;
import com.codearena.entity.Test;
import com.codearena.entity.enums.Difficulty;
import com.codearena.exception.ApiException;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.StudentQuestionAssignmentRepository;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * Direct port of start_test's random-question-selection algorithm
 * (students.py). Every branch, including the race-recovery bug where a
 * concurrent duplicate start recovers only the single assigned question
 * (losing the rest of the originally-sampled set), is preserved exactly
 * per the migration plan -- do not "fix" it here.
 */
@Service
public class QuestionSelectionService {

    private final QuestionRepository questionRepository;
    private final StudentQuestionAssignmentRepository assignmentRepository;

    public QuestionSelectionService(
            QuestionRepository questionRepository, StudentQuestionAssignmentRepository assignmentRepository) {
        this.questionRepository = questionRepository;
        this.assignmentRepository = assignmentRepository;
    }

    /**
     * Resolves the list of questions to assign to a brand-new attempt.
     * Only called when no StudentAttempt exists yet for (studentId, testId).
     */
    public List<Question> resolveQuestionsForNewAttempt(Test test, Long studentId) {
        var existingAssignment = assignmentRepository.findByStudentIdAndTestId(studentId, test.getId());
        if (existingAssignment.isPresent()) {
            Question assigned =
                    questionRepository
                            .findById(existingAssignment.get().getQuestionId())
                            .orElseThrow(() -> ApiException.badRequest("Assigned question no longer exists"));
            return List.of(assigned);
        }

        List<Question> pool = questionRepository.findPoolByTestId(test.getId());
        if (pool.isEmpty()) {
            throw ApiException.badRequest("No questions available in the test pool");
        }

        List<Question> easy = pool.stream().filter(q -> q.getDifficulty() == Difficulty.EASY).toList();
        List<Question> medium = pool.stream().filter(q -> q.getDifficulty() == Difficulty.MEDIUM).toList();
        List<Question> hard = pool.stream().filter(q -> q.getDifficulty() == Difficulty.HARD).toList();

        int easyCnt = test.getEasyCount();
        int medCnt = test.getMediumCount();
        int hardCnt = test.getHardCount();
        int qps = test.getQuestionsPerStudent();

        List<Question> selected = new ArrayList<>();
        selected.addAll(sampleBucket(easy, easyCnt, "easy"));
        selected.addAll(sampleBucket(medium, medCnt, "medium"));
        selected.addAll(sampleBucket(hard, hardCnt, "hard"));

        if (selected.size() > qps) {
            throw ApiException.badRequest(
                    "Difficulty counts (" + easyCnt + "+" + medCnt + "+" + hardCnt + ") exceed questions per student (" + qps + ")");
        }

        if (selected.size() < qps) {
            List<Question> remaining = new ArrayList<>(pool);
            remaining.removeAll(selected);
            int needed = qps - selected.size();
            if (remaining.size() < needed) {
                throw ApiException.badRequest("Not enough questions in pool (" + pool.size() + " < " + qps + ")");
            }
            Collections.shuffle(remaining);
            selected.addAll(remaining.subList(0, needed));
        }

        Collections.shuffle(selected);

        Question selectedQ = selected.get(0);
        try {
            assignmentRepository.saveAndFlush(
                    StudentQuestionAssignment.builder()
                            .studentId(studentId)
                            .testId(test.getId())
                            .questionId(selectedQ.getId())
                            .build());
        } catch (DataIntegrityViolationException raceCondition) {
            // Concurrent duplicate start: recover only the single assigned
            // question, matching the Python app's own race-recovery bug
            // exactly (the rest of `selected` is intentionally lost here).
            var recovered = assignmentRepository.findByStudentIdAndTestId(studentId, test.getId());
            if (recovered.isPresent()) {
                Question assigned = questionRepository.findById(recovered.get().getQuestionId()).orElse(null);
                if (assigned != null) {
                    return List.of(assigned);
                }
            }
        }

        return selected;
    }

    private List<Question> sampleBucket(List<Question> bucket, int count, String difficultyLabel) {
        if (count <= 0) {
            return List.of();
        }
        if (bucket.size() < count) {
            throw ApiException.badRequest(
                    "Not enough " + difficultyLabel + " questions in pool (" + bucket.size() + " < " + count + ")");
        }
        List<Question> shuffled = new ArrayList<>(bucket);
        Collections.shuffle(shuffled);
        return shuffled.subList(0, count);
    }
}
