package com.codearena.execution;

import java.util.Arrays;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Direct port of execution_service.py's compare_outputs -- the lenient
 * "LeetCode style" comparison used by run_against_test_cases to decide
 * pass/fail once the judge itself reports "accepted". Every branch below
 * mirrors the Python function exactly; do not simplify.
 */
@Component
public class OutputComparator {

    public boolean compareOutputs(String actual, String expected) {
        String act = actual == null ? "" : actual.strip();
        String exp = expected == null ? "" : expected.strip();
        if (act.equals(exp)) {
            return true;
        }
        if (normBools(act).equals(normBools(exp))) {
            return true;
        }

        List<String> actLines = nonEmptyStrippedLines(act);
        List<String> expLines = nonEmptyStrippedLines(exp);
        if (actLines.equals(expLines) || mapNormBools(actLines).equals(mapNormBools(expLines))) {
            return true;
        }

        List<String> actTokens = tokens(act);
        List<String> expTokens = tokens(exp);
        if (actTokens.equals(expTokens)) {
            return true;
        }

        if (actTokens.size() == expTokens.size()) {
            for (int i = 0; i < actTokens.size(); i++) {
                String a = actTokens.get(i);
                String e = expTokens.get(i);
                if (a.equals(e) || normBools(a).equals(normBools(e))) {
                    continue;
                }
                try {
                    if (Math.abs(Double.parseDouble(a) - Double.parseDouble(e)) > 1e-6) {
                        return false;
                    }
                } catch (NumberFormatException ex) {
                    return false;
                }
            }
            return true;
        }

        return false;
    }

    private String normBools(String s) {
        return s.replace("True", "true").replace("False", "false").replace("None", "none");
    }

    private List<String> mapNormBools(List<String> lines) {
        return lines.stream().map(this::normBools).toList();
    }

    private List<String> nonEmptyStrippedLines(String s) {
        if (s.isEmpty()) {
            return List.of();
        }
        return Arrays.stream(s.split("\r\n|\r|\n")).map(String::strip).filter(l -> !l.isEmpty()).toList();
    }

    private List<String> tokens(String s) {
        String trimmed = s.strip();
        if (trimmed.isEmpty()) {
            return List.of();
        }
        return Arrays.asList(trimmed.split("\\s+"));
    }
}
