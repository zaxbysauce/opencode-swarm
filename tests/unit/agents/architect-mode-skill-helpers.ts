import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PLAN_PROTOCOL = readFileSync(
	join(process.cwd(), '.opencode/skills/plan/SKILL.md'),
	'utf-8',
);

export const EXECUTE_PROTOCOL = readFileSync(
	join(process.cwd(), '.opencode/skills/execute/SKILL.md'),
	'utf-8',
);

export const EXTRACTED_MODE_PROTOCOLS = `${PLAN_PROTOCOL}\n${EXECUTE_PROTOCOL}`;

export function withExtractedModeProtocols(prompt: string): string {
	let result = prompt;

	const criticGateMarker = '### MODE: CRITIC-GATE';
	if (
		result.includes(criticGateMarker) &&
		!result.includes('# Plan Protocol')
	) {
		result = result.replace(
			criticGateMarker,
			`${PLAN_PROTOCOL}\n${criticGateMarker}`,
		);
	}

	const retroGateMarker = '## ⛔ RETROSPECTIVE GATE';
	if (
		result.includes(retroGateMarker) &&
		!result.includes('# Execute Protocol')
	) {
		result = result.replace(
			retroGateMarker,
			`${EXECUTE_PROTOCOL}\n${retroGateMarker}`,
		);
	}

	return result;
}

export function getExtractedPlanSection(prompt: string): string {
	const start = prompt.indexOf('### MODE: PLAN');
	const end = prompt.indexOf('### MODE: CRITIC-GATE', start);
	const stub =
		start === -1 ? '' : prompt.slice(start, end === -1 ? undefined : end);
	return `${stub}\n${PLAN_PROTOCOL}`;
}

export function getExtractedExecuteSection(prompt: string): string {
	const start = prompt.indexOf('### MODE: EXECUTE');
	const end = prompt.indexOf('### MODE: PHASE-WRAP', start);
	const stub =
		start === -1 ? '' : prompt.slice(start, end === -1 ? undefined : end);
	return `${stub}\n${EXECUTE_PROTOCOL}`;
}
