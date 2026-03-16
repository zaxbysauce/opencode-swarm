// Default models for each agent/category
// v6.14: switched to free OpenCode Zen models; architect key intentionally
// omitted so it inherits the OpenCode UI model selection.
export const DEFAULT_MODELS: Record<string, string> = {
	// Explorer — fast read-heavy analysis
	explorer: 'opencode/trinity-large-preview-free',

	// Pipeline agents — differentiated models for writing vs reviewing
	coder: 'opencode/minimax-m2.5-free',
	reviewer: 'opencode/big-pickle',
	test_engineer: 'opencode/gpt-5-nano',

	// SME, Critic, Docs, Designer — reasoning/general tasks
	sme: 'opencode/trinity-large-preview-free',
	critic: 'opencode/trinity-large-preview-free',
	docs: 'opencode/trinity-large-preview-free',
	designer: 'opencode/trinity-large-preview-free',

	// Fallback
	default: 'opencode/trinity-large-preview-free',
};
