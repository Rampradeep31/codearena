package com.codearena.execution;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Standalone unit tests for the ported compare_outputs algorithm -- no Spring context needed. */
class OutputComparatorTest {

    private final OutputComparator comparator = new OutputComparator();

    @Test
    void exactMatch() {
        assertThat(comparator.compareOutputs("hello", "hello")).isTrue();
    }

    @Test
    void whitespaceStrippedMatch() {
        assertThat(comparator.compareOutputs("  hello  \n", "hello")).isTrue();
    }

    @Test
    void booleanCaseNormalization() {
        assertThat(comparator.compareOutputs("True", "true")).isTrue();
        assertThat(comparator.compareOutputs("None", "none")).isTrue();
    }

    @Test
    void lineWiseMatchIgnoringBlankLines() {
        assertThat(comparator.compareOutputs("a\nb\n\nc", "a\nb\nc")).isTrue();
    }

    @Test
    void tokenWiseMatchIgnoringExtraWhitespace() {
        assertThat(comparator.compareOutputs("1  2   3", "1 2 3")).isTrue();
    }

    @Test
    void floatToleranceWithinEpsilon() {
        assertThat(comparator.compareOutputs("3.14159265", "3.14159266")).isTrue();
    }

    @Test
    void floatToleranceExceeded() {
        assertThat(comparator.compareOutputs("3.14", "3.20")).isFalse();
    }

    @Test
    void differentTokenCountsFail() {
        assertThat(comparator.compareOutputs("1 2 3", "1 2")).isFalse();
    }

    @Test
    void nonNumericMismatchFails() {
        assertThat(comparator.compareOutputs("cat", "dog")).isFalse();
    }

    @Test
    void mixedTokensOneNonNumericMismatchFailsImmediately() {
        assertThat(comparator.compareOutputs("1 cat 3", "1 dog 3")).isFalse();
    }
}
