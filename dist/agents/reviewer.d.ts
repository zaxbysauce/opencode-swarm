import type { AgentDefinition } from './architect';
/** OWASP Top 10 2021 categories for security-focused review passes */
export declare const SECURITY_CATEGORIES: readonly ["broken-access-control", "cryptographic-failures", "injection", "insecure-design", "security-misconfiguration", "vulnerable-components", "auth-failures", "data-integrity-failures", "logging-monitoring-failures", "ssrf"];
export type SecurityCategory = (typeof SECURITY_CATEGORIES)[number];
export declare function createReviewerAgent(model: string, customPrompt?: string, customAppendPrompt?: string): AgentDefinition;
