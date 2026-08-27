package com.codearena.service;

import com.codearena.exception.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class GeminiService {

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Value("${gemini.api-key:${GEMINI_API_KEY:${GOOGLE_API_KEY:}}}")
    private String apiKey;

    public GeminiService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    public String generate(String systemInstruction, String userPrompt) {
        if (apiKey == null || apiKey.trim().isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, 
                "Gemini API key is not configured. Please set GEMINI_API_KEY or GOOGLE_API_KEY in your environment variables.");
        }

        try {
            // Build request payload:
            // {
            //   "systemInstruction": { "parts": [ { "text": "systemInstruction" } ] },
            //   "contents": [ { "parts": [ { "text": "userPrompt" } ] } ],
            //   "generationConfig": { "responseMimeType": "application/json" }
            // }
            ObjectNode payload = objectMapper.createObjectNode();

            if (systemInstruction != null && !systemInstruction.trim().isEmpty()) {
                ObjectNode sysInstructionNode = objectMapper.createObjectNode();
                ArrayNode parts = objectMapper.createArrayNode();
                parts.add(objectMapper.createObjectNode().put("text", systemInstruction));
                sysInstructionNode.set("parts", parts);
                payload.set("systemInstruction", sysInstructionNode);
            }

            ArrayNode contents = objectMapper.createArrayNode();
            ObjectNode contentNode = objectMapper.createObjectNode();
            ArrayNode userParts = objectMapper.createArrayNode();
            userParts.add(objectMapper.createObjectNode().put("text", userPrompt));
            contentNode.set("parts", userParts);
            contents.add(contentNode);
            payload.set("contents", contents);

            ObjectNode genConfig = objectMapper.createObjectNode();
            genConfig.put("responseMimeType", "application/json");
            payload.set("generationConfig", genConfig);

            String requestBody = objectMapper.writeValueAsString(payload);
            String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(180))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> httpResponse = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

            if (httpResponse.statusCode() != 200) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, 
                    "Gemini API returned error status " + httpResponse.statusCode() + ": " + httpResponse.body());
            }

            JsonNode root = objectMapper.readTree(httpResponse.body());
            JsonNode textNode = root.at("/candidates/0/content/parts/0/text");
            if (textNode.isMissingNode()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, 
                    "Failed to extract generated text from Gemini API response: " + httpResponse.body());
            }

            return cleanJsonString(textNode.asText());

        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, 
                "Error communicating with Gemini API: " + e.getMessage());
        }
    }

    private String cleanJsonString(String response) {
        if (response == null) return "";
        response = response.trim();
        if (response.startsWith("```")) {
            // Strip starting ```json or ```
            int firstLineEnd = response.indexOf("\n");
            if (firstLineEnd != -1) {
                response = response.substring(firstLineEnd + 1);
            } else {
                response = response.substring(3);
            }
            // Strip ending ```
            if (response.endsWith("```")) {
                response = response.substring(0, response.length() - 3);
            }
        }
        return response.trim();
    }
}
