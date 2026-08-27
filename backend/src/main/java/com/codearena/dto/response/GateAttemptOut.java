package com.codearena.dto.response;
import lombok.AllArgsConstructor;
import lombok.Data;
import java.time.OffsetDateTime;
import java.util.List;

@Data @AllArgsConstructor
public class GateAttemptOut {
    private Long id;
    private Long gateTestId;
    private String testTitle;
    private Long studentId;
    private String studentName;
    private String studentEmail;
    private OffsetDateTime startTime;
    private OffsetDateTime endTime;
    private Double score;
    private String status;
    private List<GateAttemptAnswerOut> answers;
}

