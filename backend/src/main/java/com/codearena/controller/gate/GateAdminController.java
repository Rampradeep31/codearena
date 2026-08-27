package com.codearena.controller.gate;

import com.codearena.dto.request.*;
import com.codearena.dto.response.*;
import com.codearena.entity.User;
import com.codearena.security.CurrentUserProvider;
import com.codearena.security.RoleGuard;
import com.codearena.service.GateAdminService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/gate/admin")
public class GateAdminController {

    private final GateAdminService service;
    private final CurrentUserProvider currentUserProvider;
    private final RoleGuard roleGuard;

    public GateAdminController(GateAdminService service, CurrentUserProvider currentUserProvider, RoleGuard roleGuard) {
        this.service = service;
        this.currentUserProvider = currentUserProvider;
        this.roleGuard = roleGuard;
    }

    private User admin() { return roleGuard.requireAdmin(currentUserProvider.get()); }

    // --- Questions -------------------------------------------------------

    @GetMapping("/questions")
    public List<GateQuestionOut> listQuestions(
            @RequestParam(required = false) String subject,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String search) {
        admin();
        return service.searchQuestions(subject, type, search);
    }

    @PostMapping("/questions")
    @ResponseStatus(HttpStatus.CREATED)
    public GateQuestionOut createQuestion(@Valid @RequestBody GateQuestionCreate req) {
        admin();
        return service.createQuestion(req);
    }

    @PutMapping("/questions/{id}")
    public GateQuestionOut updateQuestion(@PathVariable Long id, @RequestBody GateQuestionCreate req) {
        admin();
        return service.updateQuestion(id, req);
    }

    @DeleteMapping("/questions/{id}")
    public Map<String, String> deleteQuestion(@PathVariable Long id) {
        admin();
        service.deleteQuestion(id);
        return Map.of("message", "Question deleted");
    }

    @PostMapping("/questions/ai-generate")
    @ResponseStatus(HttpStatus.CREATED)
    public List<GateQuestionOut> aiGenerate(@Valid @RequestBody AiGenerateGateQuestionsRequest req) {
        admin();
        return service.aiGenerateQuestions(req);
    }

    @PostMapping(value = "/questions/upload-pdf", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public List<GateQuestionOut> uploadPdf(
            @RequestParam("file") MultipartFile file,
            @RequestParam(required = false) String subject) {
        admin();
        try {
            String text;
            String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
            byte[] bytes = file.getBytes();
            if (filename.endsWith(".pdf") || isPdfBytes(bytes)) {
                try (org.apache.pdfbox.pdmodel.PDDocument doc = org.apache.pdfbox.Loader.loadPDF(bytes)) {
                    org.apache.pdfbox.text.PDFTextStripper stripper = new org.apache.pdfbox.text.PDFTextStripper();
                    text = stripper.getText(doc);
                }
            } else {
                text = new String(bytes, StandardCharsets.UTF_8);
            }
            if (text == null || text.isBlank()) {
                throw com.codearena.exception.ApiException.badRequest("Extracted text from PDF is empty.");
            }
            text = text.replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]", "");
            if (text.length() > 35000) {
                text = text.substring(0, 35000);
            }
            return service.extractFromPdf(text, subject);
        } catch (com.codearena.exception.ApiException e) {
            throw e;
        } catch (Exception e) {
            throw com.codearena.exception.ApiException.badRequest("Could not read PDF file: " + e.getMessage());
        }
    }

    private boolean isPdfBytes(byte[] bytes) {
        if (bytes == null || bytes.length < 4) return false;
        return bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F';
    }

    // --- Tests -----------------------------------------------------------

    @GetMapping("/tests")
    public List<GateTestOut> listTests() {
        admin();
        return service.listTests();
    }

    @PostMapping("/tests")
    @ResponseStatus(HttpStatus.CREATED)
    public GateTestOut createTest(@Valid @RequestBody GateTestCreate req) {
        admin();
        return service.createTest(req);
    }

    @PutMapping("/tests/{id}")
    public GateTestOut updateTest(@PathVariable Long id, @RequestBody GateTestCreate req) {
        admin();
        return service.updateTest(id, req);
    }

    @DeleteMapping("/tests/{id}")
    public Map<String, String> deleteTest(@PathVariable Long id) {
        admin();
        service.deleteTest(id);
        return Map.of("message", "Test deleted");
    }

    @GetMapping("/tests/{id}/questions")
    public List<GateQuestionOut> testQuestions(@PathVariable Long id) {
        admin();
        return service.getTestQuestions(id);
    }

    @GetMapping("/tests/{id}/attempts")
    public List<GateAttemptOut> testAttempts(@PathVariable Long id) {
        admin();
        return service.getTestAttempts(id);
    }
}
