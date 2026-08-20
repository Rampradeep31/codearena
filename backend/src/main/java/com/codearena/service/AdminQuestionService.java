package com.codearena.service;

import com.codearena.dto.request.QuestionCreate;
import com.codearena.dto.request.TestCaseCreate;
import com.codearena.dto.response.QuestionOut;
import com.codearena.dto.response.TestCaseOut;
import com.codearena.entity.Question;
import com.codearena.entity.TestCase;
import com.codearena.entity.enums.Difficulty;
import com.codearena.exception.ApiException;
import com.codearena.repository.QuestionRepository;
import com.codearena.repository.TestCaseRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminQuestionService {

    private final QuestionRepository questionRepository;
    private final TestCaseRepository testCaseRepository;
    private final ObjectMapper objectMapper;

    public AdminQuestionService(
            QuestionRepository questionRepository, TestCaseRepository testCaseRepository, ObjectMapper objectMapper) {
        this.questionRepository = questionRepository;
        this.testCaseRepository = testCaseRepository;
        this.objectMapper = objectMapper;
    }

    public List<QuestionOut> search(String difficulty, String topic, String search) {
        Difficulty difficultyEnum = difficulty == null ? null : Difficulty.fromDbValue(difficulty);
        return questionRepository.search(difficultyEnum, topic, search).stream().map(this::toOutWithTestCases).toList();
    }

    @Transactional
    public QuestionOut create(QuestionCreate request) {
        Question question =
                Question.builder()
                        .title(request.getTitle())
                        .statement(request.getStatement())
                        .difficulty(Difficulty.fromDbValue(request.getDifficulty()))
                        .marks(request.getMarks() == null ? 10 : request.getMarks())
                        .topic(request.getTopic() == null ? "General" : request.getTopic())
                        .inputFormat(request.getInputFormat())
                        .outputFormat(request.getOutputFormat())
                        .constraints(request.getConstraints())
                        .sampleInput(request.getSampleInput())
                        .sampleOutput(request.getSampleOutput())
                        .explanation(request.getExplanation())
                        .questionBankId(request.getQuestionBankId())
                        .build();
        question = questionRepository.saveAndFlush(question);

        for (TestCaseCreate tc : request.getTestCases()) {
            testCaseRepository.saveAndFlush(
                    TestCase.builder()
                            .questionId(question.getId())
                            .input(tc.getInput())
                            .expectedOutput(tc.getExpectedOutput())
                            .isHidden(tc.isHidden())
                            .build());
        }
        return toOutWithTestCases(question);
    }

    public QuestionOut get(Long id) {
        return toOutWithTestCases(findOrThrow(id));
    }

    @Transactional
    public QuestionOut update(Long id, JsonNode body) {
        Question question = findOrThrow(id);

        if (body.has("title")) question.setTitle(body.get("title").asText());
        if (body.has("statement")) question.setStatement(body.get("statement").asText());
        if (body.has("difficulty")) question.setDifficulty(Difficulty.fromDbValue(body.get("difficulty").asText()));
        if (body.has("marks")) question.setMarks(body.get("marks").asInt());
        if (body.has("topic")) question.setTopic(body.get("topic").asText());
        if (body.has("input_format")) question.setInputFormat(textOrNull(body.get("input_format")));
        if (body.has("output_format")) question.setOutputFormat(textOrNull(body.get("output_format")));
        if (body.has("constraints")) question.setConstraints(textOrNull(body.get("constraints")));
        if (body.has("sample_input")) question.setSampleInput(textOrNull(body.get("sample_input")));
        if (body.has("sample_output")) question.setSampleOutput(textOrNull(body.get("sample_output")));
        if (body.has("explanation")) question.setExplanation(textOrNull(body.get("explanation")));
        if (body.has("question_bank_id")) {
            JsonNode node = body.get("question_bank_id");
            if (node.isNull() || (node.isTextual() && node.asText().isEmpty())) {
                question.setQuestionBankId(null);
            } else {
                question.setQuestionBankId(node.asLong());
            }
        }

        question = questionRepository.saveAndFlush(question);

        // Full-replace semantics: only touched when the key is present at all.
        if (body.has("test_cases")) {
            testCaseRepository.deleteByQuestionId(question.getId());
            testCaseRepository.flush();
            for (JsonNode tcNode : body.get("test_cases")) {
                TestCaseCreate tc = objectMapper.convertValue(tcNode, TestCaseCreate.class);
                testCaseRepository.saveAndFlush(
                        TestCase.builder()
                                .questionId(question.getId())
                                .input(tc.getInput())
                                .expectedOutput(tc.getExpectedOutput())
                                .isHidden(tc.isHidden())
                                .build());
            }
        }

        return toOutWithTestCases(question);
    }

    public void delete(Long id) {
        Question question = findOrThrow(id);
        questionRepository.delete(question);
    }

    public TestCaseOut addTestCase(Long questionId, TestCaseCreate request) {
        findOrThrow(questionId);
        TestCase testCase =
                testCaseRepository.saveAndFlush(
                        TestCase.builder()
                                .questionId(questionId)
                                .input(request.getInput())
                                .expectedOutput(request.getExpectedOutput())
                                .isHidden(request.isHidden())
                                .build());
        return toTestCaseOut(testCase);
    }

    public void deleteTestCase(Long testCaseId) {
        TestCase testCase =
                testCaseRepository.findById(testCaseId).orElseThrow(() -> ApiException.notFound("Test case not found"));
        testCaseRepository.delete(testCase);
    }

    private Question findOrThrow(Long id) {
        return questionRepository.findById(id).orElseThrow(() -> ApiException.notFound("Question not found"));
    }

    private String textOrNull(JsonNode node) {
        return node.isNull() ? null : node.asText();
    }

    private QuestionOut toOutWithTestCases(Question q) {
        List<TestCaseOut> testCases = testCaseRepository.findByQuestionId(q.getId()).stream().map(this::toTestCaseOut).toList();
        return new QuestionOut(
                q.getId(),
                q.getTitle(),
                q.getStatement(),
                q.getDifficulty().dbValue(),
                q.getMarks(),
                q.getTopic(),
                q.getInputFormat(),
                q.getOutputFormat(),
                q.getConstraints(),
                q.getSampleInput(),
                q.getSampleOutput(),
                q.getExplanation(),
                q.getQuestionBankId(),
                testCases,
                q.getCreatedAt());
    }

    private TestCaseOut toTestCaseOut(TestCase tc) {
        return new TestCaseOut(tc.getId(), tc.getInput(), tc.getExpectedOutput(), tc.getIsHidden());
    }
}
