import {
	describe,
	expect,
	it,
	beforeEach,
	afterEach,
} from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { AutomationStatusArtifact } from '../../../src/background/status-artifact';

describe('AutomationStatusArtifact', () => {
	let tempDir: string;
	let artifact: AutomationStatusArtifact;

	beforeEach(() => {
		// Create a temporary directory for each test
		tempDir = mkdtempSync(path.join(tmpdir(), 'swarm-test-'));
		artifact = new AutomationStatusArtifact(tempDir, 'automation-status.json');
	});

	afterEach(() => {
		// Clean up temp directory
		rmSync(tempDir, { recursive: true, force: true });
	});

	// ===== SECURITY TESTS =====

	describe('Filename Validation Security', () => {
		it('should reject absolute path in filename', () => {
			expect(() => {
				new AutomationStatusArtifact(tempDir, '/etc/passwd');
			}).toThrow('path separator');
		});

		it('should reject absolute path with drive letter', () => {
			expect(() => {
				new AutomationStatusArtifact(tempDir, 'C:\\Windows\\System32\\config');
			}).toThrow('path separator');
		});

		it('should reject null-byte in filename', () => {
			expect(() => {
				new AutomationStatusArtifact(tempDir, 'test\0.txt');
			}).toThrow('null byte');
		});

		it('should reject path separator / in filename', () => {
			expect(() => {
				new AutomationStatusArtifact(tempDir, '../etc/passwd');
			}).toThrow("path separator");
		});

		it('should reject path separator \\ in filename', () => {
			expect(() => {
				new AutomationStatusArtifact(tempDir, '..\\etc\\passwd');
			}).toThrow("path separator");
		});

		it('should reject forward slash in filename', () => {
			expect(() => {
				new AutomationStatusArtifact(tempDir, 'subdir/status.json');
			}).toThrow("path separator '/'");
		});

		it('should reject backslash in filename', () => {
			expect(() => {
				new AutomationStatusArtifact(tempDir, 'subdir\\status.json');
			}).toThrow('path separator');
		});

		it('should reject very long filename', () => {
			const longName = 'a'.repeat(300) + '.json';
			expect(() => {
				new AutomationStatusArtifact(tempDir, longName);
			}).toThrow('exceeds maximum length');
		});

		it('should reject empty filename', () => {
			expect(() => {
				new AutomationStatusArtifact(tempDir, '');
			}).toThrow();
		});

		it('should reject whitespace-only filename', () => {
			expect(() => {
				new AutomationStatusArtifact(tempDir, '   ');
			}).toThrow();
		});

		it('should reject filename with unsafe characters', () => {
			expect(() => {
				new AutomationStatusArtifact(tempDir, 'test<script>.json');
			}).toThrow('unsafe characters');
		});

		it('should accept valid filename', () => {
			const validArtifact = new AutomationStatusArtifact(tempDir, 'status.json');
			expect(validArtifact).toBeDefined();
		});

		it('should accept filename with dashes and underscores', () => {
			const validArtifact = new AutomationStatusArtifact(tempDir, 'my_status-file.json');
			expect(validArtifact).toBeDefined();
		});

		it('should accept default filename', () => {
			const validArtifact = new AutomationStatusArtifact(tempDir);
			expect(validArtifact).toBeDefined();
		});
	});

	// ===== EXISTING TESTS =====

	it('should create empty snapshot on init', () => {
		const snapshot = artifact.getSnapshot();

		expect(snapshot.mode).toBe('manual');
		expect(snapshot.enabled).toBe(false);
		expect(snapshot.currentPhase).toBe(0);
		expect(snapshot.lastTrigger).toBeNull();
		expect(snapshot.pendingActions).toBe(0);
		expect(snapshot.lastOutcome).toBeNull();
	});

	it('should write snapshot to disk', () => {
		artifact.updatePhase(3);

		const filePath = path.join(tempDir, 'automation-status.json');
		expect(fs.existsSync(filePath)).toBe(true);

		const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
		expect(content.currentPhase).toBe(3);
	});

	it('should load existing snapshot', () => {
		artifact.updatePhase(5);
		artifact.updateConfig('hybrid', {
			plan_sync: true,
			phase_preflight: true,
			config_doctor_on_startup: false,
			evidence_auto_summaries: false,
			decision_drift_detection: false,
		});

		// Create new instance - should load existing
		const artifact2 = new AutomationStatusArtifact(tempDir, 'automation-status.json');
		const snapshot = artifact2.getSnapshot();

		expect(snapshot.currentPhase).toBe(5);
		expect(snapshot.mode).toBe('hybrid');
		expect(snapshot.capabilities.phase_preflight).toBe(true);
	});

	it('should update config', () => {
		artifact.updateConfig('auto', {
			plan_sync: true,
			phase_preflight: true,
			config_doctor_on_startup: false,
			evidence_auto_summaries: false,
			decision_drift_detection: false,
		});

		const snapshot = artifact.getSnapshot();
		expect(snapshot.mode).toBe('auto');
		expect(snapshot.enabled).toBe(true);
		expect(snapshot.capabilities.phase_preflight).toBe(true);
	});

	it('should update phase', () => {
		artifact.updatePhase(2);

		const snapshot = artifact.getSnapshot();
		expect(snapshot.currentPhase).toBe(2);
	});

	it('should record trigger', () => {
		const now = Date.now();
		artifact.recordTrigger(now, 3, 'phase_boundary', 'Phase transition from 2 to 3');

		const snapshot = artifact.getSnapshot();
		expect(snapshot.lastTrigger).not.toBeNull();
		expect(snapshot.lastTrigger?.triggeredAt).toBe(now);
		expect(snapshot.lastTrigger?.triggeredPhase).toBe(3);
		expect(snapshot.lastTrigger?.source).toBe('phase_boundary');
		expect(snapshot.lastTrigger?.reason).toContain('Phase transition');
	});

	it('should update pending actions count', () => {
		artifact.updatePendingActions(5);

		const snapshot = artifact.getSnapshot();
		expect(snapshot.pendingActions).toBe(5);
	});

	it('should record outcome', () => {
		artifact.recordOutcome('success', 2, 'All checks passed');

		const snapshot = artifact.getSnapshot();
		expect(snapshot.lastOutcome).not.toBeNull();
		expect(snapshot.lastOutcome?.state).toBe('success');
		expect(snapshot.lastOutcome?.phase).toBe(2);
		expect(snapshot.lastOutcome?.message).toBe('All checks passed');
	});

	it('should clear outcome', () => {
		artifact.recordOutcome('success', 2);
		artifact.clearOutcome();

		const snapshot = artifact.getSnapshot();
		expect(snapshot.lastOutcome?.state).toBe('none');
		expect(snapshot.lastOutcome?.phase).toBeNull();
	});

	it('should check if enabled', () => {
		expect(artifact.isEnabled()).toBe(false);

		artifact.updateConfig('hybrid', {
			plan_sync: false,
			phase_preflight: false,
			config_doctor_on_startup: false,
			evidence_auto_summaries: false,
			decision_drift_detection: false,
		});
		expect(artifact.isEnabled()).toBe(true);
	});

	it('should check capabilities', () => {
		artifact.updateConfig('hybrid', {
			plan_sync: false,
			phase_preflight: true,
			config_doctor_on_startup: false,
			evidence_auto_summaries: false,
			decision_drift_detection: false,
		});

		expect(artifact.hasCapability('phase_preflight')).toBe(true);
		expect(artifact.hasCapability('plan_sync')).toBe(false);
	});

	it('should return GUI summary', () => {
		artifact.updateConfig('auto', {
			plan_sync: true,
			phase_preflight: true,
			config_doctor_on_startup: false,
			evidence_auto_summaries: false,
			decision_drift_detection: false,
		});
		artifact.updatePhase(2);
		artifact.recordTrigger(Date.now(), 2, 'phase_boundary', 'test');
		artifact.updatePendingActions(3);
		artifact.recordOutcome('success', 2);

		const summary = artifact.getGuiSummary();

		expect(summary.status).toBe('Auto');
		expect(summary.phase).toBe(2);
		expect(summary.lastTrigger).not.toBeNull();
		expect(summary.pending).toBe(3);
		expect(summary.outcome).toBe('success');
	});

	it('should read from disk forcing reload', () => {
		artifact.updatePhase(5);

		// Modify the file directly
		const filePath = path.join(tempDir, 'automation-status.json');
		const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
		content.currentPhase = 10;
		fs.writeFileSync(filePath, JSON.stringify(content), 'utf-8');

		// read() should get the new value
		const snapshot = artifact.read();
		expect(snapshot.currentPhase).toBe(10);
	});

	it('should handle non-existent file gracefully', () => {
		const artifact2 = new AutomationStatusArtifact('/non/existent/path');
		const snapshot = artifact2.getSnapshot();

		// Should return default values
		expect(snapshot.mode).toBe('manual');
		expect(snapshot.currentPhase).toBe(0);
	});
});
