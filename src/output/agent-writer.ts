import * as fs from 'node:fs';
import * as path from 'node:path';

export type AgentType =
	| 'architect'
	| 'coder'
	| 'reviewer'
	| 'test_engineer'
	| 'explorer'
	| 'sme'
	| 'critic'
	| 'docs'
	| 'designer';

export type OutputType =
	| 'review'
	| 'test'
	| 'research'
	| 'analysis'
	| 'summary';

export interface AgentOutputMetadata {
	agent: AgentType;
	type: OutputType;
	taskId: string;
	phase: number;
	timestamp: string;
	durationMs?: number;
	success?: boolean;
}

/**
 * Write agent output to persistent storage
 * Output: .swarm/outputs/phase-N/task-N.M/{agent}-{type}-{timestamp}.md
 */
export async function writeAgentOutput(
	directory: string,
	metadata: AgentOutputMetadata,
	content: string,
): Promise<string> {
	// Construct path
	const { phase, taskId, agent, type, timestamp } = metadata;

	const taskNum = taskId;

	const outputDir = path.join(
		directory,
		'.swarm',
		'outputs',
		`phase-${phase}`,
		`task-${taskNum}`,
	);

	// Ensure directory exists
	await fs.promises.mkdir(outputDir, { recursive: true });

	// Generate filename
	const safeTimestamp = timestamp.replace(/[:.]/g, '-');
	const filename = `${agent}-${type}-${safeTimestamp}.md`;
	const filePath = path.join(outputDir, filename);

	// Write content with YAML frontmatter
	const frontmatter = `---
agent: ${agent}
type: ${type}
taskId: ${taskId}
phase: ${phase}
timestamp: ${timestamp}
${metadata.durationMs ? `durationMs: ${metadata.durationMs}` : ''}
${metadata.success !== undefined ? `success: ${metadata.success}` : ''}
---

`;

	await fs.promises.writeFile(filePath, frontmatter + content, 'utf-8');

	return filePath;
}

/**
 * Read agent output from persistent storage
 */
export async function readAgentOutput(
	directory: string,
	phase: number,
	taskId: string,
): Promise<{ metadata: AgentOutputMetadata; content: string }[]> {
	const taskNum = taskId;
	const outputDir = path.join(
		directory,
		'.swarm',
		'outputs',
		`phase-${phase}`,
		`task-${taskNum}`,
	);

	if (!fs.existsSync(outputDir)) {
		return [];
	}

	const files = await fs.promises.readdir(outputDir);
	const outputs: { metadata: AgentOutputMetadata; content: string }[] = [];

	for (const file of files) {
		if (!file.endsWith('.md')) continue;

		const filePath = path.join(outputDir, file);
		const content = await fs.promises.readFile(filePath, 'utf-8');

		// Parse frontmatter
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) continue;

		const metadata: Record<string, string> = {};
		for (const line of frontmatterMatch[1].split('\n')) {
			const [key, ...valueParts] = line.split(':');
			if (key && valueParts.length > 0) {
				metadata[key.trim()] = valueParts.join(':').trim();
			}
		}

		outputs.push({
			metadata: {
				agent: metadata.agent as AgentType,
				type: metadata.type as OutputType,
				taskId: metadata.taskId,
				phase: parseInt(metadata.phase, 10),
				timestamp: metadata.timestamp,
				durationMs: metadata.durationMs
					? parseInt(metadata.durationMs, 10)
					: undefined,
				success:
					metadata.success === 'true'
						? true
						: metadata.success === 'false'
							? false
							: undefined,
			},
			content: content.replace(frontmatterMatch[0], '').trim(),
		});
	}

	// Sort by timestamp
	outputs.sort((a, b) =>
		a.metadata.timestamp.localeCompare(b.metadata.timestamp),
	);

	return outputs;
}

/**
 * List all agent outputs for a phase
 */
export async function listAgentOutputs(
	directory: string,
	phase?: number,
): Promise<AgentOutputMetadata[]> {
	const outputsDir = path.join(directory, '.swarm', 'outputs');

	if (!fs.existsSync(outputsDir)) {
		return [];
	}

	const phaseDirs = phase
		? [`phase-${phase}`]
		: (await fs.promises.readdir(outputsDir)).filter((d) =>
				d.startsWith('phase-'),
			);

	const outputs: AgentOutputMetadata[] = [];

	for (const phaseDir of phaseDirs) {
		const taskDirs = await fs.promises.readdir(path.join(outputsDir, phaseDir));

		for (const taskDir of taskDirs) {
			if (!taskDir.startsWith('task-')) continue;

			const taskDirPath = path.join(outputsDir, phaseDir, taskDir);
			const files = await fs.promises.readdir(taskDirPath);

			for (const file of files) {
				if (!file.endsWith('.md')) continue;

				// Parse filename: {agent}-{type}-{timestamp}.md
				// Timestamp format: 2026-03-06T10-30-00.000Z (ISO with dashes)
				const match = file.match(/^([^-]+)-([^-]+)-(.+)\.md$/);
				if (!match) continue;

				outputs.push({
					agent: match[1] as AgentType,
					type: match[2] as OutputType,
					taskId: taskDir.replace('task-', ''),
					phase: parseInt(phaseDir.replace('phase-', ''), 10),
					timestamp: match[3].replace(/-/g, ':'),
				});
			}
		}
	}

	return outputs;
}
