package com.codearena.service;

import com.codearena.config.AppProperties;
import com.codearena.dto.request.ViolationCreate;
import com.codearena.dto.response.ViolationRecorded;
import com.codearena.entity.Test;
import com.codearena.entity.TestAttempt;
import com.codearena.entity.Violation;
import com.codearena.entity.enums.AttemptStatus;
import com.codearena.exception.ApiException;
import com.codearena.repository.TestRepository;
import com.codearena.repository.ViolationRepository;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ports record_violation from students.py, including the 2-second dedup
 * window and the explicit, documented invariant that violations NEVER
 * trigger server-side auto-submit -- auto_submitted is always false here,
 * regardless of how many violations have accumulated.
 */
@Service
public class ViolationService {

    private final AttemptLifecycleService attemptLifecycleService;
    private final AttemptExpiryService attemptExpiryService;
    private final ViolationRepository violationRepository;
    private final TestRepository testRepository;
    private final AppProperties properties;

    public ViolationService(
            AttemptLifecycleService attemptLifecycleService,
            AttemptExpiryService attemptExpiryService,
            ViolationRepository violationRepository,
            TestRepository testRepository,
            AppProperties properties) {
        this.attemptLifecycleService = attemptLifecycleService;
        this.attemptExpiryService = attemptExpiryService;
        this.violationRepository = violationRepository;
        this.testRepository = testRepository;
        this.properties = properties;
    }

    @Transactional
    public ViolationRecorded recordViolation(Long attemptId, Long studentId, ViolationCreate request) {
        TestAttempt attempt = attemptLifecycleService.findOwnedOrThrow(attemptId, studentId);

        if (attempt.getStatus() == AttemptStatus.SUBMITTED || attempt.getStatus() == AttemptStatus.AUTO_SUBMITTED) {
            throw ApiException.badRequest("Attempt already submitted");
        }
        if (attemptExpiryService.autoSubmitExpired(attempt)) {
            throw ApiException.badRequest("Attempt expired and has been auto-submitted");
        }

        OffsetDateTime now = OffsetDateTime.now();
        String violationType = request.getViolationType();

        Optional<Violation> recent =
                violationRepository.findFirstByAttemptIdAndViolationTypeOrderByCreatedAtDesc(attemptId, violationType);
        if (recent.isPresent() && recent.get().getCreatedAt().isAfter(now.minusSeconds(2))) {
            int effectiveMax = effectiveMax(violationType, attempt.getTestId());
            return new ViolationRecorded(
                    recent.get().getId(),
                    attemptId,
                    violationType,
                    recent.get().getCreatedAt(),
                    attempt.getViolationCount(),
                    effectiveMax,
                    false);
        }

        Violation violation = violationRepository.saveAndFlush(Violation.builder().attemptId(attemptId).violationType(violationType).build());

        attempt.setViolationCount(attempt.getViolationCount() + 1);
        // NOTE: reaching the violation limit must NEVER auto-submit the
        // attempt -- the lifecycle only completes via the student's submit
        // action or the timer expiring. Violation events are environmental
        // and must not complete an exam.

        int effectiveMax = effectiveMax(violationType, attempt.getTestId());

        return new ViolationRecorded(
                violation.getId(),
                violation.getAttemptId(),
                violation.getViolationType(),
                violation.getCreatedAt(),
                attempt.getViolationCount(),
                effectiveMax,
                false);
    }

    private int effectiveMax(String violationType, Long testId) {
        if ("face_turned".equals(violationType)) {
            return properties.getViolations().getMaxFaceTurn();
        }
        Test test = testRepository.findById(testId).orElse(null);
        return test != null ? test.getMaxViolations() : properties.getViolations().getMaxDefault();
    }
}
