import { type ToolDefinition, tool } from '@opencode-ai/plugin/tool';
import { DOMAIN_PATTERNS } from '../config/constants';

/**
 * Detect SME domains from text content.
 * Returns list of domains that match patterns in the input.
 */
export const detect_domains: ToolDefinition = tool({
	description:
		'Detect which SME domains are relevant for a given text. ' +
		'Returns a list of domain names (windows, powershell, python, oracle, ' +
		'network, security, linux, vmware, azure, active_directory, ui_ux) ' +
		'that match patterns in the input text.',
	args: {
		text: tool.schema
			.string()
			.describe('The text to analyze for domain patterns'),
	},
	execute: async (args) => {
		const text = args.text.toLowerCase();
		const detected: string[] = [];

		for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
			for (const pattern of patterns) {
				if (pattern.test(text)) {
					detected.push(domain);
					break; // Only need one match per domain
				}
			}
		}

		if (detected.length === 0) {
			return 'No specific domains detected. The Architect should determine requirements from context.';
		}

		return `Detected domains: ${detected.join(', ')}\n\nCorresponding SME agents: ${detected.map((d) => `@sme_${d}`).join(', ')}`;
	},
});
