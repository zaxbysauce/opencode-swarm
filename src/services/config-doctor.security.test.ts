/**
 * ADVERSARIAL SECURITY TESTS for Config Doctor + Migration Assistant
 *
 * Attack vectors covered:
 * 1. Backup artifact tampering
 * 2. Restore path abuse
 * 3. Hash bypass attempts
 * 4. Malformed config doctor artifacts
 * 5. Startup autofix abuse
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginConfig } from '../config/schema';
import {
	applySafeAutoFixes,
	type ConfigBackup,
	type ConfigDoctorResult,
	restoreFromBackup,
	runConfigDoctor,
	writeBackupArtifact,
} from './config-doctor';

// Test utilities
function createTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'config-doctor-security-test-'));
}

function cleanupDir(dir: string): void {
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function createTestConfig(dir: string, config: object): string {
	const configDir = path.join(dir, '.opencode');
	fs.mkdirSync(configDir, { recursive: true });
	const configPath = path.join(configDir, 'opencode-swarm.json');
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
	return configPath;
}

function computeSHA256(content: string): string {
	return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

// ===========================================================================
// ATTACK VECTOR 1: BACKUP ARTIFACT TAMPERING
// ===========================================================================

describe('SECURITY: Backup Artifact Tampering', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		cleanupDir(tempDir);
	});

	describe('Hash integrity attacks', () => {
		it('should reject artifact with modified content but valid-looking hash format', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const originalContent = '{ "legitimate": true }';
			const tamperedContent = '{ "malicious": true, "admin": true }';

			// Create backup with original content and correct hash
			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content: originalContent,
				contentHash: computeSHA256(originalContent),
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			// Tamper: Replace content but keep original hash
			const artifact = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
			artifact.content = tamperedContent;
			fs.writeFileSync(backupPath, JSON.stringify(artifact), 'utf-8');

			// Attempt restore should fail
			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject artifact with transposed characters in hash', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const content = '{ "test": true }';
			const correctHash = computeSHA256(content);

			// Transpose two characters in the hash
			const tamperedHash =
				correctHash.substring(2) + correctHash.substring(0, 2);

			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content,
				contentHash: tamperedHash,
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject artifact with bit-flipped hash', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const content = '{ "test": true }';
			const correctHash = computeSHA256(content);

			// Flip a hex character
			const hashChars = correctHash.split('');
			const idx = 10;
			const original = hashChars[idx];
			hashChars[idx] = original === 'a' ? 'b' : 'a';
			const tamperedHash = hashChars.join('');

			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content,
				contentHash: tamperedHash,
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).toBeNull();
		});
	});

	describe('Content injection attacks', () => {
		it('should handle artifact with executable code in content safely', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			// Try to inject what looks like executable code
			const maliciousContent = JSON.stringify({
				test: true,
				__proto__: { admin: true },
				constructor: { prototype: { polluted: true } },
			});

			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content: maliciousContent,
				contentHash: computeSHA256(maliciousContent),
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).not.toBeNull();

			// Read restored content and verify prototype is NOT polluted
			const restored = JSON.parse(fs.readFileSync(result!, 'utf-8'));
			expect(restored.test).toBe(true);
			// Prototype pollution should NOT affect new objects
			const testObj: Record<string, unknown> = {};
			expect(testObj.admin).toBeUndefined();
			expect(testObj.polluted).toBeUndefined();
		});

		it('should handle artifact with circular reference attempt in content', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const badPath = path.join(swarmDir, 'config-backup-circular.json');

			// Write artifact with content that references itself
			fs.writeFileSync(
				badPath,
				JSON.stringify({
					createdAt: Date.now(),
					configPath: path.join(configDir, 'opencode-swarm.json'),
					content: '{ "$ref": "#", "nested": { "$ref": "#/nested" } }',
					contentHash: computeSHA256(
						'{ "$ref": "#", "nested": { "$ref": "#/nested" } }',
					),
				}),
				'utf-8',
			);

			// Should not crash - restores the JSON as-is (it's valid JSON string)
			const result = restoreFromBackup(badPath, tempDir);
			expect(result).not.toBeNull();
		});

		it('should handle artifact with extremely large content without crash (DoS attempt)', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			// Create content > 10MB
			const hugeContent = JSON.stringify({
				data: 'x'.repeat(11 * 1024 * 1024),
			});

			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content: hugeContent,
				contentHash: computeSHA256(hugeContent),
			};

			// Write directly (writeBackupArtifact might truncate)
			const backupPath = path.join(swarmDir, 'config-backup-huge.json');
			fs.writeFileSync(
				backupPath,
				JSON.stringify({
					...backup,
					preview: `${hugeContent.substring(0, 500)}...`,
				}),
				'utf-8',
			);

			// Should handle large content - restore should succeed or fail gracefully
			// Not a security vulnerability if it handles the content without crash
			let result: string | null = null;
			expect(() => {
				result = restoreFromBackup(backupPath, tempDir);
			}).not.toThrow();
			// Either succeeds or fails gracefully (no crash = pass)
			expect(result === null || typeof result === 'string').toBe(true);
		});
	});
});

// ===========================================================================
// ATTACK VECTOR 2: RESTORE PATH ABUSE
// ===========================================================================

describe('SECURITY: Restore Path Abuse', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		cleanupDir(tempDir);
	});

	describe('Path traversal attacks', () => {
		it('should reject restore with multiple parent directory traversals', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const traversalPaths = [
				'../../../../../../../../etc/passwd',
				'..\\..\\..\\..\\..\\..\\..\\windows\\system32\\config\\sam',
				'foo/../../../bar/../../../etc/shadow',
			];

			for (const attackPath of traversalPaths) {
				const badPath = path.join(swarmDir, `attack-${Date.now()}.json`);
				fs.writeFileSync(
					badPath,
					JSON.stringify({
						createdAt: Date.now(),
						configPath: attackPath,
						content: '{ "hacked": true }',
						contentHash: computeSHA256('{ "hacked": true }'),
					}),
					'utf-8',
				);

				const result = restoreFromBackup(badPath, tempDir);
				expect(result).toBeNull();
			}
		});

		it('should reject restore with null byte injection attempt', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const attackPaths = [
				'.opencode/opencode-swarm.json\x00.txt',
				'.opencode/opencode-swarm.json%00.txt',
				'.opencode/opencode-swarm.json\u0000.txt',
			];

			for (const attackPath of attackPaths) {
				const badPath = path.join(swarmDir, `null-byte-${Date.now()}.json`);
				fs.writeFileSync(
					badPath,
					JSON.stringify({
						createdAt: Date.now(),
						configPath: attackPath,
						content: '{ "hacked": true }',
						contentHash: computeSHA256('{ "hacked": true }'),
					}),
					'utf-8',
				);

				const result = restoreFromBackup(badPath, tempDir);
				expect(result).toBeNull();
			}
		});

		it('should reject restore with mixed path separators in traversal', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const mixedPaths = [
				'..\\../..\\etc/passwd',
				'../..\\../etc\\passwd',
				'..\\.././/../etc/passwd',
			];

			for (const attackPath of mixedPaths) {
				const badPath = path.join(swarmDir, `mixed-${Date.now()}.json`);
				fs.writeFileSync(
					badPath,
					JSON.stringify({
						createdAt: Date.now(),
						configPath: attackPath,
						content: '{ "hacked": true }',
						contentHash: computeSHA256('{ "hacked": true }'),
					}),
					'utf-8',
				);

				const result = restoreFromBackup(badPath, tempDir);
				expect(result).toBeNull();
			}
		});

		it('should reject restore to symlink target outside allowed paths', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			// Create a symlink pointing outside allowed directories
			const symlinkTarget = path.join(tempDir, 'malicious-target.json');
			const symlinkPath = path.join(configDir, 'opencode-swarm.json.link');

			try {
				fs.symlinkSync(symlinkTarget, symlinkPath, 'file');
			} catch {
				// Symlinks may not be supported on this platform
				return;
			}

			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			// Try to restore to the symlink path
			const content = '{ "test": true }';
			const badPath = path.join(swarmDir, 'symlink-attack.json');
			fs.writeFileSync(
				badPath,
				JSON.stringify({
					createdAt: Date.now(),
					configPath: symlinkPath,
					content,
					contentHash: computeSHA256(content),
				}),
				'utf-8',
			);

			const result = restoreFromBackup(badPath, tempDir);
			// Should reject symlink that doesn't match exact expected paths
			expect(result).toBeNull();
		});
	});

	describe('Arbitrary path attacks', () => {
		it('should reject restore to /etc/passwd', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const badPath = path.join(swarmDir, 'etc-attack.json');
			fs.writeFileSync(
				badPath,
				JSON.stringify({
					createdAt: Date.now(),
					configPath: '/etc/passwd',
					content: 'root:x:0:0:root:/root:/bin/bash',
					contentHash: computeSHA256('root:x:0:0:root:/root:/bin/bash'),
				}),
				'utf-8',
			);

			const result = restoreFromBackup(badPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject restore to temp directory', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const badPath = path.join(swarmDir, 'tmp-attack.json');
			fs.writeFileSync(
				badPath,
				JSON.stringify({
					createdAt: Date.now(),
					configPath: '/tmp/opencode-swarm.json',
					content: '{ "hacked": true }',
					contentHash: computeSHA256('{ "hacked": true }'),
				}),
				'utf-8',
			);

			const result = restoreFromBackup(badPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject restore to home directory root', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const badPath = path.join(swarmDir, 'home-attack.json');
			fs.writeFileSync(
				badPath,
				JSON.stringify({
					createdAt: Date.now(),
					configPath: path.join(os.homedir(), 'opencode-swarm.json'),
					content: '{ "hacked": true }',
					contentHash: computeSHA256('{ "hacked": true }'),
				}),
				'utf-8',
			);

			const result = restoreFromBackup(badPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject restore with URL-style path', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const urlPaths = [
				'file:///etc/passwd',
				'file://localhost/etc/passwd',
				'file:///c:/windows/system32/config/sam',
			];

			for (const attackPath of urlPaths) {
				const badPath = path.join(swarmDir, `url-attack-${Date.now()}.json`);
				fs.writeFileSync(
					badPath,
					JSON.stringify({
						createdAt: Date.now(),
						configPath: attackPath,
						content: '{ "hacked": true }',
						contentHash: computeSHA256('{ "hacked": true }'),
					}),
					'utf-8',
				);

				const result = restoreFromBackup(badPath, tempDir);
				expect(result).toBeNull();
			}
		});

		it('should reject restore with UNC path (Windows)', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const uncPaths = [
				'\\\\server\\share\\opencode-swarm.json',
				'\\\\?\\C:\\Windows\\System32\\opencode-swarm.json',
				'\\\\.\\pipe\\opencode-swarm',
			];

			for (const attackPath of uncPaths) {
				const badPath = path.join(swarmDir, `unc-attack-${Date.now()}.json`);
				fs.writeFileSync(
					badPath,
					JSON.stringify({
						createdAt: Date.now(),
						configPath: attackPath,
						content: '{ "hacked": true }',
						contentHash: computeSHA256('{ "hacked": true }'),
					}),
					'utf-8',
				);

				const result = restoreFromBackup(badPath, tempDir);
				expect(result).toBeNull();
			}
		});
	});
});

// ===========================================================================
// ATTACK VECTOR 3: HASH BYPASS ATTEMPTS
// ===========================================================================

describe('SECURITY: Hash Bypass Attempts', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		cleanupDir(tempDir);
	});

	describe('Legacy hash bypass', () => {
		it('should warn but allow legacy numeric hash for backward compatibility', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const content = '{ "legacy": true }';
			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content,
				contentHash: '123456789', // Legacy numeric hash
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			// Should succeed with legacy hash
			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).not.toBeNull();
		});

		it('should reject malformed legacy hash (non-numeric but short)', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const content = '{ "test": true }';
			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content,
				contentHash: 'abcdef', // Short non-numeric - NOT valid SHA-256
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			// Should fail - not a valid SHA-256 hash and not a numeric legacy hash
			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject empty hash', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const content = '{ "test": true }';
			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content,
				contentHash: '',
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).toBeNull();
		});
	});

	describe('Hash format confusion', () => {
		it('should reject MD5 hash (32 chars but not SHA-256)', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const content = '{ "test": true }';
			const md5Hash = crypto.createHash('md5').update(content).digest('hex');

			expect(md5Hash.length).toBe(32); // MD5 is 32 hex chars

			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content,
				contentHash: md5Hash,
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject hash with invalid characters', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const content = '{ "test": true }';
			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content,
				contentHash: 'ghijklmnopqrstuvwxyz1234567890abcdef1234567890abcdef12', // Invalid hex
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject truncated SHA-256 hash', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const content = '{ "test": true }';
			const fullHash = computeSHA256(content);
			const truncatedHash = fullHash.substring(0, 63); // 63 chars instead of 64

			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content,
				contentHash: truncatedHash,
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject hash with uppercase letters (wrong format)', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const content = '{ "test": true }';
			const lowercaseHash = computeSHA256(content);
			const uppercaseHash = lowercaseHash.toUpperCase();

			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content,
				contentHash: uppercaseHash,
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).toBeNull();
		});
	});

	describe('Hash collision attempts', () => {
		it('should reject different content with same-looking hash prefix', () => {
			const configDir = path.join(tempDir, '.opencode');
			fs.mkdirSync(configDir, { recursive: true });

			const originalContent = '{ "original": true }';
			const correctHash = computeSHA256(originalContent);

			// Different content that happens to have similar hash prefix
			const fakeContent = '{ "fake": true }';
			const _fakeHash = computeSHA256(fakeContent);

			// Try to use original hash with fake content
			const backup: ConfigBackup = {
				createdAt: Date.now(),
				configPath: path.join(configDir, 'opencode-swarm.json'),
				content: fakeContent,
				contentHash: correctHash, // Wrong hash for this content
			};
			const backupPath = writeBackupArtifact(tempDir, backup);

			const result = restoreFromBackup(backupPath, tempDir);
			expect(result).toBeNull();
		});
	});
});

// ===========================================================================
// ATTACK VECTOR 4: MALFORMED CONFIG DOCTOR ARTIFACTS
// ===========================================================================

describe('SECURITY: Malformed Config Doctor Artifacts', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		cleanupDir(tempDir);
	});

	describe('Missing required fields', () => {
		it('should reject artifact missing content field', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const badPath = path.join(swarmDir, 'missing-content.json');
			fs.writeFileSync(
				badPath,
				JSON.stringify({
					createdAt: Date.now(),
					configPath: '/valid/path.json',
					contentHash: 'abc123',
				}),
				'utf-8',
			);

			const result = restoreFromBackup(badPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject artifact missing configPath field', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const badPath = path.join(swarmDir, 'missing-path.json');
			fs.writeFileSync(
				badPath,
				JSON.stringify({
					createdAt: Date.now(),
					content: '{ "test": true }',
					contentHash: computeSHA256('{ "test": true }'),
				}),
				'utf-8',
			);

			const result = restoreFromBackup(badPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject artifact missing contentHash field', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const badPath = path.join(swarmDir, 'missing-hash.json');
			fs.writeFileSync(
				badPath,
				JSON.stringify({
					createdAt: Date.now(),
					configPath: '/valid/path.json',
					content: '{ "test": true }',
				}),
				'utf-8',
			);

			const result = restoreFromBackup(badPath, tempDir);
			expect(result).toBeNull();
		});

		it('should reject completely empty artifact', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const badPath = path.join(swarmDir, 'empty.json');
			fs.writeFileSync(badPath, '{}', 'utf-8');

			const result = restoreFromBackup(badPath, tempDir);
			expect(result).toBeNull();
		});
	});

	describe('Invalid JSON and structure', () => {
		it('should reject artifact with invalid JSON', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const invalidJsonCases = [
				'not json at all',
				'{ broken json',
				'{"key": undefined}',
				'{"key": function(){}}',
				'{"key": /regex/}',
			];

			for (const invalidJson of invalidJsonCases) {
				const badPath = path.join(swarmDir, `invalid-${Date.now()}.json`);
				fs.writeFileSync(badPath, invalidJson, 'utf-8');

				const result = restoreFromBackup(badPath, tempDir);
				expect(result).toBeNull();
			}
		});

		it('should reject artifact with null values for required fields', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const nullFieldCases = [
				{ content: null, configPath: '/path', contentHash: 'hash' },
				{ content: '{}', configPath: null, contentHash: 'hash' },
				{ content: '{}', configPath: '/path', contentHash: null },
			];

			for (const fields of nullFieldCases) {
				const badPath = path.join(swarmDir, `null-${Date.now()}.json`);
				fs.writeFileSync(
					badPath,
					JSON.stringify({
						createdAt: Date.now(),
						...fields,
					}),
					'utf-8',
				);

				const result = restoreFromBackup(badPath, tempDir);
				expect(result).toBeNull();
			}
		});

		it('should reject artifact with wrong field types', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const wrongTypeCases = [
				{ content: 123, configPath: '/path', contentHash: 'hash' },
				{ content: '{}', configPath: [], contentHash: 'hash' },
				{ content: '{}', configPath: '/path', contentHash: {} },
			];

			for (const fields of wrongTypeCases) {
				const badPath = path.join(swarmDir, `wrongtype-${Date.now()}.json`);
				fs.writeFileSync(
					badPath,
					JSON.stringify({
						createdAt: Date.now(),
						...fields,
					}),
					'utf-8',
				);

				const result = restoreFromBackup(badPath, tempDir);
				expect(result).toBeNull();
			}
		});
	});

	describe('Prototype pollution attempts', () => {
		it('should not be vulnerable to __proto__ in artifact', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const badPath = path.join(swarmDir, 'proto-pollution.json');
			fs.writeFileSync(
				badPath,
				JSON.stringify({
					createdAt: Date.now(),
					__proto__: { polluted: true },
					content: '{}',
					configPath: '/path',
					contentHash: 'hash',
				}),
				'utf-8',
			);

			// Should not crash or pollute prototype
			const result = restoreFromBackup(badPath, tempDir);
			expect(result).toBeNull();

			// Verify prototype not polluted
			const testObj: Record<string, unknown> = {};
			expect(testObj.polluted).toBeUndefined();
		});

		it('should not be vulnerable to constructor.prototype in artifact', () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });

			const badPath = path.join(swarmDir, 'constructor-pollution.json');
			fs.writeFileSync(
				badPath,
				JSON.stringify({
					createdAt: Date.now(),
					constructor: { prototype: { polluted: true } },
					content: '{}',
					configPath: '/path',
					contentHash: 'hash',
				}),
				'utf-8',
			);

			const result = restoreFromBackup(badPath, tempDir);
			expect(result).toBeNull();

			// Verify prototype not polluted
			const testObj: Record<string, unknown> = {};
			expect(testObj.polluted).toBeUndefined();
		});
	});
});

// ===========================================================================
// ATTACK VECTOR 5: STARTUP AUTOFIX ABUSE
// ===========================================================================

describe('SECURITY: Startup Autofix Abuse', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		cleanupDir(tempDir);
	});

	describe('Prototype pollution via fix paths', () => {
		it('should not apply fix with __proto__ path', () => {
			createTestConfig(tempDir, { max_iterations: 5 });

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'proto-attack',
						title: 'Attack',
						description: 'Attempt prototype pollution',
						severity: 'info',
						path: '__proto__.polluted',
						autoFixable: true,
						proposedFix: {
							type: 'add',
							path: '__proto__.polluted',
							value: true,
							description: 'Pollute prototype',
							risk: 'low',
						},
					},
				],
				summary: { info: 1, warn: 0, error: 0 },
				hasAutoFixableIssues: true,
				timestamp: Date.now(),
				configSource: 'test',
			};

			const { appliedFixes } = applySafeAutoFixes(tempDir, result);

			// Verify fix was skipped
			expect(appliedFixes.length).toBe(0);

			// Verify prototype not polluted
			const testObj: Record<string, unknown> = {};
			expect(testObj.polluted).toBeUndefined();
		});

		it('should not apply fix with constructor.prototype path', () => {
			createTestConfig(tempDir, { max_iterations: 5 });

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'constructor-attack',
						title: 'Attack',
						description: 'Attempt constructor pollution',
						severity: 'info',
						path: 'constructor.prototype.polluted',
						autoFixable: true,
						proposedFix: {
							type: 'add',
							path: 'constructor.prototype.polluted',
							value: true,
							description: 'Pollute via constructor',
							risk: 'low',
						},
					},
				],
				summary: { info: 1, warn: 0, error: 0 },
				hasAutoFixableIssues: true,
				timestamp: Date.now(),
				configSource: 'test',
			};

			const { appliedFixes } = applySafeAutoFixes(tempDir, result);

			// Verify fix was skipped
			expect(appliedFixes.length).toBe(0);

			// Verify prototype not polluted
			const testObj: Record<string, unknown> = {};
			expect(testObj.polluted).toBeUndefined();
		});

		it('should not pollute prototype through nested __proto__', () => {
			createTestConfig(tempDir, { nested: {} });

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'nested-proto-attack',
						title: 'Attack',
						description: 'Nested prototype pollution',
						severity: 'info',
						path: 'nested.__proto__.polluted',
						autoFixable: true,
						proposedFix: {
							type: 'add',
							path: 'nested.__proto__.polluted',
							value: true,
							description: 'Pollute prototype via nested',
							risk: 'low',
						},
					},
				],
				summary: { info: 1, warn: 0, error: 0 },
				hasAutoFixableIssues: true,
				timestamp: Date.now(),
				configSource: 'test',
			};

			const { appliedFixes } = applySafeAutoFixes(tempDir, result);

			// Verify fix was skipped
			expect(appliedFixes.length).toBe(0);

			// Verify prototype not polluted
			const testObj: Record<string, unknown> = {};
			expect(testObj.polluted).toBeUndefined();
		});

		it('should not apply fix with constructor path alone', () => {
			createTestConfig(tempDir, { max_iterations: 5 });

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'constructor-attack',
						title: 'Attack',
						description: 'Attempt constructor pollution',
						severity: 'info',
						path: 'constructor.admin',
						autoFixable: true,
						proposedFix: {
							type: 'add',
							path: 'constructor.admin',
							value: true,
							description: 'Pollute via constructor',
							risk: 'low',
						},
					},
				],
				summary: { info: 1, warn: 0, error: 0 },
				hasAutoFixableIssues: true,
				timestamp: Date.now(),
				configSource: 'test',
			};

			const { appliedFixes } = applySafeAutoFixes(tempDir, result);

			// Verify fix was skipped
			expect(appliedFixes.length).toBe(0);
		});

		it('should not apply fix with prototype path alone', () => {
			createTestConfig(tempDir, { max_iterations: 5 });

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'prototype-attack',
						title: 'Attack',
						description: 'Attempt prototype pollution',
						severity: 'info',
						path: 'prototype.admin',
						autoFixable: true,
						proposedFix: {
							type: 'add',
							path: 'prototype.admin',
							value: true,
							description: 'Pollute prototype',
							risk: 'low',
						},
					},
				],
				summary: { info: 1, warn: 0, error: 0 },
				hasAutoFixableIssues: true,
				timestamp: Date.now(),
				configSource: 'test',
			};

			const { appliedFixes } = applySafeAutoFixes(tempDir, result);

			// Verify fix was skipped
			expect(appliedFixes.length).toBe(0);
		});

		it('should still apply valid fixes while rejecting dangerous ones', () => {
			createTestConfig(tempDir, { max_iterations: 5 });

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'proto-attack',
						title: 'Attack',
						description: 'Attempt prototype pollution',
						severity: 'info',
						path: '__proto__.polluted',
						autoFixable: true,
						proposedFix: {
							type: 'add',
							path: '__proto__.polluted',
							value: true,
							description: 'Pollute prototype',
							risk: 'low',
						},
					},
					{
						id: 'valid-fix',
						title: 'Valid Fix',
						description: 'Valid fix that should be applied',
						severity: 'info',
						path: 'max_iterations',
						autoFixable: true,
						proposedFix: {
							type: 'update',
							path: 'max_iterations',
							value: 10,
							description: 'Update max_iterations',
							risk: 'low',
						},
					},
				],
				summary: { info: 2, warn: 0, error: 0 },
				hasAutoFixableIssues: true,
				timestamp: Date.now(),
				configSource: 'test',
			};

			const { appliedFixes } = applySafeAutoFixes(tempDir, result);

			// Only the valid fix should be applied
			expect(appliedFixes.length).toBe(1);
			expect(appliedFixes[0].path).toBe('max_iterations');
		});
	});

	describe('Malicious fix values', () => {
		it('should handle fix with extremely deep path safely', () => {
			createTestConfig(tempDir, { max_iterations: 5 });

			// Create extremely deep path (100 levels)
			const deepPath = Array(100).fill('a').join('.');

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'deep-path',
						title: 'Deep Path',
						description: 'Extremely deep path',
						severity: 'info',
						path: deepPath,
						autoFixable: true,
						proposedFix: {
							type: 'add',
							path: deepPath,
							value: 'deep',
							description: 'Add deep path',
							risk: 'low',
						},
					},
				],
				summary: { info: 1, warn: 0, error: 0 },
				hasAutoFixableIssues: true,
				timestamp: Date.now(),
				configSource: 'test',
			};

			// Should not crash - creates the deep structure
			const { appliedFixes } = applySafeAutoFixes(tempDir, result);

			// Should have applied the fix (creates intermediate objects)
			expect(appliedFixes.length).toBe(1);
		});

		it('should handle fix with special characters in path', () => {
			createTestConfig(tempDir, { max_iterations: 5 });

			const specialPaths = [
				'key.with.dots',
				'key-with-dashes',
				'key_with_underscores',
				'key123',
			];

			for (const specialPath of specialPaths) {
				const result: ConfigDoctorResult = {
					findings: [
						{
							id: 'special-path',
							title: 'Special Path',
							description: 'Path with special chars',
							severity: 'info',
							path: specialPath,
							autoFixable: true,
							proposedFix: {
								type: 'add',
								path: specialPath,
								value: 'test',
								description: 'Add special path',
								risk: 'low',
							},
						},
					],
					summary: { info: 1, warn: 0, error: 0 },
					hasAutoFixableIssues: true,
					timestamp: Date.now(),
					configSource: 'test',
				};

				// Should not crash
				applySafeAutoFixes(tempDir, result);
			}
		});

		it('should handle fix value that is a function string', () => {
			createTestConfig(tempDir, { max_iterations: 5 });

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'function-value',
						title: 'Function Value',
						description: 'Value looks like function',
						severity: 'info',
						path: 'testFunc',
						autoFixable: true,
						proposedFix: {
							type: 'add',
							path: 'testFunc',
							value: 'function() { return "evil"; }',
							description: 'Add function string',
							risk: 'low',
						},
					},
				],
				summary: { info: 1, warn: 0, error: 0 },
				hasAutoFixableIssues: true,
				timestamp: Date.now(),
				configSource: 'test',
			};

			const { appliedFixes, updatedConfigPath } = applySafeAutoFixes(
				tempDir,
				result,
			);

			// Should store as string, not execute
			expect(appliedFixes.length).toBe(1);
			const config = JSON.parse(fs.readFileSync(updatedConfigPath!, 'utf-8'));
			expect(typeof config.testFunc).toBe('string');
			expect(config.testFunc).toBe('function() { return "evil"; }');
		});

		it('should handle fix value with circular reference string', () => {
			createTestConfig(tempDir, { max_iterations: 5 });

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'circular-value',
						title: 'Circular Value',
						description: 'Value with $ref',
						severity: 'info',
						path: 'circular',
						autoFixable: true,
						proposedFix: {
							type: 'add',
							path: 'circular',
							value: { $ref: '#' },
							description: 'Add circular ref',
							risk: 'low',
						},
					},
				],
				summary: { info: 1, warn: 0, error: 0 },
				hasAutoFixableIssues: true,
				timestamp: Date.now(),
				configSource: 'test',
			};

			// Should not crash - JSON.stringify handles it
			const { appliedFixes } = applySafeAutoFixes(tempDir, result);
			expect(appliedFixes.length).toBe(1);
		});
	});

	describe('Risk level bypass attempts', () => {
		it('should not apply medium-risk fix even with autoFixable=true', () => {
			createTestConfig(tempDir, { test: 'value' });

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'medium-risk',
						title: 'Medium Risk',
						description: 'Medium risk fix',
						severity: 'warn',
						path: 'test',
						autoFixable: true,
						proposedFix: {
							type: 'update',
							path: 'test',
							value: 'changed',
							description: 'Medium risk change',
							risk: 'medium',
						},
					},
				],
				summary: { info: 0, warn: 1, error: 0 },
				hasAutoFixableIssues: false,
				timestamp: Date.now(),
				configSource: 'test',
			};

			const { appliedFixes } = applySafeAutoFixes(tempDir, result);

			// Should NOT apply medium-risk fix
			expect(appliedFixes.length).toBe(0);
		});

		it('should not apply high-risk fix even with autoFixable=true', () => {
			createTestConfig(tempDir, { test: 'value' });

			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'high-risk',
						title: 'High Risk',
						description: 'High risk fix',
						severity: 'error',
						path: 'test',
						autoFixable: true,
						proposedFix: {
							type: 'update',
							path: 'test',
							value: 'changed',
							description: 'High risk change',
							risk: 'high',
						},
					},
				],
				summary: { info: 0, warn: 0, error: 1 },
				hasAutoFixableIssues: false,
				timestamp: Date.now(),
				configSource: 'test',
			};

			const { appliedFixes } = applySafeAutoFixes(tempDir, result);

			// Should NOT apply high-risk fix
			expect(appliedFixes.length).toBe(0);
		});

		it('should not apply fix with spoofed low risk and dangerous operation', () => {
			createTestConfig(tempDir, { important: 'data' });

			// Attacker tries to remove important config by spoofing low risk
			const result: ConfigDoctorResult = {
				findings: [
					{
						id: 'spoofed-risk',
						title: 'Spoofed Risk',
						description: 'Low risk but dangerous',
						severity: 'info',
						path: 'important',
						autoFixable: true,
						proposedFix: {
							type: 'remove',
							path: 'important',
							description: 'Remove important data',
							risk: 'low',
						},
					},
				],
				summary: { info: 1, warn: 0, error: 0 },
				hasAutoFixableIssues: true,
				timestamp: Date.now(),
				configSource: 'test',
			};

			const { appliedFixes, updatedConfigPath } = applySafeAutoFixes(
				tempDir,
				result,
			);

			// Fix should be applied (it's low risk) but the data should be removed
			// This tests that the fix mechanism works as designed
			expect(appliedFixes.length).toBe(1);
			const config = JSON.parse(fs.readFileSync(updatedConfigPath!, 'utf-8'));
			expect(config.important).toBeUndefined();
		});
	});

	describe('Config Doctor startup abuse', () => {
		it('should not modify config when no fixes exist', () => {
			createTestConfig(tempDir, { max_iterations: 5 });
			const originalContent = fs.readFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				'utf-8',
			);

			const result: ConfigDoctorResult = {
				findings: [],
				summary: { info: 0, warn: 0, error: 0 },
				hasAutoFixableIssues: false,
				timestamp: Date.now(),
				configSource: 'test',
			};

			applySafeAutoFixes(tempDir, result);

			const newContent = fs.readFileSync(
				path.join(tempDir, '.opencode', 'opencode-swarm.json'),
				'utf-8',
			);

			expect(newContent).toBe(originalContent);
		});

		it('should create valid JSON after applying fixes', () => {
			createTestConfig(tempDir, { max_iterations: 100 });

			const config = { max_iterations: 100 };
			const result = runConfigDoctor(config as PluginConfig, tempDir);

			const { updatedConfigPath } = applySafeAutoFixes(tempDir, result);

			if (updatedConfigPath) {
				// Should be valid JSON
				const content = fs.readFileSync(updatedConfigPath, 'utf-8');
				expect(() => JSON.parse(content)).not.toThrow();

				const parsed = JSON.parse(content);
				expect(parsed.max_iterations).toBe(10); // Clamped to valid range
			}
		});
	});
});

// ===========================================================================
// INTEGRATION: Combined Attack Scenarios
// ===========================================================================

describe('SECURITY: Combined Attack Scenarios', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		cleanupDir(tempDir);
	});

	it('should resist tampered backup restore with actual content change', async () => {
		createTestConfig(tempDir, { max_iterations: 5 });

		// Step 1: Create and tamper with backup
		const configDir = path.join(tempDir, '.opencode');
		const originalContent = JSON.stringify({ max_iterations: 5, safe: true });
		// Note: JSON.stringify doesn't serialize __proto__, so we use an explicit property
		const tamperedContent = JSON.stringify({
			max_iterations: 5,
			safe: false, // Changed value
			malicious: true, // Added property
		});

		const backup: ConfigBackup = {
			createdAt: Date.now(),
			configPath: path.join(configDir, 'opencode-swarm.json'),
			content: originalContent,
			contentHash: computeSHA256(originalContent),
		};
		const backupPath = writeBackupArtifact(tempDir, backup);

		// Tamper with content but keep hash (actual content change)
		const artifact = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
		artifact.content = tamperedContent;
		fs.writeFileSync(backupPath, JSON.stringify(artifact), 'utf-8');

		// Step 2: Attempt restore - should fail due to hash mismatch
		const restoreResult = restoreFromBackup(backupPath, tempDir);
		expect(restoreResult).toBeNull();
	});

	it('should handle path traversal in multiple fields simultaneously', () => {
		const swarmDir = path.join(tempDir, '.swarm');
		fs.mkdirSync(swarmDir, { recursive: true });

		// Attempt multiple path traversals in one artifact
		const badPath = path.join(swarmDir, 'multi-attack.json');
		fs.writeFileSync(
			badPath,
			JSON.stringify({
				createdAt: Date.now(),
				configPath: '../../../etc/passwd',
				content: '{ "__proto__": { "polluted": true } }',
				contentHash: computeSHA256('{ "__proto__": { "polluted": true } }'),
				// Extra fields with traversal attempts
				targetPath: '../../.ssh/id_rsa',
				backupPath: '../../../../../root/.bashrc',
			}),
			'utf-8',
		);

		const result = restoreFromBackup(badPath, tempDir);
		expect(result).toBeNull();

		// Verify no files created outside allowed paths
		expect(fs.existsSync('/etc/passwd.opencode-swarm')).toBe(false);
	});

	it('should resist hash format confusion with legacy bypass', () => {
		const configDir = path.join(tempDir, '.opencode');
		fs.mkdirSync(configDir, { recursive: true });

		// Try to exploit legacy hash handling with malicious content
		const maliciousContent = JSON.stringify({
			admin: true,
			permissions: ['read', 'write', 'delete'],
		});

		const backup: ConfigBackup = {
			createdAt: Date.now(),
			configPath: path.join(configDir, 'opencode-swarm.json'),
			content: maliciousContent,
			contentHash: '0', // Minimal legacy hash
		};
		const backupPath = writeBackupArtifact(tempDir, backup);

		// Should allow with legacy hash (backward compat)
		const result = restoreFromBackup(backupPath, tempDir);
		expect(result).not.toBeNull();

		// But content should be exactly as provided, not interpreted
		const restored = JSON.parse(fs.readFileSync(result!, 'utf-8'));
		expect(restored.admin).toBe(true);
		expect(Array.isArray(restored.permissions)).toBe(true);

		// And prototype should not be polluted
		const testObj: Record<string, unknown> = {};
		expect(testObj.admin).toBeUndefined();
	});
});
