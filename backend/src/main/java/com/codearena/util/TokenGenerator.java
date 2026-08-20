package com.codearena.util;

import java.security.SecureRandom;
import java.util.Base64;

/** Java equivalent of Python's secrets.token_urlsafe(nbytes). */
public final class TokenGenerator {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private TokenGenerator() {}

    public static String tokenUrlsafe(int numBytes) {
        byte[] bytes = new byte[numBytes];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
