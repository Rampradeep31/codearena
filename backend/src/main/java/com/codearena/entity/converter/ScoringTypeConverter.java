package com.codearena.entity.converter;

import com.codearena.entity.enums.ScoringType;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class ScoringTypeConverter implements AttributeConverter<ScoringType, String> {
    @Override
    public String convertToDatabaseColumn(ScoringType attribute) {
        return attribute == null ? null : attribute.dbValue();
    }

    @Override
    public ScoringType convertToEntityAttribute(String dbData) {
        return dbData == null ? null : ScoringType.fromDbValue(dbData);
    }
}
