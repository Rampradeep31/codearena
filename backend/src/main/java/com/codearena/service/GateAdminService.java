package com.codearena.service;

import com.codearena.dto.request.*;
import com.codearena.dto.response.*;
import com.codearena.entity.*;
import com.codearena.exception.ApiException;
import com.codearena.repository.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class GateAdminService {

    private final GateQuestionRepository questionRepo;
    private final GateTestRepository testRepo;
    private final GateTestQuestionRepository testQuestionRepo;
    private final GateAttemptRepository attemptRepo;
    private final GateAttemptAnswerRepository answerRepo;
    private final UserRepository userRepo;
    private final GeminiService geminiService;
    private final ObjectMapper objectMapper;

    public GateAdminService(
            GateQuestionRepository questionRepo,
            GateTestRepository testRepo,
            GateTestQuestionRepository testQuestionRepo,
            GateAttemptRepository attemptRepo,
            GateAttemptAnswerRepository answerRepo,
            UserRepository userRepo,
            GeminiService geminiService,
            ObjectMapper objectMapper) {
        this.questionRepo = questionRepo;
        this.testRepo = testRepo;
        this.testQuestionRepo = testQuestionRepo;
        this.attemptRepo = attemptRepo;
        this.answerRepo = answerRepo;
        this.userRepo = userRepo;
        this.geminiService = geminiService;
        this.objectMapper = objectMapper;
    }

    // --- Questions --------------------------------------------------------

    public List<GateQuestionOut> searchQuestions(String subject, String type, String search) {
        String sub = (subject != null && !subject.isBlank()) ? subject.trim() : null;
        String typ = (type != null && !type.isBlank()) ? type.trim() : null;
        String src = (search != null && !search.isBlank()) ? search.trim().toLowerCase() : null;

        return questionRepo.findAll().stream()
                .filter(q -> sub == null || (q.getSubject() != null && q.getSubject().equalsIgnoreCase(sub)))
                .filter(q -> typ == null || (q.getQuestionType() != null && q.getQuestionType().equalsIgnoreCase(typ)))
                .filter(q -> src == null || (q.getStatement() != null && q.getStatement().toLowerCase().contains(src)))
                .map(this::toOut)
                .collect(Collectors.toList());
    }

    @Transactional
    public GateQuestionOut createQuestion(GateQuestionCreate req) {
        GateQuestion q = GateQuestion.builder()
                .questionType(req.getQuestionType())
                .subject(req.getSubject())
                .statement(req.getStatement())
                .optionA(req.getOptionA())
                .optionB(req.getOptionB())
                .optionC(req.getOptionC())
                .optionD(req.getOptionD())
                .correctAnswer(req.getCorrectAnswer())
                .marks(req.getMarks() != null ? req.getMarks() : 1.0)
                .negativeMarks(req.getNegativeMarks() != null ? req.getNegativeMarks() : 0.33)
                .explanation(req.getExplanation())
                .difficulty(req.getDifficulty() != null ? req.getDifficulty() : "medium")
                .build();
        return toOut(questionRepo.saveAndFlush(q));
    }

    @Transactional
    public GateQuestionOut updateQuestion(Long id, GateQuestionCreate req) {
        GateQuestion q = questionRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("GATE question not found: " + id));
        if (req.getQuestionType() != null) q.setQuestionType(req.getQuestionType());
        if (req.getSubject() != null) q.setSubject(req.getSubject());
        if (req.getStatement() != null) q.setStatement(req.getStatement());
        if (req.getOptionA() != null) q.setOptionA(req.getOptionA());
        if (req.getOptionB() != null) q.setOptionB(req.getOptionB());
        if (req.getOptionC() != null) q.setOptionC(req.getOptionC());
        if (req.getOptionD() != null) q.setOptionD(req.getOptionD());
        if (req.getCorrectAnswer() != null) q.setCorrectAnswer(req.getCorrectAnswer());
        if (req.getMarks() != null) q.setMarks(req.getMarks());
        if (req.getNegativeMarks() != null) q.setNegativeMarks(req.getNegativeMarks());
        if (req.getExplanation() != null) q.setExplanation(req.getExplanation());
        if (req.getDifficulty() != null) q.setDifficulty(req.getDifficulty());
        return toOut(questionRepo.saveAndFlush(q));
    }

    @Transactional
    public void deleteQuestion(Long id) {
        if (!questionRepo.existsById(id)) throw ApiException.notFound("GATE question not found: " + id);
        questionRepo.deleteById(id);
    }

    // --- AI Generate Questions --------------------------------------------

    @Transactional
    public List<GateQuestionOut> aiGenerateQuestions(AiGenerateGateQuestionsRequest req) {
        String systemInstruction =
            "You are an expert GATE exam question setter.\n" +
            "Generate " + req.getCount() + " high-quality GATE-style questions" +
            (req.getSubject() != null ? " on the subject: " + req.getSubject() : "") + ".\n" +
            "Questions can be MCQ (4 options, single correct) or FITB (fill-in-the-blank / numerical answer).\n\n" +
            "Return a single valid JSON object:\n" +
            "{\n" +
            "  \"questions\": [\n" +
            "    {\n" +
            "      \"question_type\": \"MCQ\" | \"FITB\",\n" +
            "      \"subject\": \"Mathematics\" | \"General Aptitude\" | \"Algorithms\" | \"OS\" | \"DBMS\" | \"CN\" | \"Digital Logic\" | \"Programming\" | \"Theory of Computation\",\n" +
            "      \"statement\": \"Full question text with any equations or context\",\n" +
            "      \"option_a\": \"Option A text (null for FITB)\",\n" +
            "      \"option_b\": \"Option B text (null for FITB)\",\n" +
            "      \"option_c\": \"Option C text (null for FITB)\",\n" +
            "      \"option_d\": \"Option D text (null for FITB)\",\n" +
            "      \"correct_answer\": \"A\" | \"B\" | \"C\" | \"D\" or numerical/text for FITB,\n" +
            "      \"marks\": 1 or 2,\n" +
            "      \"negative_marks\": 0.33 for 1-mark, 0.67 for 2-mark,\n" +
            "      \"explanation\": \"Step-by-step solution\",\n" +
            "      \"difficulty\": \"easy\" | \"medium\" | \"hard\"\n" +
            "    }\n" +
            "  ]\n" +
            "}\n\n" +
            "RULES: Output raw JSON only. No markdown code blocks.";

        try {
            String jsonStr = geminiService.generate(systemInstruction, req.getPrompt());
            JsonNode root = objectMapper.readTree(jsonStr);
            JsonNode qArr = root.path("questions");
            List<GateQuestionOut> results = new ArrayList<>();
            if (qArr.isArray()) {
                for (JsonNode n : qArr) {
                    GateQuestion q = GateQuestion.builder()
                            .questionType(n.path("question_type").asText("MCQ"))
                            .subject(n.path("subject").asText("General"))
                            .statement(n.path("statement").asText(""))
                            .optionA(n.path("option_a").isNull() ? null : n.path("option_a").asText(null))
                            .optionB(n.path("option_b").isNull() ? null : n.path("option_b").asText(null))
                            .optionC(n.path("option_c").isNull() ? null : n.path("option_c").asText(null))
                            .optionD(n.path("option_d").isNull() ? null : n.path("option_d").asText(null))
                            .correctAnswer(n.path("correct_answer").asText(""))
                            .marks(n.path("marks").asDouble(1.0))
                            .negativeMarks(n.path("negative_marks").asDouble(0.33))
                            .explanation(n.path("explanation").asText(null))
                            .difficulty(n.path("difficulty").asText("medium"))
                            .build();
                    results.add(toOut(questionRepo.saveAndFlush(q)));
                }
            }
            return results;
        } catch (ApiException e) { throw e; }
        catch (Exception e) { throw ApiException.badRequest("AI generation failed: " + e.getMessage()); }
    }

    // --- PDF Upload & Extract ---------------------------------------------

    @Transactional
    public List<GateQuestionOut> extractFromPdf(String pdfText, String subject) {
        String systemInstruction =
            "You are an expert at extracting GATE exam questions from PDF text.\n" +
            "Parse the provided text and extract ALL questions. For each question determine if it is MCQ or FITB.\n" +
            "Return a single valid JSON object with key 'questions' containing an array:\n" +
            "{\n" +
            "  \"questions\": [\n" +
            "    {\n" +
            "      \"question_type\": \"MCQ\" or \"FITB\",\n" +
            "      \"subject\": \"" + (subject != null ? subject : "General") + "\",\n" +
            "      \"statement\": \"Full question text\",\n" +
            "      \"option_a\": \"text or null\", \"option_b\": \"text or null\",\n" +
            "      \"option_c\": \"text or null\", \"option_d\": \"text or null\",\n" +
            "      \"correct_answer\": \"A/B/C/D or answer text\",\n" +
            "      \"marks\": 1,\n" +
            "      \"negative_marks\": 0.33,\n" +
            "      \"explanation\": null,\n" +
            "      \"difficulty\": \"medium\"\n" +
            "    }\n" +
            "  ]\n" +
            "}\n" +
            "Output raw JSON only.";

        try {
            String jsonStr = geminiService.generate(systemInstruction, pdfText);
            JsonNode root = objectMapper.readTree(jsonStr);
            JsonNode qArr = root.path("questions");
            List<GateQuestionOut> results = new ArrayList<>();
            if (qArr.isArray()) {
                for (JsonNode n : qArr) {
                    String stmt = n.path("statement").asText("");
                    if (stmt.isBlank()) continue;
                    String qType = n.path("question_type").asText("MCQ");
                    String cAns = n.path("correct_answer").asText("A");
                    if (cAns.isBlank()) cAns = "MCQ".equalsIgnoreCase(qType) ? "A" : "0";
                    String qSub = subject != null && !subject.isBlank() ? subject : n.path("subject").asText("General");
                    if (qSub.isBlank()) qSub = "General";

                    GateQuestion q = GateQuestion.builder()
                            .questionType(qType)
                            .subject(qSub)
                            .statement(stmt)
                            .optionA(n.path("option_a").isNull() ? null : n.path("option_a").asText(null))
                            .optionB(n.path("option_b").isNull() ? null : n.path("option_b").asText(null))
                            .optionC(n.path("option_c").isNull() ? null : n.path("option_c").asText(null))
                            .optionD(n.path("option_d").isNull() ? null : n.path("option_d").asText(null))
                            .correctAnswer(cAns)
                            .marks(n.path("marks").asDouble(1.0))
                            .negativeMarks("FITB".equalsIgnoreCase(qType) ? 0.0 : n.path("negative_marks").asDouble(0.33))
                            .explanation(n.path("explanation").isNull() ? null : n.path("explanation").asText(null))
                            .difficulty(n.path("difficulty").asText("medium"))
                            .build();
                    results.add(toOut(questionRepo.saveAndFlush(q)));
                }
            }
            return results;
        } catch (ApiException e) { throw e; }
        catch (Exception e) { throw ApiException.badRequest("PDF extraction failed: " + e.getMessage()); }
    }

    // --- Tests -------------------------------------------------------------

    public List<GateTestOut> listTests() {
        return testRepo.findAll().stream().map(this::toTestOut).collect(Collectors.toList());
    }

    @Transactional
    public GateTestOut createTest(GateTestCreate req) {
        GateTest test = GateTest.builder()
                .title(req.getTitle())
                .description(req.getDescription())
                .durationMinutes(req.getDurationMinutes())
                .totalMarks(req.getTotalMarks() != null ? req.getTotalMarks() : 100.0)
                .isActive(req.getIsActive() != null ? req.getIsActive() : true)
                .startTime(req.getStartTime())
                .endTime(req.getEndTime())
                .instructions(req.getInstructions())
                .build();
        test = testRepo.saveAndFlush(test);
        if (req.getQuestionIds() != null) {
            saveQuestions(test.getId(), req.getQuestionIds());
        }
        return toTestOut(test);
    }

    @Transactional
    public GateTestOut updateTest(Long id, GateTestCreate req) {
        GateTest test = testRepo.findById(id)
                .orElseThrow(() -> ApiException.notFound("GATE test not found: " + id));
        if (req.getTitle() != null) test.setTitle(req.getTitle());
        if (req.getDescription() != null) test.setDescription(req.getDescription());
        if (req.getDurationMinutes() != null) test.setDurationMinutes(req.getDurationMinutes());
        if (req.getTotalMarks() != null) test.setTotalMarks(req.getTotalMarks());
        if (req.getIsActive() != null) test.setIsActive(req.getIsActive());
        if (req.getStartTime() != null) test.setStartTime(req.getStartTime());
        if (req.getEndTime() != null) test.setEndTime(req.getEndTime());
        if (req.getInstructions() != null) test.setInstructions(req.getInstructions());
        test = testRepo.saveAndFlush(test);
        if (req.getQuestionIds() != null) {
            testQuestionRepo.deleteByGateTestId(id);
            saveQuestions(id, req.getQuestionIds());
        }
        return toTestOut(test);
    }

    @Transactional
    public void deleteTest(Long id) {
        if (!testRepo.existsById(id)) throw ApiException.notFound("GATE test not found: " + id);
        testQuestionRepo.deleteByGateTestId(id);
        testRepo.deleteById(id);
    }

    public List<GateQuestionOut> getTestQuestions(Long testId) {
        return testQuestionRepo.findByGateTestIdOrderByOrderIndex(testId).stream()
                .map(tq -> questionRepo.findById(tq.getGateQuestionId())
                        .map(this::toOut)
                        .orElse(null))
                .filter(q -> q != null)
                .collect(Collectors.toList());
    }

    // --- Results / Analytics -----------------------------------------------

    public List<GateAttemptOut> getTestAttempts(Long testId) {
        return attemptRepo.findByGateTestId(testId).stream()
                .map(a -> toAttemptOut(a, null))
                .collect(Collectors.toList());
    }

    // --- Helpers -----------------------------------------------------------

    private void saveQuestions(Long testId, List<Long> ids) {
        for (int i = 0; i < ids.size(); i++) {
            testQuestionRepo.save(GateTestQuestion.builder()
                    .gateTestId(testId)
                    .gateQuestionId(ids.get(i))
                    .orderIndex(i)
                    .build());
        }
    }

    public GateQuestionOut toOut(GateQuestion q) {
        return new GateQuestionOut(q.getId(), q.getQuestionType(), q.getSubject(), q.getStatement(),
                q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD(),
                q.getCorrectAnswer(), q.getMarks(), q.getNegativeMarks(),
                q.getExplanation(), q.getDifficulty(), q.getCreatedAt());
    }

    public GateTestOut toTestOut(GateTest t) {
        int count = (int) testQuestionRepo.countByGateTestId(t.getId());
        return new GateTestOut(t.getId(), t.getTitle(), t.getDescription(), t.getDurationMinutes(),
                t.getTotalMarks(), t.getIsActive(), t.getStartTime(), t.getEndTime(),
                t.getInstructions(), count, t.getCreatedAt());
    }

    public GateAttemptOut toAttemptOut(GateAttempt a, List<GateAttemptAnswer> answers) {
        String title = testRepo.findById(a.getGateTestId())
                .map(GateTest::getTitle).orElse("Unknown Test");
        String sName = null;
        String sEmail = null;
        if (a.getStudentId() != null) {
            User u = userRepo.findById(a.getStudentId()).orElse(null);
            if (u != null) {
                sName = u.getName();
                sEmail = u.getEmail();
            }
        }
        List<GateAttemptAnswerOut> ansOuts = new ArrayList<>();
        if (answers != null) {
            for (GateAttemptAnswer ans : answers) {
                ansOuts.add(new GateAttemptAnswerOut(ans.getGateQuestionId(), ans.getGivenAnswer(),
                        ans.getIsCorrect(), ans.getMarksObtained(), ans.getIsMarkedForReview()));
            }
        }
        return new GateAttemptOut(a.getId(), a.getGateTestId(), title, a.getStudentId(), sName, sEmail,
                a.getStartTime(), a.getEndTime(), a.getScore(), a.getStatus(), ansOuts);
    }
}
