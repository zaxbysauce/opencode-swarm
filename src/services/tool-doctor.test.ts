import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TOOL_NAMES } from '../tools/tool-names';
import { runToolDoctor } from './tool-doctor';

describe('runToolDoctor — tool registration coherence', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-doctor-test-'));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('reports no errors when all TOOL_NAMES are registered', () => {
		// Create fake src/index.ts with all TOOL_NAMES registered
		const srcDir = path.join(tempDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });

		const toolBlockEntries = TOOL_NAMES.map((name) => `\t\t${name}`).join(
			',\n',
		);
		const fakeIndex = `const plugin = {\n\ttool: {\n${toolBlockEntries},\n\t},\n};\n`;
		fs.writeFileSync(path.join(srcDir, 'index.ts'), fakeIndex);

		const result = runToolDoctor(tempDir, tempDir);

		// Registration errors should be 0 (there may be warn-level binary findings)
		expect(result.summary.error).toBe(0);
	});

	test('reports error for each tool missing from tool block', () => {
		// Create fake src/index.ts with only 2 tools registered
		const srcDir = path.join(tempDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });

		const fakeIndex = `const plugin = {\n\ttool: {\n\t\tupdate_task_status,\n\t\tphase_complete,\n\t},\n};\n`;
		fs.writeFileSync(path.join(srcDir, 'index.ts'), fakeIndex);

		const result = runToolDoctor(tempDir, tempDir);

		expect(result.summary.error).toBeGreaterThan(0);

		// At least one finding should match missing-tool-registration-*
		const missingRegFindings = result.findings.filter(
			(f) =>
				f.id.startsWith('missing-tool-registration-') && f.severity === 'error',
		);
		expect(missingRegFindings.length).toBeGreaterThan(0);

		// update_task_status and phase_complete should NOT be in error findings
		// (they ARE registered)
		const updateTaskStatusError = result.findings.find(
			(f) =>
				f.id === 'missing-tool-registration-update_task_status' &&
				f.severity === 'error',
		);
		const phaseCompleteError = result.findings.find(
			(f) =>
				f.id === 'missing-tool-registration-phase_complete' &&
				f.severity === 'error',
		);
		expect(updateTaskStatusError).toBeUndefined();
		expect(phaseCompleteError).toBeUndefined();
	});

	test('parser handles tab-indented entries correctly', () => {
		// Create fake src/index.ts with tab-indented tool block entries
		const srcDir = path.join(tempDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });

		const fakeIndex = `const plugin = {\n\ttool: {\n\t\tupdate_task_status,\n\t\tphase_complete,\n\t},\n};\n`;
		fs.writeFileSync(path.join(srcDir, 'index.ts'), fakeIndex);

		const result = runToolDoctor(tempDir, tempDir);

		// update_task_status and phase_complete should NOT be in error findings
		// (they were found via the parser)
		const updateTaskStatusError = result.findings.find(
			(f) =>
				f.id === 'missing-tool-registration-update_task_status' &&
				f.severity === 'error',
		);
		const phaseCompleteError = result.findings.find(
			(f) =>
				f.id === 'missing-tool-registration-phase_complete' &&
				f.severity === 'error',
		);
		expect(updateTaskStatusError).toBeUndefined();
		expect(phaseCompleteError).toBeUndefined();
	});

	test('returns plugin-src-unavailable warning when src/index.ts does not exist', () => {
		// Don't create src/index.ts - the directory is empty
		const result = runToolDoctor(tempDir, tempDir);

		// Should return a graceful warning, not errors for all tools
		const srcUnavailableFinding = result.findings.find(
			(f) => f.id === 'plugin-src-unavailable',
		);
		expect(srcUnavailableFinding).toBeDefined();
		expect(srcUnavailableFinding?.severity).toBe('warn');
		expect(result.summary.warn).toBe(1);
		expect(result.summary.error).toBe(0);

		// Function should not throw
		expect(() => runToolDoctor(tempDir, tempDir)).not.toThrow();
	});
});

describe('runToolDoctor — AGENT_TOOL_MAP alignment', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-doctor-test-'));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test('reports error finding for tool in AGENT_TOOL_MAP but not in tool block', () => {
		// Create fake src/index.ts with NO tools registered
		const srcDir = path.join(tempDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });

		const fakeIndex = `const plugin = {\n\ttool: {},\n};\n`;
		fs.writeFileSync(path.join(srcDir, 'index.ts'), fakeIndex);

		const result = runToolDoctor(tempDir, tempDir);

		// Severity is 'error' — a missing registration silently breaks the
		// corresponding agent workflow (see council 6.66.0 regression). Treating
		// these as advisory led to the feature shipping broken; preflight should
		// now fail fast on this class of drift.
		const agentToolMapFindings = result.findings.filter(
			(f) =>
				f.id.startsWith('agent-tool-map-mismatch-') && f.severity === 'error',
		);
		expect(agentToolMapFindings.length).toBeGreaterThan(0);
	});
});

describe('runToolDoctor — binary readiness', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-doctor-test-'));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
		mock.restore();
	});

	test('reports warn finding for each binary not found on PATH', () => {
		// Mock isCommandAvailable to return false for all binaries
		mock.module('../../src/build/discovery', () => ({
			isCommandAvailable: () => false,
		}));

		// Create a fake src/index.ts (doesn't need real tools for binary check)
		const srcDir = path.join(tempDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
		fs.writeFileSync(
			path.join(srcDir, 'index.ts'),
			`const plugin = {\n\ttool: {},\n};\n`,
		);

		const result = runToolDoctor(tempDir, tempDir);

		const binaryFindings = result.findings.filter(
			(f) => f.id.startsWith('missing-binary-') && f.severity === 'warn',
		);
		expect(binaryFindings.length).toBeGreaterThan(0);
		expect(result.summary.warn).toBeGreaterThan(0);
	});

	test('reports no binary findings when all binaries available', () => {
		// Mock isCommandAvailable to return true for all
		mock.module('../../src/build/discovery', () => ({
			isCommandAvailable: () => true,
		}));

		// Create src/index.ts with all TOOL_NAMES registered
		const srcDir = path.join(tempDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });

		const toolBlockEntries = TOOL_NAMES.map((name) => `\t\t${name}`).join(
			',\n',
		);
		const fakeIndex = `const plugin = {\n\ttool: {\n${toolBlockEntries},\n\t},\n};\n`;
		fs.writeFileSync(path.join(srcDir, 'index.ts'), fakeIndex);

		const result = runToolDoctor(tempDir, tempDir);

		const binaryFindings = result.findings.filter((f) =>
			f.id.startsWith('missing-binary-'),
		);
		expect(binaryFindings.length).toBe(0);
	});
});
