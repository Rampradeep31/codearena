package com.codearena.service;

import com.codearena.dto.request.GateAnswerSubmit;
import com.codearena.dto.response.*;
import com.codearena.entity.*;
import com.codearena.exception.ApiException;
import com.codearena.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class GateStudentService {

    private final GateTestRepository testRepo;
    private final GateTestQuestionRepository testQuestionRepo;
    private final GateQuestionRepository questionRepo;
    private final GateAttemptRepository attemptRepo;
    private final GateAttemptAnswerRepository answerRepo;
    private final GateAdminService adminService;

    public GateStudentService(GateTestRepository testRepo, GateTestQuestionRepository testQuestionRepo,
            GateQuestionRepository questionRepo, GateAttemptRepository attemptRepo,
            GateAttemptAnswerRepository answerRepo, GateAdminService adminService) {
        this.testRepo = testRepo;
        this.testQuestionRepo = testQuestionRepo;
        this.questionRepo = questionRepo;
        this.attemptRepo = attemptRepo;
        this.answerRepo = answerRepo;
        this.adminService = adminService;
    }

    public List<GateTestOut> listActiveTests() {
        return testRepo.findByIsActiveTrue().stream()
                .map(adminService::toTestOut).collect(Collectors.toList());
    }

    /** Returns questions WITHOUT correctAnswer so students cannot see answers during exam */
    public List<GateQuestionOut> getQuestionsForStudent(Long testId) {
        return testQuestionRepo.findByGateTestIdOrderByOrderIndex(testId).stream()
                .map(tq -> questionRepo.findById(tq.getGateQuestionId()).orElse(null))
                .filter(q -> q != null)
                .map(q -> new GateQuestionOut(
                        q.getId(), q.getQuestionType(), q.getSubject(), q.getStatement(),
                        q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD(),
                        null, // correctAnswer hidden during exam
                        q.getMarks(), q.getNegativeMarks(), null, q.getDifficulty(), q.getCreatedAt()))
                .collect(Collectors.toList());
    }

    /** Returns full questions WITH correctAnswer and explanation for post-exam review */
    public List<GateQuestionOut> getQuestionsForResult(Long attemptId, Long studentId) {
        GateAttempt attempt = attemptRepo.findById(attemptId)
                .orElseThrow(() -> ApiException.notFound("Attempt not found"));
        if (!attempt.getStudentId().equals(studentId)) {
            throw ApiException.forbidden("Access denied.");
        }
        return testQuestionRepo.findByGateTestIdOrderByOrderIndex(attempt.getGateTestId()).stream()
                .map(tq -> questionRepo.findById(tq.getGateQuestionId()).map(adminService::toOut).orElse(null))
                .filter(q -> q != null)
                .collect(Collectors.toList());
    }

    @Transactional
    public GateAttemptOut startAttempt(Long testId, Long studentId) {
        testRepo.findById(testId).orElseThrow(() -> ApiException.notFound("GATE test not found"));
        java.util.Optional<GateAttempt> existing = attemptRepo.findByGateTestIdAndStudentId(testId, studentId);
        if (existing.isPresent()) {
            GateAttempt att = existing.get();
            if ("SUBMITTED".equals(att.getStatus())) {
                throw ApiException.badRequest("You have already submitted this test.");
            }
            return adminService.toAttemptOut(att, answerRepo.findByGateAttemptId(att.getId()));
        }
        GateAttempt attempt = GateAttempt.builder()
                .gateTestId(testId)
                .studentId(studentId)
                .startTime(OffsetDateTime.now())
                .status("ONGOING")
                .build();
        attempt = attemptRepo.saveAndFlush(attempt);
        return adminService.toAttemptOut(attempt, null);
    }

    @Transactional
    public GateAttemptAnswerOut saveAnswer(Long attemptId, GateAnswerSubmit req) {
        GateAttempt attempt = attemptRepo.findById(attemptId)
                .orElseThrow(() -> ApiException.notFound("Attempt not found"));
        if ("SUBMITTED".equals(attempt.getStatus())) {
            throw ApiException.badRequest("This attempt is already submitted.");
        }

        GateAttemptAnswer answer = answerRepo
                .findByGateAttemptIdAndGateQuestionId(attemptId, req.getQuestionId())
                .orElseGet(() -> GateAttemptAnswer.builder()
                        .gateAttemptId(attemptId)
                        .gateQuestionId(req.getQuestionId())
                        .build());

        answer.setGivenAnswer(req.getGivenAnswer());
        if (req.getIsMarkedForReview() != null) answer.setIsMarkedForReview(req.getIsMarkedForReview());
        answer = answerRepo.saveAndFlush(answer);
        return new GateAttemptAnswerOut(answer.getGateQuestionId(), answer.getGivenAnswer(),
                answer.getIsCorrect(), answer.getMarksObtained(), answer.getIsMarkedForReview());
    }

    @Transactional
    public GateAttemptOut submitAttempt(Long attemptId, Long studentId) {
        GateAttempt attempt = attemptRepo.findById(attemptId)
                .orElseThrow(() -> ApiException.notFound("Attempt not found"));
        if (!attempt.getStudentId().equals(studentId))
            throw ApiException.forbidden("You cannot submit another student's attempt.");
        if ("SUBMITTED".equals(attempt.getStatus()))
            return adminService.toAttemptOut(attempt, answerRepo.findByGateAttemptId(attemptId));

        attempt.setEndTime(OffsetDateTime.now());
        attempt.setStatus("SUBMITTED");

        List<GateTestQuestion> testQuestions = testQuestionRepo.findByGateTestIdOrderByOrderIndex(attempt.getGateTestId());
        double totalScore = 0.0;
        for (GateTestQuestion tq : testQuestions) {
            GateQuestion q = questionRepo.findById(tq.getGateQuestionId()).orElse(null);
            if (q == null) continue;

            GateAttemptAnswer ans = answerRepo.findByGateAttemptIdAndGateQuestionId(attemptId, q.getId())
                    .orElseGet(() -> GateAttemptAnswer.builder()
                            .gateAttemptId(attemptId)
                            .gateQuestionId(q.getId())
                            .givenAnswer(null)
                            .isMarkedForReview(false)
                            .build());

            if (ans.getGivenAnswer() == null || ans.getGivenAnswer().isBlank()) {
                ans.setIsCorrect(null);
                ans.setMarksObtained(0.0);
            } else {
                boolean correct = checkAnswer(q, ans.getGivenAnswer());
                ans.setIsCorrect(correct);
                double negative = "FITB".equalsIgnoreCase(q.getQuestionType()) ? 0.0 : (q.getNegativeMarks() != null ? q.getNegativeMarks() : 0.33);
                double awarded = correct ? q.getMarks() : -negative;
                ans.setMarksObtained(awarded);
                totalScore += awarded;
            }
            answerRepo.save(ans);
        }
        attempt.setScore(Math.max(0, totalScore));
        attempt = attemptRepo.saveAndFlush(attempt);
        return adminService.toAttemptOut(attempt, answerRepo.findByGateAttemptId(attemptId));
    }

    private boolean checkAnswer(GateQuestion q, String givenAnswer) {
        if (q.getCorrectAnswer() == null || givenAnswer == null) return false;
        String correct = q.getCorrectAnswer().trim();
        String given = givenAnswer.trim();
        if (correct.equalsIgnoreCase(given)) return true;

        if ("FITB".equalsIgnoreCase(q.getQuestionType())) {
            try {
                double cVal = Double.parseDouble(correct);
                double gVal = Double.parseDouble(given);
                return Math.abs(cVal - gVal) < 0.001;
            } catch (NumberFormatException ignored) {}
        }
        return false;
    }

    public GateAttemptOut getAttemptResult(Long attemptId, Long studentId) {
        GateAttempt attempt = attemptRepo.findById(attemptId)
                .orElseThrow(() -> ApiException.notFound("Attempt not found"));
        if (!attempt.getStudentId().equals(studentId))
            throw ApiException.forbidden("Access denied.");
        return adminService.toAttemptOut(attempt, answerRepo.findByGateAttemptId(attemptId));
    }

    public List<GateAttemptOut> getStudentAttempts(Long studentId) {
        return attemptRepo.findByStudentId(studentId).stream()
                .map(a -> adminService.toAttemptOut(a, null))
                .collect(Collectors.toList());
    }
}
