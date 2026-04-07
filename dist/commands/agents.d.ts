import type { AgentDefinition } from '../agents';
import type { GuardrailsConfig } from '../config/schema';
export declare function handleAgentsCommand(agents: Record<string, AgentDefinition>, guardrails?: GuardrailsConfig): string;
