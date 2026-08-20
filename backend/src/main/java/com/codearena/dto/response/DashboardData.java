package com.codearena.dto.response;

import java.util.List;

public record DashboardData(
        int totalStudents,
        int totalTests,
        int activeTests,
        int completedTests,
        int totalQuestions,
        int totalSubmissions,
        List<UserOut> students,
        List<TestOut> tests,
        List<QuestionOut> questions,
        List<AttemptOut> attempts,
        List<SubmissionOut> submissions,
        List<QuestionBankOut> banks) {}
