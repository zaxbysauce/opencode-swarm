import fs from 'node:fs';
import path from 'node:path';

export type TestRunResult = 'pass' | 'fail' | 'skip';

export interface TestRunRecord {
	timestamp: string; // ISO 8601
	taskId: string; // swarm task ID (e.g., "4.1")
	testFile: string; // normalized forward-slash path
	testName: string; // test name/description
	result: TestRunResult;
	durationMs: number; // >= 0
	errorMessage?: string; // truncated to 500 chars max
	stackPrefix?: string; // first line of stack trace, truncated to 200 chars max
	changedFiles: string[]; // files that triggered this test run, max 50 entries
}

const MAX_HISTORY_PER_TEST = 20;
const MAX_ERROR_LENGTH = 500;
const MAX_STACK_LENGTH = 200;
const MAX_CHANGED_FILES = 50;

function getHistoryPath(workingDir?: string): string {
	return path.join(
		workingDir || process.cwd(),
		'.swarm',
		'cache',
		'test-history.jsonl',
	);
}

function sanitizeErrorMessage(errorMessage?: string): string | undefined {
	if (errorMessage === undefined) {
		return undefined;
	}
	if (errorMessage.length > MAX_ERROR_LENGTH) {
		return errorMessage.substring(0, MAX_ERROR_LENGTH);
	}
	return errorMessage;
}

function sanitizeStackPrefix(stackPrefix?: string): string | undefined {
	if (stackPrefix === undefined) {
		return undefined;
	}
	if (stackPrefix.length > MAX_STACK_LENGTH) {
		return stackPrefix.substring(0, MAX_STACK_LENGTH);
	}
	return stackPrefix;
}

const DANGEROUS_PROPERTY_NAMES = new Set([
	'__proto__',
	'constructor',
	'prototype',
]);

function sanitizeChangedFiles(changedFiles: string[]): string[] {
	const validFiles = changedFiles.filter(
		(f): f is string =>
			typeof f === 'string' && f.length > 0 && !DANGEROUS_PROPERTY_NAMES.has(f),
	);
	return validFiles.slice(0, MAX_CHANGED_FILES);
}

export function appendTestRun(
	record: TestRunRecord,
	workingDir?: string,
): void {
	// Validate required string fields
	if (typeof record.testFile !== 'string' || record.testFile.length === 0) {
		throw new TypeError('testFile must be a non-empty string');
	}
	if (typeof record.testName !== 'string' || record.testName.length === 0) {
		throw new TypeError('testName must be a non-empty string');
	}
	if (typeof record.taskId !== 'string' || record.taskId.length === 0) {
		throw new TypeError('taskId must be a non-empty string');
	}

	// Validate result type
	if (
		record.result !== 'pass' &&
		record.result !== 'fail' &&
		record.result !== 'skip'
	) {
		throw new TypeError('result must be "pass", "fail", or "skip"');
	}

	// Validate durationMs is a finite number
	if (
		typeof record.durationMs !== 'number' ||
		!Number.isFinite(record.durationMs)
	) {
		throw new TypeError('durationMs must be a finite number');
	}

	// Validate timestamp format if provided
	if (
		record.timestamp !== undefined &&
		Number.isNaN(Date.parse(record.timestamp))
	) {
		throw new TypeError('timestamp must be a valid ISO 8601 string');
	}

	// Validate changedFiles is an array if provided
	if (
		record.changedFiles !== undefined &&
		!Array.isArray(record.changedFiles)
	) {
		throw new TypeError('changedFiles must be an array');
	}

	// Sanitize and validate fields
	const sanitizedRecord: TestRunRecord = {
		...record,
		timestamp: record.timestamp || new Date().toISOString(),
		durationMs: Math.max(0, record.durationMs),
		errorMessage: sanitizeErrorMessage(record.errorMessage),
		stackPrefix: sanitizeStackPrefix(record.stackPrefix),
		changedFiles: sanitizeChangedFiles(record.changedFiles || []),
	};

	const historyPath = getHistoryPath(workingDir);
	const historyDir = path.dirname(historyPath);

	// Create directory if it doesn't exist
	if (!fs.existsSync(historyDir)) {
		fs.mkdirSync(historyDir, { recursive: true });
	}

	// Read existing records
	const existingRecords = readAllRecords(historyPath);

	// Append new record
	existingRecords.push(sanitizedRecord);

	// Prune: keep only last 20 records per testFile
	const recordsByFile = new Map<string, TestRunRecord[]>();
	for (const rec of existingRecords) {
		const normalizedFile = rec.testFile.toLowerCase();
		if (!recordsByFile.has(normalizedFile)) {
			recordsByFile.set(normalizedFile, []);
		}
		recordsByFile.get(normalizedFile)!.push(rec);
	}

	// Rebuild with pruning
	const prunedRecords: TestRunRecord[] = [];
	for (const [, records] of recordsByFile) {
		// Sort by timestamp ascending within each file
		records.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
		// Keep only last MAX_HISTORY_PER_TEST records
		const toKeep = records.slice(-MAX_HISTORY_PER_TEST);
		prunedRecords.push(...toKeep);
	}

	// Sort final output by timestamp (oldest first)
	prunedRecords.sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);

	// Write atomically: temp file + rename to prevent corruption on crash
	try {
		const lines = prunedRecords.map((rec) => JSON.stringify(rec));
		const content = `${lines.join('\n')}\n`;
		const tempPath = `${historyPath}.tmp`;
		fs.writeFileSync(tempPath, content, 'utf-8');
		fs.renameSync(tempPath, historyPath);
	} catch (err) {
		// Clean up temp file if rename failed
		try {
			const tempPath = `${historyPath}.tmp`;
			if (fs.existsSync(tempPath)) {
				fs.unlinkSync(tempPath);
			}
		} catch {
			// Ignore cleanup failure
		}
		throw new Error(
			`Failed to write test history: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

function readAllRecords(historyPath: string): TestRunRecord[] {
	if (!fs.existsSync(historyPath)) {
		return [];
	}

	try {
		const content = fs.readFileSync(historyPath, 'utf-8');
		const lines = content.split('\n');
		const records: TestRunRecord[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.length === 0) {
				continue;
			}
			try {
				const parsed = JSON.parse(trimmed);
				// Basic validation: ensure it's an object with required fields
				if (
					typeof parsed === 'object' &&
					parsed !== null &&
					'testFile' in parsed &&
					'testName' in parsed &&
					'result' in parsed
				) {
					records.push(parsed as TestRunRecord);
				}
			} catch {
				// Skip corrupted JSON lines silently
			}
		}

		return records;
	} catch (err) {
		throw new Error(
			`Failed to read test history: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

export function getTestHistory(
	testFile: string,
	workingDir?: string,
): TestRunRecord[] {
	const historyPath = getHistoryPath(workingDir);
	const allRecords = readAllRecords(historyPath);

	const normalizedSearchFile = testFile.toLowerCase();

	// Filter records for the given testFile with case-insensitive comparison
	const filtered = allRecords.filter((rec) => {
		return rec.testFile.toLowerCase() === normalizedSearchFile;
	});

	// Sort by timestamp (oldest first)
	filtered.sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);

	return filtered;
}

export function getAllHistory(workingDir?: string): TestRunRecord[] {
	const historyPath = getHistoryPath(workingDir);
	const records = readAllRecords(historyPath);

	// Sort by timestamp (oldest first)
	records.sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);

	return records;
}
