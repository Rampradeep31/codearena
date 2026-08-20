package com.codearena.entity.converter;

import com.codearena.entity.enums.Difficulty;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class DifficultyConverter implements AttributeConverter<Difficulty, String> {
    @Override
    public String convertToDatabaseColumn(Difficulty attribute) {
        return attribute == null ? null : attribute.dbValue();
    }

    @Override
    public Difficulty convertToEntityAttribute(String dbData) {
        return dbData == null ? null : Difficulty.fromDbValue(dbData);
    }
}
