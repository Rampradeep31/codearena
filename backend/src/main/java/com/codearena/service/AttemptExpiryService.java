package com.codearena.service;

import com.codearena.entity.TestAttempt;
import com.codearena.entity.enums.AttemptStatus;
import com.codearena.repository.TestAttemptRepository;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Split out from AttemptLifecycleService specifically so REQUIRES_NEW
 * propagation actually applies: Spring's @Transactional is proxy-based, so
 * a self-invocation (this.autoSubmitExpired(...) from within another
 * @Transactional method on the SAME bean) bypasses the proxy entirely and
 * silently ignores the propagation setting. Calling through a *different*
 * bean's proxy is required.
 *
 * REQUIRES_NEW mirrors the Python app's explicit separate commit inside
 * auto_submit_expired ("commit immediately so concurrent readers observe
 * the final status") -- the transition to AUTO_SUBMITTED must survive even
 * when the calling endpoint (e.g. finish_test) subsequently throws and its
 * own transaction rolls back.
 */
@Service
public class AttemptExpiryService {

    private final TestAttemptRepository attemptRepository;

    public AttemptExpiryService(TestAttemptRepository attemptRepository) {
        this.attemptRepository = attemptRepository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean autoSubmitExpired(TestAttempt attempt) {
        if (attempt == null || attempt.getStatus() != AttemptStatus.IN_PROGRESS) {
            return false;
        }
        OffsetDateTime now = OffsetDateTime.now();
        if (!now.isAfter(attempt.getExpiresAt())) {
            return false;
        }
        attempt.setStatus(AttemptStatus.AUTO_SUBMITTED);
        attempt.setSubmittedAt(now);
        attemptRepository.saveAndFlush(attempt);
        return true;
    }
}
