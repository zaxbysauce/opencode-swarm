import type { AgentDefinition } from '../agents';
import type { GuardrailsConfig } from '../config/schema';

export function handleAgentsCommand(
	agents: Record<string, AgentDefinition>,
	guardrails?: GuardrailsConfig,
): string {
	const entries = Object.entries(agents);

	if (entries.length === 0) {
		return 'No agents registered.';
	}

	const lines = [`## Registered Agents (${entries.length} total)`, ''];

	for (const [key, agent] of entries) {
		const model = agent.config.model || 'default';
		const temp =
			agent.config.temperature !== undefined
				? agent.config.temperature.toString()
				: 'default';

		// Detect read-only: if tools has write/edit/patch set to false
		const tools = agent.config.tools || {};
		const isReadOnly = tools.write === false || tools.edit === false;
		const access = isReadOnly ? '🔒 read-only' : '✏️ read-write';

		const desc = agent.description || agent.config.description || '';

		// Check if agent has custom guardrail profile
		const hasCustomProfile = guardrails?.profiles?.[key] !== undefined;
		const profileIndicator = hasCustomProfile ? ' | ⚡ custom limits' : '';

		lines.push(
			`- **${key}** | model: \`${model}\` | temp: ${temp} | ${access}${profileIndicator}`,
		);
		if (desc) {
			lines.push(`  ${desc}`);
		}
	}

	// Add guardrail profiles summary if profiles exist
	if (guardrails?.profiles && Object.keys(guardrails.profiles).length > 0) {
		lines.push('', '### Guardrail Profiles', '');

		for (const [profileName, profile] of Object.entries(guardrails.profiles)) {
			const overrides: string[] = [];

			if (profile.max_tool_calls !== undefined) {
				overrides.push(`max_tool_calls=${profile.max_tool_calls}`);
			}
			if (profile.max_duration_minutes !== undefined) {
				overrides.push(`max_duration_minutes=${profile.max_duration_minutes}`);
			}
			if (profile.max_repetitions !== undefined) {
				overrides.push(`max_repetitions=${profile.max_repetitions}`);
			}
			if (profile.max_consecutive_errors !== undefined) {
				overrides.push(
					`max_consecutive_errors=${profile.max_consecutive_errors}`,
				);
			}
			if (profile.warning_threshold !== undefined) {
				overrides.push(`warning_threshold=${profile.warning_threshold}`);
			}

			const overrideStr =
				overrides.length > 0 ? overrides.join(', ') : 'no overrides';
			lines.push(`- **${profileName}**: ${overrideStr}`);
		}
	}

	return lines.join('\n');
}
