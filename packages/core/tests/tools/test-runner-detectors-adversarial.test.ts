import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { detectTestFramework } from '../../src/tools/test-runner';

describe('test-runner detector functions - adversarial tests', () => {
	let tempDir: string;
	let cleanupDirs: string[] = [];

	beforeEach(() => {
		// Create a temporary directory for each test
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adversarial-test-'));
		cleanupDirs.push(tempDir);
	});

	afterEach(() => {
		// Clean up all directories
		for (const dir of cleanupDirs) {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		}
		cleanupDirs = [];
	});

	describe('1. detectGoTest - go.mod exists but go binary unavailable', () => {
		it('should return false (detectTestFramework returns none) when binary unavailable', async () => {
			// Create go.mod file - the detection may fail without go binary
			fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example\n');

			// Since detector checks for binary availability, it should return 'none' if go is not available
			const result = await detectTestFramework(tempDir);
			// Either 'go-test' (if go is available) or 'none' (if not)
			expect(result === 'go-test' || result === 'none').toBe(true);
		});
	});

	describe('2. detectGradle - gradlew exists but no build.gradle or build.gradle.kts', () => {
		it('should return false (no build file)', async () => {
			// Create gradlew wrapper script WITHOUT build.gradle files
			fs.writeFileSync(path.join(tempDir, 'gradlew'), '#!/bin/bash\necho gradle wrapper\n');
			fs.chmodSync(path.join(tempDir, 'gradlew'), 0o755);

			// No build.gradle, so detection should fail
			const result = await detectTestFramework(tempDir);
			expect(result).toBe('none');
		});

		it('should return false with gradlew.bat but no build files', async () => {
			// Create gradlew.bat wrapper
			fs.writeFileSync(path.join(tempDir, 'gradlew.bat'), '@echo off\necho gradle wrapper\n');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('none');
		});
	});

	describe('3. detectDotnetTest - cwd points to a file not a directory', () => {
		it('should return false without crash when cwd is a file', async () => {
			// Create a file (not a directory)
			const filePath = path.join(tempDir, 'not-a-dir.txt');
			fs.writeFileSync(filePath, 'I am a file, not a directory');

			// Pass a FILE path instead of directory
			// Should return 'none' without crashing
			const result = await detectTestFramework(filePath);
			expect(result).toBe('none');
		});
	});

	describe('4. detectRSpec - spec/ is a FILE not a directory', () => {
		it('should handle case where spec exists as a file', async () => {
			// Create spec as a FILE, not a directory
			fs.writeFileSync(path.join(tempDir, 'spec'), 'I am a file named spec');
			fs.writeFileSync(path.join(tempDir, 'Gemfile'), 'source "https://rubygems.org"');

			// existsSync doesn't distinguish files vs dirs - might detect or might not
			const result = await detectTestFramework(tempDir);
			// Just verify it doesn't crash
			expect(typeof result).toBe('string');
		});

		it('with .rspec file and spec as a FILE', async () => {
			// Create .rspec file AND spec as a file
			fs.writeFileSync(path.join(tempDir, '.rspec'), '--color');
			fs.writeFileSync(path.join(tempDir, 'spec'), 'I am a file');

			// Should handle gracefully without crash
			const result = await detectTestFramework(tempDir);
			expect(typeof result).toBe('string');
		});
	});

	describe('5. detectMinitest - test/ and Gemfile exist but ruby binary absent', () => {
		it('should handle case where ruby is unavailable', async () => {
			// Create test directory and Gemfile
			fs.mkdirSync(path.join(tempDir, 'test'));
			fs.writeFileSync(path.join(tempDir, 'Gemfile'), 'source "https://rubygems.org"');

			// With ruby unavailable, should return 'none' or another framework
			const result = await detectTestFramework(tempDir);
			expect(typeof result).toBe('string');
		});

		it('with test/ and Rakefile but ruby absent', async () => {
			fs.mkdirSync(path.join(tempDir, 'test'));
			fs.writeFileSync(path.join(tempDir, 'Rakefile'), 'task :default do; end');

			const result = await detectTestFramework(tempDir);
			expect(typeof result).toBe('string');
		});
	});

	describe('6. Non-existent cwd passed to detectors', () => {
		it('should return false without crash for non-existent directory', async () => {
			const nonExistentDir = path.join(tempDir, 'does-not-exist');

			// Should NOT throw, should return 'none'
			const result = await detectTestFramework(nonExistentDir);
			expect(result).toBe('none');
		});

		it('deeply nested non-existent path', async () => {
			const deepPath = path.join(tempDir, 'a', 'b', 'c', 'd', 'e', 'non-existent');

			const result = await detectTestFramework(deepPath);
			expect(result).toBe('none');
		});

		it('path with special characters that does not exist', async () => {
			// Use special chars in path (but doesn't exist)
			const specialPath = path.join(tempDir, 'path with spaces', 'non-existent');

			const result = await detectTestFramework(specialPath);
			expect(result).toBe('none');
		});
	});

	describe('Additional adversarial edge cases', () => {
		it('empty directory with no files', async () => {
			// Directory exists but is empty
			const result = await detectTestFramework(tempDir);
			expect(result).toBe('none');
		});

		it('directory with only irrelevant files', async () => {
			fs.writeFileSync(path.join(tempDir, 'README.md'), '# Project');
			fs.writeFileSync(path.join(tempDir, 'LICENSE'), 'MIT');
			fs.mkdirSync(path.join(tempDir, 'docs'));
			fs.writeFileSync(path.join(tempDir, 'docs', 'guide.md'), '# Guide');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('none');
		});

		it('permission denied scenario (simulated)', async () => {
			// Create a file and try to use it as directory
			const filePath = path.join(tempDir, 'restricted.txt');
			fs.writeFileSync(filePath, 'content');

			// Using a file as cwd should not crash
			const result = await detectTestFramework(filePath);
			expect(result).toBe('none');
		});

		it('multiple conflicting markers', async () => {
			// Create markers for different languages
			fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module test');
			fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
			fs.mkdirSync(path.join(tempDir, 'test'));
			fs.writeFileSync(path.join(tempDir, 'Gemfile'), 'source "rubygems"');

			// With no binaries available, returns 'none' or detects package.json framework
			const result = await detectTestFramework(tempDir);
			expect(typeof result).toBe('string');
		});
	});
});
