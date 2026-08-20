package com.codearena.entity.converter;

import com.codearena.entity.enums.AttemptStatus;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class AttemptStatusConverter implements AttributeConverter<AttemptStatus, String> {
    @Override
    public String convertToDatabaseColumn(AttemptStatus attribute) {
        return attribute == null ? null : attribute.dbValue();
    }

    @Override
    public AttemptStatus convertToEntityAttribute(String dbData) {
        return dbData == null ? null : AttemptStatus.fromDbValue(dbData);
    }
}
