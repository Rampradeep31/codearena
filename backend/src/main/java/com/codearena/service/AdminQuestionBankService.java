package com.codearena.service;

import com.codearena.dto.request.QuestionBankCreate;
import com.codearena.dto.request.QuestionBankUpdate;
import com.codearena.dto.response.QuestionBankOut;
import com.codearena.entity.QuestionBank;
import com.codearena.exception.ApiException;
import com.codearena.repository.QuestionBankRepository;
import com.codearena.repository.QuestionRepository;
import com.codearena.util.PythonTruthy;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class AdminQuestionBankService {

    private final QuestionBankRepository questionBankRepository;
    private final QuestionRepository questionRepository;

    public AdminQuestionBankService(QuestionBankRepository questionBankRepository, QuestionRepository questionRepository) {
        this.questionBankRepository = questionBankRepository;
        this.questionRepository = questionRepository;
    }

    public List<QuestionBankOut> list() {
        return questionBankRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toOutWithLiveCount).toList();
    }

    public QuestionBankOut create(QuestionBankCreate request) {
        QuestionBank bank =
                QuestionBank.builder()
                        .title(request.getTitle())
                        .description(request.getDescription())
                        .year(PythonTruthy.orDefault(request.getYear(), "Second Year"))
                        .status(PythonTruthy.orDefault(request.getStatus(), "Active"))
                        .build();
        bank = questionBankRepository.saveAndFlush(bank);
        return toOutWithLiveCount(bank);
    }

    public QuestionBankOut get(Long id) {
        return toOutWithLiveCount(findOrThrow(id));
    }

    public QuestionBankOut update(Long id, QuestionBankUpdate request) {
        QuestionBank bank = findOrThrow(id);
        // "if value is not None" semantics -- absence AND explicit null both mean "skip".
        if (request.getTitle() != null) {
            bank.setTitle(request.getTitle());
        }
        if (request.getDescription() != null) {
            bank.setDescription(request.getDescription());
        }
        if (request.getYear() != null) {
            bank.setYear(request.getYear());
        }
        if (request.getStatus() != null) {
            bank.setStatus(request.getStatus());
        }
        bank = questionBankRepository.saveAndFlush(bank);
        return toOutWithLiveCount(bank);
    }

    public void delete(Long id) {
        QuestionBank bank = findOrThrow(id);
        // Questions/tests referencing this bank keep their question_bank_id
        // link severed at the DB level (ON DELETE SET NULL) -- no cascade
        // delete of the questions/tests themselves.
        questionBankRepository.delete(bank);
    }

    private QuestionBank findOrThrow(Long id) {
        return questionBankRepository.findById(id).orElseThrow(() -> ApiException.notFound("Question bank not found"));
    }

    private QuestionBankOut toOutWithLiveCount(QuestionBank bank) {
        int count = (int) questionRepository.countByQuestionBankId(bank.getId());
        return new QuestionBankOut(
                bank.getId(), bank.getTitle(), bank.getDescription(), bank.getYear(), bank.getStatus(), count, bank.getCreatedAt());
    }
}
