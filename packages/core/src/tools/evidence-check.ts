import * as fs from 'node:fs';
import * as path from 'node:path';

// ============ Constants ============
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB per evidence file
const MAX_EVIDENCE_FILES = 1000;
const EVIDENCE_DIR = '.swarm/evidence';
const PLAN_FILE = '.swarm/plan.md';

// Shell metacharacters that are not allowed in required_types
const SHELL_METACHAR_REGEX = /[;&|%$`\\]/;

// Valid filename regex for evidence files - accepts alphanumeric, underscores, hyphens, and dotted numeric task IDs (e.g., 1.21.json)
const VALID_EVIDENCE_FILENAME_REGEX =
	/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*\.json$/;

// ============ Legacy Evidence Type Normalization ============
// Maps legacy evidence type names to their current gate equivalents
const LEGACY_EVIDENCE_ALIAS_MAP: Record<string, string> = {
	review: 'reviewer',
	test: 'test_engineer',
};

/**
 * Normalize legacy evidence type names to current gate names.
 * @param type - The evidence type to normalize
 * @returns The normalized type name
 */
export function normalizeEvidenceType(type: string): string {
	return LEGACY_EVIDENCE_ALIAS_MAP[type.toLowerCase()] || type;
}

// ============ Types ============
export interface CompletedTask {
	taskId: string;
	taskName: string;
}

export interface EvidenceFile {
	taskId: string;
	type: string;
}

export interface Gap {
	taskId: string;
	taskName: string;
	missing: string[];
	present: string[];
}

export interface EvidenceCheckResult {
	completedTasks: CompletedTask[];
	tasksWithFullEvidence: string[];
	completeness: number;
	requiredTypes: string[];
	gaps: Gap[];
}

export interface NoTasksResult {
	message: string;
	gaps: [];
	completeness: number;
}

// ============ Validation ============
function containsControlChars(str: string): boolean {
	return /[\0\t\r\n]/.test(str);
}

export function validateRequiredTypes(input: string): string | null {
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
export function parseCompletedTasks(planContent: string): CompletedTask[] {
	const tasks: CompletedTask[] = [];
	// Match task IDs of any depth: 1.2, 1.21, 1.2.3, 1.2.3.4, etc.
	// Allows optional whitespace between task ID and colon (e.g., "- [x] 1.1   : Task")
	const regex = /^-\s+\[x\]\s+(\d+(?:\.\d+)+)\s*:\s+(.+)/gm;
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

		// Validate structure - support both legacy flat format and aggregate gate-evidence format
		// Legacy flat: { task_id: string, type: string }
		// Aggregate gate-evidence: { taskId: string, required_gates: string[], gates: { [key: string]: {...} } }
		if (parsed && typeof parsed === 'object') {
			const obj = parsed as Record<string, unknown>;

			// Check for legacy flat format: { task_id, type }
			if (typeof obj.task_id === 'string' && typeof obj.type === 'string') {
				evidence.push({
					taskId: obj.task_id as string,
					type: normalizeEvidenceType(obj.type as string),
				});
			}
			// Check for aggregate gate-evidence format: { taskId, gates }
			else if (
				typeof obj.taskId === 'string' &&
				obj.gates &&
				typeof obj.gates === 'object' &&
				!Array.isArray(obj.gates)
			) {
				const gatesObj = obj.gates as Record<string, unknown>;
				// Expand each key in gates object into separate evidence records
				for (const gateType of Object.keys(gatesObj)) {
					evidence.push({
						taskId: obj.taskId as string,
						type: normalizeEvidenceType(gateType),
					});
				}
			}
		}
	}

	return evidence;
}

// ============ Gap Analysis ============
export function analyzeGaps(
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
		// Normalize legacy evidence types when building the map
		evidenceByTask.get(ev.taskId)!.add(normalizeEvidenceType(ev.type));
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
