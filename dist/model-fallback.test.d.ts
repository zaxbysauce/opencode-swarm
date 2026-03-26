/**
 * Tests for model fallback schema and state (v6.33)
 *
 * Covers:
 * 1. AgentOverrideConfigSchema fallback_models field parsing
 * 2. State initialization of model_fallback_index and modelFallbackExhausted
 * 3. Serialization round-trip for both fields
 * 4. Deserialization defaults when fields are missing
 * 5. Migration safety via ensureAgentSession
 * 6. Edge cases for schema and state
 */
export {};
