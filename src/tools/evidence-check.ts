import * as fs from 'node:fs';
import * as path from 'node:path';
import { tool } from '@opencode-ai/plugin';

// ============ Constants ============
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB per evidence file
const MAX_EVIDENCE_FILES = 1000;
const EVIDENCE_DIR = '.swarm/evidence';
const PLAN_FILE = '.swarm/plan.md';

// Shell metacharacters that are not allowed in required_types
const SHELL_METACHAR_REGEX = /[;&|%$`\\]/;

// Valid filename regex for evidence files
const VALID_EVIDENCE_FILENAME_REGEX = /^[a-zA-Z0-9_-]+\.json$/;

// ============ Types ============
interface CompletedTask {
	taskId: string;
	taskName: string;
}

interface EvidenceFile {
	taskId: string;
	type: string;
}

interface Gap {
	taskId: string;
	taskName: string;
	missing: string[];
	present: string[];
}

interface EvidenceCheckResult {
	completedTasks: CompletedTask[];
	tasksWithFullEvidence: string[];
	completeness: number;
	requiredTypes: string[];
	gaps: Gap[];
}

interface NoTasksResult {
	message: string;
	gaps: [];
	completeness: number;
}

// ============ Validation ============
function containsControlChars(str: string): boolean {
	return /[\0\t\r\n]/.test(str);
}

function validateRequiredTypes(input: string): string | null {
	if (containsControlChars(input)) {
		return 'required_types contains control characters';
	}
	if (SHELL_METACHAR_REGEX.test(input)) {
		return 'required_types contains shell metacharacters (;|&%$`\\)';
	}
	// Only allow alphanumeric, commas, spaces, underscores, hyphens
	if (!/^[a-zA-Z0-9,\s_-]+$/.test(input)) {
		return 'required_types contains invalid characters (only alphanumeric, commas, spaces, underscores, hyphens allowed)';
	}
	return null;
}

// ============ Path Security ============
function isPathWithinSwarm(filePath: string, cwd: string): boolean {
	const normalizedCwd = path.resolve(cwd);
	const swarmPath = path.join(normalizedCwd, '.swarm');
	const normalizedPath = path.resolve(filePath);
	return normalizedPath.startsWith(swarmPath);
}

// ============ Plan Parsing ============
function parseCompletedTasks(planContent: string): CompletedTask[] {
	const tasks: CompletedTask[] = [];
	const regex = /^-\s+\[x\]\s+(\d+\.\d+):\s+(.+)/gm;
	for (
		let match = regex.exec(planContent);
		match !== null;
		match = regex.exec(planContent)
	) {
		const taskId = match[1];
		let taskName = match[2].trim();

		// Strip trailing size tags like [SMALL], [MEDIUM], [LARGE]
		taskName = taskName.replace(/\s*\[(SMALL|MEDIUM|LARGE)\]\s*$/i, '').trim();

		tasks.push({ taskId, taskName });
	}

	return tasks;
}

// ============ Evidence Reading ============
function readEvidenceFiles(evidenceDir: string, _cwd: string): EvidenceFile[] {
	const evidence: EvidenceFile[] = [];

	// Handle missing evidence directory gracefully
	if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
		return evidence;
	}

	let files: string[];
	try {
		files = fs.readdirSync(evidenceDir);
	} catch {
		return evidence;
	}

	// Limit number of files to read
	const filesToProcess = files.slice(0, MAX_EVIDENCE_FILES);

	for (const filename of filesToProcess) {
		// Validate filename with regex
		if (!VALID_EVIDENCE_FILENAME_REGEX.test(filename)) {
			continue;
		}

		const filePath = path.join(evidenceDir, filename);

		// Security check: ensure symlinks don't escape .swarm/evidence/
		try {
			const resolvedPath = path.resolve(filePath);
			const evidenceDirResolved = path.resolve(evidenceDir);

			if (!resolvedPath.startsWith(evidenceDirResolved)) {
				// Symlink points outside evidence directory - skip
				continue;
			}

			// Check it's still a file (not a directory)
			const stat = fs.lstatSync(filePath);
			if (!stat.isFile()) {
				continue;
			}
		} catch {
			// Skip files that can't be stat'd
			continue;
		}

		// Check file size
		let fileStat: fs.Stats;
		try {
			fileStat = fs.statSync(filePath);
			if (fileStat.size > MAX_FILE_SIZE_BYTES) {
				continue; // Skip oversized files
			}
		} catch {
			continue;
		}

		// Read and parse JSON
		let content: string;
		try {
			content = fs.readFileSync(filePath, 'utf-8');
		} catch {
			continue;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(content);
		} catch {
			// Skip corrupt/unparseable JSON files
			continue;
		}

		// Validate structure
		if (
			parsed &&
			typeof parsed === 'object' &&
			typeof (parsed as Record<string, unknown>).task_id === 'string' &&
			typeof (parsed as Record<string, unknown>).type === 'string'
		) {
			evidence.push({
				taskId: (parsed as Record<string, unknown>).task_id as string,
				type: (parsed as Record<string, unknown>).type as string,
			});
		}
	}

	return evidence;
}

// ============ Gap Analysis ============
function analyzeGaps(
	completedTasks: CompletedTask[],
	evidence: EvidenceFile[],
	requiredTypes: string[],
): { tasksWithFullEvidence: string[]; gaps: Gap[] } {
	const tasksWithFullEvidence: string[] = [];
	const gaps: Gap[] = [];

	// Build a map of taskId -> set of evidence types
	const evidenceByTask = new Map<string, Set<string>>();
	for (const ev of evidence) {
		if (!evidenceByTask.has(ev.taskId)) {
			evidenceByTask.set(ev.taskId, new Set());
		}
		evidenceByTask.get(ev.taskId)!.add(ev.type);
	}

	for (const task of completedTasks) {
		const taskEvidence = evidenceByTask.get(task.taskId) || new Set();
		const requiredSet = new Set(requiredTypes.map((t) => t.toLowerCase()));
		const _presentSet = new Set(
			[...taskEvidence].filter((t) => requiredSet.has(t.toLowerCase())),
		);

		const missing: string[] = [];
		const present: string[] = [];

		for (const reqType of requiredTypes) {
			const reqLower = reqType.toLowerCase();
			const found = [...taskEvidence].some((t) => t.toLowerCase() === reqLower);
			if (found) {
				present.push(reqType);
			} else {
				missing.push(reqType);
			}
		}

		if (missing.length === 0) {
			tasksWithFullEvidence.push(task.taskId);
		} else {
			gaps.push({
				taskId: task.taskId,
				taskName: task.taskName,
				missing,
				present,
			});
		}
	}

	return { tasksWithFullEvidence, gaps };
}

// ============ Tool Definition ============
export const evidence_check: ReturnType<typeof tool> = tool({
	description:
		'Verify completed tasks in the plan have required evidence. Reads .swarm/plan.md for completed tasks and .swarm/evidence/ for evidence files. Returns JSON with completeness ratio and gaps for tasks missing required evidence types.',
	args: {
		required_types: tool.schema
			.string()
			.optional()
			.describe(
				'Comma-separated evidence types required per task (default: "review,test")',
			),
	},
	async execute(args: unknown, _context: unknown): Promise<string> {
		// Safe args extraction
		let requiredTypesInput: string | undefined;
		try {
			if (args && typeof args === 'object') {
				const obj = args as Record<string, unknown>;
				requiredTypesInput =
					typeof obj.required_types === 'string'
						? obj.required_types
						: undefined;
			}
		} catch {
			// Malicious getter threw
		}

		// Get current working directory
		const cwd = process.cwd();

		// Validate required_types
		const requiredTypesValue = requiredTypesInput || 'review,test';
		const validationError = validateRequiredTypes(requiredTypesValue);
		if (validationError) {
			const errorResult = {
				error: `invalid required_types: ${validationError}`,
				completedTasks: [],
				tasksWithFullEvidence: [],
				completeness: 0,
				requiredTypes: [],
				gaps: [],
			};
			return JSON.stringify(errorResult, null, 2);
		}

		// Parse required types
		const requiredTypes = requiredTypesValue
			.split(',')
			.map((t) => t.trim())
			.filter((t) => t.length > 0);

		// Read plan file
		const planPath = path.join(cwd, PLAN_FILE);

		// Security check: ensure plan path is within .swarm/
		if (!isPathWithinSwarm(planPath, cwd)) {
			const errorResult = {
				error: 'plan file path validation failed',
				completedTasks: [],
				tasksWithFullEvidence: [],
				completeness: 0,
				requiredTypes: [],
				gaps: [],
			};
			return JSON.stringify(errorResult, null, 2);
		}

		let planContent: string;
		try {
			planContent = fs.readFileSync(planPath, 'utf-8');
		} catch {
			// Plan file doesn't exist or can't be read
			const result: NoTasksResult = {
				message: 'No completed tasks found in plan.',
				gaps: [],
				completeness: 1.0,
			};
			return JSON.stringify(result, null, 2);
		}

		// Parse completed tasks
		const completedTasks = parseCompletedTasks(planContent);

		// Handle no completed tasks
		if (completedTasks.length === 0) {
			const result: NoTasksResult = {
				message: 'No completed tasks found in plan.',
				gaps: [],
				completeness: 1.0,
			};
			return JSON.stringify(result, null, 2);
		}

		// Read evidence files
		const evidenceDir = path.join(cwd, EVIDENCE_DIR);
		const evidence = readEvidenceFiles(evidenceDir, cwd);

		// Analyze gaps
		const { tasksWithFullEvidence, gaps } = analyzeGaps(
			completedTasks,
			evidence,
			requiredTypes,
		);

		// Calculate completeness ratio
		const completeness =
			completedTasks.length > 0
				? Math.round(
						(tasksWithFullEvidence.length / completedTasks.length) * 100,
					) / 100
				: 1.0;

		const result: EvidenceCheckResult = {
			completedTasks,
			tasksWithFullEvidence,
			completeness,
			requiredTypes,
			gaps,
		};

		return JSON.stringify(result, null, 2);
	},
});
