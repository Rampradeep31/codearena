package com.codearena.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TestCaseCreate {
    @NotNull
    private String input;

    @NotNull
    private String expectedOutput;

    // Explicit @JsonProperty: Lombok's getter/setter pair for a boolean
    // field already named "isHidden" is asymmetric (isHidden()/setIsHidden())
    // and Jackson's default is/set-stripping would otherwise derive two
    // different property names from them -- force the exact wire name.
    @JsonProperty("is_hidden")
    private boolean isHidden = false;
}
