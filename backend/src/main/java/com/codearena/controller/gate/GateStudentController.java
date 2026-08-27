package com.codearena.controller.gate;

import com.codearena.dto.request.GateAnswerSubmit;
import com.codearena.dto.response.*;
import com.codearena.entity.User;
import com.codearena.security.CurrentUserProvider;
import com.codearena.service.GateStudentService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/gate/student")
public class GateStudentController {

    private final GateStudentService service;
    private final CurrentUserProvider currentUserProvider;

    public GateStudentController(GateStudentService service, CurrentUserProvider currentUserProvider) {
        this.service = service;
        this.currentUserProvider = currentUserProvider;
    }

    private User student() { return currentUserProvider.get(); }

    @GetMapping("/tests")
    public List<GateTestOut> listTests() {
        student();
        return service.listActiveTests();
    }

    @GetMapping("/tests/{testId}/questions")
    public List<GateQuestionOut> getQuestions(@PathVariable Long testId) {
        student();
        return service.getQuestionsForStudent(testId);
    }

    @PostMapping("/tests/{testId}/start")
    @ResponseStatus(HttpStatus.CREATED)
    public GateAttemptOut startAttempt(@PathVariable Long testId) {
        User u = student();
        return service.startAttempt(testId, u.getId());
    }

    @PutMapping("/attempts/{attemptId}/answer")
    public GateAttemptAnswerOut saveAnswer(@PathVariable Long attemptId, @RequestBody GateAnswerSubmit req) {
        student();
        return service.saveAnswer(attemptId, req);
    }

    @PostMapping("/attempts/{attemptId}/submit")
    public GateAttemptOut submitAttempt(@PathVariable Long attemptId) {
        User u = student();
        return service.submitAttempt(attemptId, u.getId());
    }

    @GetMapping("/attempts/{attemptId}/result")
    public GateAttemptOut getResult(@PathVariable Long attemptId) {
        User u = student();
        return service.getAttemptResult(attemptId, u.getId());
    }

    @GetMapping("/attempts/{attemptId}/result-questions")
    public List<GateQuestionOut> getResultQuestions(@PathVariable Long attemptId) {
        User u = student();
        return service.getQuestionsForResult(attemptId, u.getId());
    }

    @GetMapping("/my-attempts")
    public List<GateAttemptOut> myAttempts() {
        User u = student();
        return service.getStudentAttempts(u.getId());
    }
}
