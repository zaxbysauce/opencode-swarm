import type { EnvironmentProfile } from './profile.js';
import { deriveCommandPolicy } from './profile.js';

/**
 * Renders a concise runtime environment block for agent prompts.
 * Audience: 'coder' or 'testengineer'
 */
export function renderEnvironmentPrompt(
	profile: EnvironmentProfile,
	audience: 'coder' | 'testengineer',
): string {
	const policy = deriveCommandPolicy(profile);
	const header = [
		'RUNTIME ENVIRONMENT',
		`- Host OS: ${profile.hostOS}`,
		`- Shell family: ${profile.shellFamily}`,
		`- Execution mode: ${profile.executionMode}`,
		`- Path style: ${profile.pathStyle}`,
	].join('\n');

	if (audience === 'coder') {
		return [
			header,
			policy.avoidPosixExamples
				? '- Command policy: Prefer PowerShell-native commands and Node.js APIs. Do not start with POSIX commands (ls, grep, rm, cat, export, pwd) unless the environment profile indicates Docker, WSL, or a POSIX shell.'
				: '- Command policy: Use POSIX-native commands and Node.js APIs.',
			'',
			'EXECUTION ENVIRONMENT AWARENESS',
			'- This session includes a runtime environment profile. Follow it exactly.',
			'- Decision ladder when shell commands are necessary:',
			'  1. Prefer swarm tools and Node.js fs/path APIs.',
			'  2. Use shell only when the task truly requires it.',
			'  3. When shell commands are needed, match the active shell family above.',
		].join('\n');
	}

	// testengineer
	return [
		header,
		`- Test execution policy: Always execute tests via the swarm test runner tool.`,
		policy.avoidPosixExamples
			? '  Do not describe POSIX shell setup commands unless the profile indicates Docker, WSL, or POSIX shell.'
			: '  Use POSIX semantics for test commands.',
		'',
		'ENVIRONMENT-SPECIFIC TEST EXECUTION RULES',
		profile.isWindowsNative
			? '- Native Windows + PowerShell: Assume PowerShell semantics for paths and env vars. Prefer Pester for PowerShell modules where appropriate.'
			: profile.isWindowsDocker
				? '- Windows + Docker: Host paths are Windows-style; in-container operations use POSIX semantics.'
				: '- Linux/macOS: Use POSIX semantics for all shell-related reasoning.',
		'- In all modes: prefer the swarm test runner over ad hoc shell commands.',
		'- When tests are skipped due to environment issues, explicitly mention the environment profile assumptions in your verdict.',
	].join('\n');
}
