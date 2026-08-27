package com.codearena.dto.response;
import lombok.AllArgsConstructor;
import lombok.Data;
import java.time.OffsetDateTime;
@Data @AllArgsConstructor
public class GateQuestionOut {
    private Long id;
    private String questionType;
    private String subject;
    private String statement;
    private String optionA;
    private String optionB;
    private String optionC;
    private String optionD;
    private String correctAnswer; // hidden from student response
    private Double marks;
    private Double negativeMarks;
    private String explanation;
    private String difficulty;
    private OffsetDateTime createdAt;
}
