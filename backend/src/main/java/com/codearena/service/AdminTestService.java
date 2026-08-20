package com.codearena.service;

import com.codearena.dto.request.TestCreate;
import com.codearena.dto.response.TestOut;
import com.codearena.entity.Test;
import com.codearena.entity.TestQuestion;
import com.codearena.entity.enums.ScoringType;
import com.codearena.exception.ApiException;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.TestQuestionRepository;
import com.codearena.repository.TestRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.StreamSupport;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminTestService {

    private final TestRepository testRepository;
    private final TestQuestionRepository testQuestionRepository;
    private final QuestionRepository questionRepository;

    public AdminTestService(
            TestRepository testRepository, TestQuestionRepository testQuestionRepository, QuestionRepository questionRepository) {
        this.testRepository = testRepository;
        this.testQuestionRepository = testQuestionRepository;
        this.questionRepository = questionRepository;
    }

    public List<TestOut> list() {
        return testRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toOut).toList();
    }

    @Transactional
    public TestOut create(TestCreate request) {
        List<Long> questionIds = request.getQuestionIds();
        int qps = request.getQuestionsPerStudent();

        if (questionIds.size() < qps) {
            throw ApiException.badRequest(
                    "Question pool has " + questionIds.size() + " questions but test requires " + qps + " per student");
        }
        long existingCount = questionRepository.findByIdIn(questionIds).size();
        if (existingCount != questionIds.size()) {
            throw ApiException.badRequest("One or more question ids do not exist");
        }

        Test test =
                Test.builder()
                        .name(request.getName())
                        .description(request.getDescription())
                        .year(request.getYear() == null ? "Second Year" : request.getYear())
                        .questionBankId(request.getQuestionBankId())
                        .randomizeQuestions(request.isRandomizeQuestions())
                        .startTime(request.getStartTime())
                        .endTime(request.getEndTime())
                        .durationMinutes(request.getDurationMinutes())
                        .totalMarks(request.getTotalMarks())
                        .questionsPerStudent(qps)
                        .easyCount(request.getEasyCount())
                        .mediumCount(request.getMediumCount())
                        .hardCount(request.getHardCount())
                        .allowedLanguages(new ArrayList<>(request.getAllowedLanguages()))
                        .maxViolations(request.getMaxViolations())
                        .allowCopyPaste(request.isAllowCopyPaste())
                        .scoringType(ScoringType.fromDbValue(request.getScoringType()))
                        .showResults(request.isShowResults())
                        .build();
        test = testRepository.saveAndFlush(test);

        for (Long qId : questionIds) {
            testQuestionRepository.saveAndFlush(TestQuestion.builder().testId(test.getId()).questionId(qId).build());
        }
        return toOut(test);
    }

    @Transactional
    public TestOut update(Long id, JsonNode body) {
        Test test = findOrThrow(id);

        int qps = body.has("questions_per_student") ? body.get("questions_per_student").asInt() : test.getQuestionsPerStudent();

        List<Long> questionIds = null;
        if (body.has("question_ids")) {
            questionIds = new ArrayList<>();
            for (JsonNode n : body.get("question_ids")) {
                questionIds.add(n.asLong());
            }
            if (questionIds.size() < qps) {
                throw ApiException.badRequest(
                        "Question pool has " + questionIds.size() + " questions but test requires " + qps + " per student");
            }
            long existingCount = questionRepository.findByIdIn(questionIds).size();
            if (existingCount != questionIds.size()) {
                throw ApiException.badRequest("One or more question ids do not exist");
            }
        }

        if (body.has("name")) test.setName(body.get("name").asText());
        if (body.has("description")) test.setDescription(textOrNull(body.get("description")));
        if (body.has("year")) test.setYear(body.get("year").asText());
        if (body.has("question_bank_id")) test.setQuestionBankId(body.get("question_bank_id").isNull() ? null : body.get("question_bank_id").asLong());
        if (body.has("randomize_questions")) test.setRandomizeQuestions(body.get("randomize_questions").asBoolean());
        if (body.has("start_time")) test.setStartTime(OffsetDateTime.parse(body.get("start_time").asText()));
        if (body.has("end_time")) test.setEndTime(OffsetDateTime.parse(body.get("end_time").asText()));
        if (body.has("duration_minutes")) test.setDurationMinutes(body.get("duration_minutes").asInt());
        if (body.has("total_marks")) test.setTotalMarks(body.get("total_marks").asInt());
        if (body.has("questions_per_student")) test.setQuestionsPerStudent(qps);
        if (body.has("easy_count")) test.setEasyCount(body.get("easy_count").asInt());
        if (body.has("medium_count")) test.setMediumCount(body.get("medium_count").asInt());
        if (body.has("hard_count")) test.setHardCount(body.get("hard_count").asInt());
        if (body.has("allowed_languages")) {
            List<String> langs = new ArrayList<>();
            body.get("allowed_languages").forEach(n -> langs.add(n.asText()));
            test.setAllowedLanguages(langs);
        }
        if (body.has("max_violations")) test.setMaxViolations(body.get("max_violations").asInt());
        if (body.has("allow_copy_paste")) test.setAllowCopyPaste(body.get("allow_copy_paste").asBoolean());
        if (body.has("scoring_type")) test.setScoringType(ScoringType.fromDbValue(body.get("scoring_type").asText()));
        if (body.has("show_results")) test.setShowResults(body.get("show_results").asBoolean());

        test = testRepository.saveAndFlush(test);

        if (questionIds != null) {
            testQuestionRepository.deleteByTestId(test.getId());
            testQuestionRepository.flush();
            for (Long qId : questionIds) {
                testQuestionRepository.saveAndFlush(TestQuestion.builder().testId(test.getId()).questionId(qId).build());
            }
        }

        return toOut(test);
    }

    public void delete(Long id) {
        testRepository.delete(findOrThrow(id));
    }

    private Test findOrThrow(Long id) {
        return testRepository.findById(id).orElseThrow(() -> ApiException.notFound("Test not found"));
    }

    private String textOrNull(JsonNode node) {
        return node.isNull() ? null : node.asText();
    }

    private TestOut toOut(Test t) {
        List<TestQuestion> links = testQuestionRepository.findByTestId(t.getId());
        List<Long> questionIds = links.stream().map(TestQuestion::getQuestionId).toList();
        return new TestOut(
                t.getId(),
                t.getName(),
                t.getDescription(),
                t.getYear(),
                t.getQuestionBankId(),
                t.getRandomizeQuestions(),
                t.getStartTime(),
                t.getEndTime(),
                t.getDurationMinutes(),
                t.getTotalMarks(),
                t.getQuestionsPerStudent(),
                t.getEasyCount(),
                t.getMediumCount(),
                t.getHardCount(),
                t.getAllowedLanguages(),
                t.getMaxViolations(),
                t.getAllowCopyPaste(),
                t.getScoringType().dbValue(),
                t.getShowResults(),
                questionIds.size(),
                questionIds,
                t.getCreatedAt());
    }
}
