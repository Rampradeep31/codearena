package com.codearena.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ViolationCreate {

    private static final Set<String> ALLOWED_TYPES =
            Set.of("tab_hidden", "window_blur", "fullscreen_exit", "copy_attempt", "paste_attempt", "face_turned", "multiple_faces");

    @NotNull
    private String violationType;

    @AssertTrue(message = "violation_type must be one of the allowed types")
    private boolean isViolationTypeValid() {
        return violationType != null && ALLOWED_TYPES.contains(violationType);
    }
}
