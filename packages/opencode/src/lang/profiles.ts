/**
 * Language Profiles Bridge
 *
 * Re-exports language profile registry and types from @opencode-swarm/core.
 * Maintains compatibility for legacy import paths.
 */

export {
	LANGUAGE_REGISTRY,
	LanguageRegistry,
	type LanguageProfile,
	type BuildCommand,
	type TestFramework,
	type LintTool,
} from '@opencode-swarm/core/lang/profiles';
