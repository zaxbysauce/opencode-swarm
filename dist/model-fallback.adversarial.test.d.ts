/**
 * Adversarial tests for model fallback schema and state (v6.33)
 *
 * Tests attack vectors against:
 * 1. AgentOverrideConfigSchema fallback_models field
 * 2. AgentSessionState model_fallback_index and modelFallbackExhausted
 *
 * ADVERSARIAL TEST CASES:
 * 1. fallback_models with 1000 entries — should Zod-reject (max 3)
 * 2. fallback_models with non-string values (numbers, objects, null)
 * 3. fallback_models with empty strings ""
 * 4. fallback_models with extremely long model name strings (10K chars)
 * 5. model_fallback_index set to NaN — should it be NaN or coerced?
 * 6. model_fallback_index set to -1 — negative index
 * 7. model_fallback_index set to MAX_SAFE_INTEGER — overflow risk?
 * 8. modelFallbackExhausted set to undefined in deserialization — should default to false
 * 9. Circular reference in fallback_models array elements
 * 10. Prototype pollution via __proto__ in fallback_models
 * 11. AgentOverrideConfigSchema.parse with all fields including fallback_models, verify no field collision
 * 12. Serialization with model_fallback_index as a float (3.14) — should survive round-trip
 */
export {};
