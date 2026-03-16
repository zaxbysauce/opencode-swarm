/**
 * Language Profiles Bridge
 *
 * Re-exports language profile registry and types from @opencode-swarm/core.
 * Maintains compatibility for legacy import paths.
 */

export {
	type BuildCommand,
	LANGUAGE_REGISTRY,
	type LanguageProfile,
	LanguageRegistry,
	type LintTool,
	type TestFramework,
} from '@opencode-swarm/core';
