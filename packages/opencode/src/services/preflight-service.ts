// Bridge module - re-exports from core services preflight-service
export {
	formatPreflightMarkdown,
	handlePreflightCommand,
	type PreflightCheckResult,
	type PreflightCheckType,
	type PreflightConfig,
	type PreflightReport,
	runPreflight,
} from '@opencode-swarm/core';
