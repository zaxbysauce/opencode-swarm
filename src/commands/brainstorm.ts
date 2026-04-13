/**
 * Handle /swarm brainstorm command.
 *
 * Returns a trigger prompt instructing the architect to enter
 * MODE: BRAINSTORM — the seven-phase planning workflow defined in the
 * architect prompt: CONTEXT SCAN → DIALOGUE → APPROACHES → DESIGN SECTIONS
 * → SPEC WRITE + SELF-REVIEW → QA GATE SELECTION → TRANSITION.
 *
 * Any arguments become the initial topic/problem statement for the
 * architect to reason about. The topic is sanitized to prevent prompt
 * injection of rival MODE: headers or newline-based control sequences.
 */

/**
 * Sanitize a user-supplied brainstorm topic so it cannot forge competing
 * mode headers or inject control sequences into the architect prompt.
 * - Collapses all whitespace (including newlines) into single spaces.
 * - Strips any occurrence of bracketed `[MODE: ...]` headers other than
 *   the one this command prepends itself.
 * - Truncates excessively long topics.
 */
function sanitizeTopic(raw: string): string {
	const collapsed = raw.replace(/\s+/g, ' ').trim();
	const stripped = collapsed.replace(/\[\s*MODE\s*:[^\]]*\]/gi, '');
	const normalized = stripped.replace(/\s+/g, ' ').trim();
	const MAX_TOPIC_LEN = 2000;
	if (normalized.length <= MAX_TOPIC_LEN) return normalized;
	return `${normalized.slice(0, MAX_TOPIC_LEN)}…`;
}

export async function handleBrainstormCommand(
	_directory: string,
	args: string[],
): Promise<string> {
	const description = sanitizeTopic(args.join(' '));
	if (description) {
		return `[MODE: BRAINSTORM] ${description}`;
	}
	return '[MODE: BRAINSTORM] Please enter MODE: BRAINSTORM and begin the structured brainstorm workflow (CONTEXT SCAN → DIALOGUE → APPROACHES → DESIGN SECTIONS → SPEC WRITE + SELF-REVIEW → QA GATE SELECTION → TRANSITION).';
}
