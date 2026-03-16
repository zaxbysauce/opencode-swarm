/**
 * Check gate status tool - read-only tool for querying task gate status.
 * Reads .swarm/evidence/{taskId}.json and returns structured JSON describing
 * which gates have passed, which are missing, and overall task status.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============ Constants ============
const EVIDENCE_DIR = '.swarm/evidence';

// ============ Types ============
interface GateInfo {
	sessionId: string;
	timestamp: string;
	agent: string;
}

interface EvidenceData {
	taskId: string;
	required_gates: string[];
	gates: Record<string, GateInfo>;
}

export interface GateStatusResult {
	taskId: string;
	status: 'all_passed' | 'incomplete' | 'no_evidence';
	required_gates: string[];
	passed_gates: string[];
	missing_gates: string[];
	gates: Record<string, GateInfo> | Record<string, never>;
	message: string;
}

// ============ Canonical Task ID Validation ============
// Align with gate-evidence.ts: allows N.M or N.M.P or N.M.P.Q (any number of segments)
// Plus security checks: no path traversal (..), no path separators (/, \), no null bytes
const TASK_ID_PATTERN = /^\d+\.\d+(\.\d+)*$/;

function isValidTaskId(taskId: string): boolean {
	if (!taskId) return false;
	if (taskId.includes('..')) return false;
	if (taskId.includes('/')) return false;
	if (taskId.includes('\\')) return false;
	if (taskId.includes('\0')) return false;
	return TASK_ID_PATTERN.test(taskId);
}

// ============ Path Security ============
function isPathWithinSwarm(filePath: string, workspaceRoot: string): boolean {
	// Validate against the actual workspace root, not user-provided working_directory
	// This prevents callers from pointing the tool at arbitrary directories
	const normalizedWorkspace = path.resolve(workspaceRoot);
	const swarmPath = path.join(normalizedWorkspace, '.swarm', 'evidence');
	const normalizedPath = path.resolve(filePath);
	return normalizedPath.startsWith(swarmPath);
}

// ============ Evidence Reading ============
function readEvidenceFile(evidencePath: string): EvidenceData | null {
	// Check if file exists
	if (!fs.existsSync(evidencePath)) {
		return null;
	}

	// Read and parse JSON
	let content: string;
	try {
		content = fs.readFileSync(evidencePath, 'utf-8');
	} catch {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return null;
	}

	// Validate structure
	if (
		parsed &&
		typeof parsed === 'object' &&
		Array.isArray((parsed as Record<string, unknown>).required_gates) &&
		typeof (parsed as Record<string, unknown>).gates === 'object' &&
		(parsed as Record<string, unknown>).gates !== null
	) {
		return parsed as EvidenceData;
	}

	return null;
}

// ============ Main Implementation ============

/**
 * Run check gate status - returns the status of gates for a task
 */
export async function runCheckGateStatus(
	taskIdInput: string,
	directory: string,
): Promise<string> {
	// Validate task_id format (canonical N.M or N.M.P or N.M.P.Q pattern with security checks)
	if (!isValidTaskId(taskIdInput)) {
		const errorResult: GateStatusResult = {
			taskId: taskIdInput,
			status: 'no_evidence',
			required_gates: [],
			passed_gates: [],
			missing_gates: [],
			gates: {},
			message: `Invalid task_id format: "${taskIdInput}". Must match N.M or N.M.P (e.g. "1.1", "1.2.3", "1.2.3.4")`,
		};
		return JSON.stringify(errorResult, null, 2);
	}

	// Use trusted workspace root from tool context (never caller-controlled)
	const evidencePath = path.join(
		directory,
		EVIDENCE_DIR,
		`${taskIdInput}.json`,
	);

	// Validate path is within workspace (defense in depth)
	if (!isPathWithinSwarm(evidencePath, directory)) {
		const errorResult: GateStatusResult = {
			taskId: taskIdInput,
			status: 'no_evidence',
			required_gates: [],
			passed_gates: [],
			missing_gates: [],
			gates: {},
			message: 'Invalid path: evidence path validation failed',
		};
		return JSON.stringify(errorResult, null, 2);
	}

	// Read evidence file
	const evidenceData = readEvidenceFile(evidencePath);

	// Handle missing or invalid evidence
	if (!evidenceData) {
		const errorResult: GateStatusResult = {
			taskId: taskIdInput,
			status: 'no_evidence',
			required_gates: [],
			passed_gates: [],
			missing_gates: [],
			gates: {},
			message: `No evidence file found for task "${taskIdInput}" at ${evidencePath}. Evidence file may be missing or invalid.`,
		};
		return JSON.stringify(errorResult, null, 2);
	}

	// Calculate passed and missing gates
	const requiredGates = evidenceData.required_gates || [];
	const gatesMap = evidenceData.gates || {};
	const passedGates: string[] = [];
	const missingGates: string[] = [];

	for (const requiredGate of requiredGates) {
		if (gatesMap[requiredGate]) {
			passedGates.push(requiredGate);
		} else {
			missingGates.push(requiredGate);
		}
	}

	// Determine overall status
	const status: 'all_passed' | 'incomplete' =
		missingGates.length === 0 ? 'all_passed' : 'incomplete';

	// Build message
	let message: string;
	if (status === 'all_passed') {
		message = `All required gates have passed for task "${taskIdInput}".`;
	} else {
		message = `Task "${taskIdInput}" is incomplete. Missing gates: ${missingGates.join(', ')}.`;
	}

	const result: GateStatusResult = {
		taskId: taskIdInput,
		status,
		required_gates: requiredGates,
		passed_gates: passedGates,
		missing_gates: missingGates,
		gates: gatesMap,
		message,
	};

	return JSON.stringify(result, null, 2);
}
