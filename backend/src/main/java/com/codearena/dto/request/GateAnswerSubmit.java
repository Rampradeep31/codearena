package com.codearena.dto.request;
import lombok.Data;
@Data
public class GateAnswerSubmit {
    private Long questionId;
    private String givenAnswer; // null = unanswered
    private Boolean isMarkedForReview;
}
