package com.codearena.dto.response;
import lombok.AllArgsConstructor;
import lombok.Data;
@Data @AllArgsConstructor
public class GateAttemptAnswerOut {
    private Long questionId;
    private String givenAnswer;
    private Boolean isCorrect;
    private Double marksObtained;
    private Boolean isMarkedForReview;
}
