/**
 * Regression tests for Issue #691 — transient LLM error continuation (v6.34)
 *
 * Covers:
 * 1. TRANSIENT_MODEL_ERROR_PATTERN regex (529 addition and pre-existing terms)
 * 2. GuardrailsConfigSchema and GuardrailsProfileSchema max_transient_retries field
 * 3. InvocationWindow.transientRetryCount initialization via beginInvocation
 * 4. transientRetryCount resets at the start of each new invocation window
 */
export {};
