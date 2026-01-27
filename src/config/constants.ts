// Agent category definitions
export const SME_AGENTS = [
	'sme_windows',
	'sme_powershell',
	'sme_python',
	'sme_oracle',
	'sme_network',
	'sme_security',
	'sme_linux',
	'sme_vmware',
	'sme_azure',
	'sme_active_directory',
	'sme_ui_ux',
] as const;

export const QA_AGENTS = ['security_reviewer', 'auditor'] as const;

export const PIPELINE_AGENTS = ['coder', 'test_engineer'] as const;

export const ORCHESTRATOR_NAME = 'architect' as const;

export const ALL_SUBAGENT_NAMES = [
	...SME_AGENTS,
	...QA_AGENTS,
	...PIPELINE_AGENTS,
] as const;

export const ALL_AGENT_NAMES = [
	ORCHESTRATOR_NAME,
	...ALL_SUBAGENT_NAMES,
] as const;

// Type definitions
export type SMEAgentName = (typeof SME_AGENTS)[number];
export type QAAgentName = (typeof QA_AGENTS)[number];
export type PipelineAgentName = (typeof PIPELINE_AGENTS)[number];
export type AgentName = (typeof ALL_AGENT_NAMES)[number];

// Category prefixes for config
export const CATEGORY_PREFIXES = {
	sme: '_sme',
	qa: '_qa',
} as const;

// Default models for each agent/category
export const DEFAULT_MODELS: Record<string, string> = {
	// Orchestrator
	architect: 'anthropic/claude-sonnet-4.5',

	// Pipeline agents
	coder: 'openai/gpt-5.2-codex',
	test_engineer: 'google/gemini-3-flash',

	// Category defaults
	_sme: 'google/gemini-3-flash',
	_qa: 'google/gemini-3-flash',

	// Fallback
	default: 'google/gemini-3-flash',
};

// Domain patterns for automatic detection
export const DOMAIN_PATTERNS: Record<string, RegExp[]> = {
	windows: [
		/\bwindows\b/i,
		/\bwin32\b/i,
		/\bregistry\b/i,
		/\bregedit\b/i,
		/\bwmi\b/i,
		/\bcim\b/i,
		/\bservice\b/i,
		/\bevent\s*log\b/i,
		/\bscheduled\s*task\b/i,
		/\bgpo\b/i,
		/\bgroup\s*policy\b/i,
		/\bmsi\b/i,
		/\binstaller\b/i,
		/\bwinrm\b/i,
	],
	powershell: [
		/\bpowershell\b/i,
		/\bpwsh\b/i,
		/\bps1\b/i,
		/\bcmdlet\b/i,
		/\bget-\w+/i,
		/\bset-\w+/i,
		/\bnew-\w+/i,
		/\bremove-\w+/i,
		/\binvoke-\w+/i,
		/\bpester\b/i,
	],
	python: [
		/\bpython\b/i,
		/\bpip\b/i,
		/\bpypi\b/i,
		/\bdjango\b/i,
		/\bflask\b/i,
		/\bpandas\b/i,
		/\bnumpy\b/i,
		/\bpytest\b/i,
		/\bvenv\b/i,
		/\bconda\b/i,
	],
	oracle: [
		/\boracle\b/i,
		/\bsqlplus\b/i,
		/\bplsql\b/i,
		/\btnsnames\b/i,
		/\bpdb\b/i,
		/\bcdb\b/i,
		/\btablespace\b/i,
		/\brman\b/i,
		/\bdataguard\b/i,
		/\basm\b/i,
		/\brac\b/i,
		/\bora-\d+/i,
	],
	network: [
		/\bnetwork\b/i,
		/\bfirewall\b/i,
		/\bdns\b/i,
		/\bdhcp\b/i,
		/\btcp\b/i,
		/\budp\b/i,
		/\bip\s*address\b/i,
		/\bsubnet\b/i,
		/\bvlan\b/i,
		/\brouting\b/i,
		/\bswitch\b/i,
		/\bload\s*balanc/i,
		/\bproxy\b/i,
		/\bssl\b/i,
		/\btls\b/i,
		/\bcertificate\b/i,
	],
	security: [
		/\bstig\b/i,
		/\bdisa\b/i,
		/\bcve\b/i,
		/\bvulnerabil/i,
		/\bharden\b/i,
		/\baudit\b/i,
		/\bcompliance\b/i,
		/\bscap\b/i,
		/\bfips\b/i,
		/\bcac\b/i,
		/\bpki\b/i,
		/\bencrypt/i,
	],
	linux: [
		/\blinux\b/i,
		/\bubuntu\b/i,
		/\brhel\b/i,
		/\bcentos\b/i,
		/\bbash\b/i,
		/\bsystemd\b/i,
		/\bsystemctl\b/i,
		/\byum\b/i,
		/\bapt\b/i,
		/\bcron\b/i,
		/\bchmod\b/i,
		/\bchown\b/i,
	],
	vmware: [
		/\bvmware\b/i,
		/\bvsphere\b/i,
		/\besxi\b/i,
		/\bvcenter\b/i,
		/\bvsan\b/i,
		/\bnsx\b/i,
		/\bvmotion\b/i,
		/\bdatastore\b/i,
		/\bpowercli\b/i,
		/\bova\b/i,
		/\bovf\b/i,
	],
	azure: [
		/\bazure\b/i,
		/\baz\s+\w+/i,
		/\bentra\b/i,
		/\baad\b/i,
		/\bazure\s*ad\b/i,
		/\barm\s*template\b/i,
		/\bbicep\b/i,
		/\bazure\s*devops\b/i,
		/\bblob\b/i,
		/\bkeyvault\b/i,
	],
	active_directory: [
		/\bactive\s*directory\b/i,
		/\bad\s+\w+/i,
		/\bldap\b/i,
		/\bdomain\s*controller\b/i,
		/\bgpupdate\b/i,
		/\bdsquery\b/i,
		/\bdsmod\b/i,
		/\baduc\b/i,
		/\bkerberos\b/i,
		/\bspn\b/i,
	],
	ui_ux: [
		/\bui\b/i,
		/\bux\b/i,
		/\buser\s+experience\b/i,
		/\buser\s+interface\b/i,
		/\bvisual\s+design\b/i,
		/\binteraction\s+design\b/i,
		/\bdesign\s+system\b/i,
		/\bwireframe\b/i,
		/\bprototype\b/i,
		/\baccessibility\b/i,
		/\btypography\b/i,
		/\blayout\b/i,
		/\bresponsive\b/i,
	],
};

// Map domain name to SME agent name
export function domainToAgentName(domain: string): SMEAgentName {
	return `sme_${domain.toLowerCase().replace(/\s+/g, '_')}` as SMEAgentName;
}

// Check if agent is in SME category
export function isSMEAgent(name: string): name is SMEAgentName {
	return (SME_AGENTS as readonly string[]).includes(name);
}

// Check if agent is in QA category
export function isQAAgent(name: string): name is QAAgentName {
	return (QA_AGENTS as readonly string[]).includes(name);
}

// Check if agent is a subagent
export function isSubagent(name: string): boolean {
	return (ALL_SUBAGENT_NAMES as readonly string[]).includes(name);
}
