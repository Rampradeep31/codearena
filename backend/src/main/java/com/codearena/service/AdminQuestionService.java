package com.codearena.service;

import com.codearena.dto.request.AiGenerateQuestionRequest;
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
    private final GeminiService geminiService;

    public AdminQuestionService(
            QuestionRepository questionRepository, 
            TestCaseRepository testCaseRepository, 
            ObjectMapper objectMapper,
            GeminiService geminiService) {
        this.questionRepository = questionRepository;
        this.testCaseRepository = testCaseRepository;
        this.objectMapper = objectMapper;
        this.geminiService = geminiService;
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

    @Transactional
    public List<QuestionOut> aiGenerateQuestion(AiGenerateQuestionRequest request) {
        String systemInstruction = 
            "You are an expert software engineer and competitive programming problem setter.\n" +
            "Your task is to generate one or more comprehensive, high-quality programming questions (matching LeetCode or Competitive Programming style) based on the user's prompt (which might request a specific number of questions, e.g. '3 questions on array sorting', or just a single problem topic/LeetCode ID).\n" +
            "Each problem must use standard console input (reading from stdin) and standard console output (writing to stdout). Do NOT use function signature formats.\n\n" +
            "Return your response as a single, valid JSON object containing an array of questions matching this schema:\n" +
            "{\n" +
            "  \"questions\": [\n" +
            "    {\n" +
            "      \"title\": \"Problem Title\",\n" +
            "      \"statement\": \"Detailed markdown problem statement explaining the task, standard I/O format, and sample details.\",\n" +
            "      \"difficulty\": \"easy\" | \"medium\" | \"hard\",\n" +
            "      \"topic\": \"Arrays\" | \"Strings\" | \"Linked List\" | \"Stack\" | \"Queue\" | \"Trees\" | \"Graphs\" | \"Dynamic Programming\" | \"Recursion\" | \"Sorting\" | \"Searching\" | \"Two Pointers\" | \"Sliding Window\" | \"Hashing\",\n" +
            "      \"marks\": 10,\n" +
            "      \"input_format\": \"Detailed description of how input is read from standard input line-by-line.\",\n" +
            "      \"output_format\": \"Detailed description of what should be printed to standard output.\",\n" +
            "      \"constraints\": \"Variable ranges/constraints (e.g. 1 <= N <= 10^5).\",\n" +
            "      \"sample_input\": \"First sample input string matching input_format.\",\n" +
            "      \"sample_output\": \"The output corresponding to sample_input string.\",\n" +
            "      \"explanation\": \"Explanation of how sample_input maps to sample_output.\",\n" +
            "      \"test_cases\": [\n" +
            "        {\n" +
            "          \"input\": \"Console input string for test case 1\",\n" +
            "          \"expected_output\": \"Expected console output string for test case 1\",\n" +
            "          \"is_hidden\": false\n" +
            "        }\n" +
            "      ]\n" +
            "    }\n" +
            "  ]\n" +
            "}\n\n" +
            "CRITICAL RULES:\n" +
            "1. For each question, the \"test_cases\" array MUST contain EXACTLY 8 test case objects.\n" +
            "2. The first 2 test cases (index 0 and 1) MUST have \"is_hidden\": false. They must match the sample inputs/outputs.\n" +
            "3. The remaining 6 test cases (indices 2 to 7) MUST have \"is_hidden\": true. These are hidden cases covering edge cases, empty bounds, maximum bounds, negative values, duplicates, etc.\n" +
            "4. Input and expected_output fields MUST be strings.\n" +
            "5. Do not wrap response in markdown code blocks. Output raw JSON.";

        try {
            String jsonStr = geminiService.generate(systemInstruction, request.getPrompt());
            JsonNode root = objectMapper.readTree(jsonStr);

            List<QuestionOut> createdQuestions = new java.util.ArrayList<>();
            JsonNode questionsNode = root.path("questions");

            if (questionsNode.isArray()) {
                for (JsonNode qNode : questionsNode) {
                    String title = qNode.path("title").asText("AI Generated Question");
                    String statement = qNode.path("statement").asText("Problem statement here...");
                    String difficultyStr = qNode.path("difficulty").asText("easy");
                    int marks = qNode.path("marks").asInt(10);
                    String topic = qNode.path("topic").asText("General");
                    String inputFormat = qNode.path("input_format").asText("");
                    String outputFormat = qNode.path("output_format").asText("");
                    String constraints = qNode.path("constraints").asText("");
                    String sampleInput = qNode.path("sample_input").asText("");
                    String sampleOutput = qNode.path("sample_output").asText("");
                    String explanation = qNode.path("explanation").asText("");

                    Question question = Question.builder()
                            .title(title)
                            .statement(statement)
                            .difficulty(Difficulty.fromDbValue(difficultyStr))
                            .marks(marks)
                            .topic(topic)
                            .inputFormat(inputFormat)
                            .outputFormat(outputFormat)
                            .constraints(constraints)
                            .sampleInput(sampleInput)
                            .sampleOutput(sampleOutput)
                            .explanation(explanation)
                            .questionBankId(request.getQuestionBankId())
                            .build();

                    question = questionRepository.saveAndFlush(question);

                    JsonNode testCasesNode = qNode.path("test_cases");
                    if (testCasesNode.isArray()) {
                        for (JsonNode tcNode : testCasesNode) {
                            String tcInput = tcNode.path("input").asText("");
                            String tcOutput = tcNode.path("expected_output").asText("");
                            boolean isHidden = tcNode.path("is_hidden").asBoolean(false);
                            testCaseRepository.saveAndFlush(
                                    TestCase.builder()
                                            .questionId(question.getId())
                                            .input(tcInput)
                                            .expectedOutput(tcOutput)
                                            .isHidden(isHidden)
                                            .build());
                        }
                    }
                    createdQuestions.add(toOutWithTestCases(question));
                }
            }

            return createdQuestions;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.badRequest("Failed to generate questions with AI: " + e.getMessage());
        }
    }

    @Transactional
    public QuestionOut aiStandardizeTestCases(Long questionId) {
        Question question = findOrThrow(questionId);

        String systemInstruction = String.format(
            "You are an expert competitive programming problem setter.\n" +
            "We have an existing question:\n" +
            "Title: %s\n" +
            "Statement: %s\n" +
            "Input Format: %s\n" +
            "Output Format: %s\n" +
            "Constraints: %s\n" +
            "Sample Input: %s\n" +
            "Sample Output: %s\n\n" +
            "Your task is to generate EXACTLY 8 test cases for this question. The test cases must match the standard console I/O structure of the problem.\n" +
            "Return your response as a single, valid JSON object matching this schema:\n" +
            "{\n" +
            "  \"test_cases\": [\n" +
            "    {\n" +
            "      \"input\": \"Console input string for test case 1\",\n" +
            "      \"expected_output\": \"Expected console output string for test case 1\",\n" +
            "      \"is_hidden\": false\n" +
            "    }\n" +
            "  ]\n" +
            "}\n\n" +
            "CRITICAL RULES:\n" +
            "1. The \"test_cases\" array MUST contain EXACTLY 8 test case objects.\n" +
            "2. The first 2 test cases (index 0 and 1) MUST have \"is_hidden\": false. They must match the sample inputs/outputs.\n" +
            "3. The remaining 6 test cases (indices 2 to 7) MUST have \"is_hidden\": true. These are hidden cases covering edge cases, boundary conditions, performance test cases, etc.\n" +
            "4. Input and expected_output fields MUST be strings.\n" +
            "5. Do not wrap response in markdown code blocks. Output raw JSON.",
            question.getTitle(),
            question.getStatement(),
            question.getInputFormat() != null ? question.getInputFormat() : "",
            question.getOutputFormat() != null ? question.getOutputFormat() : "",
            question.getConstraints() != null ? question.getConstraints() : "",
            question.getSampleInput() != null ? question.getSampleInput() : "",
            question.getSampleOutput() != null ? question.getSampleOutput() : ""
        );

        try {
            String jsonStr = geminiService.generate(systemInstruction, "Please generate the test cases.");
            JsonNode root = objectMapper.readTree(jsonStr);

            testCaseRepository.deleteByQuestionId(question.getId());
            testCaseRepository.flush();

            JsonNode testCasesNode = root.path("test_cases");
            if (testCasesNode.isArray()) {
                for (JsonNode tcNode : testCasesNode) {
                    String tcInput = tcNode.path("input").asText("");
                    String tcOutput = tcNode.path("expected_output").asText("");
                    boolean isHidden = tcNode.path("is_hidden").asBoolean(false);
                    testCaseRepository.saveAndFlush(
                            TestCase.builder()
                                    .questionId(question.getId())
                                    .input(tcInput)
                                    .expectedOutput(tcOutput)
                                    .isHidden(isHidden)
                                    .build());
                }
            }

            return toOutWithTestCases(question);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.badRequest("Failed to generate test cases with AI: " + e.getMessage());
        }
    }
}
