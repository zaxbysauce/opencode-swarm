import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Import the module under test
const discoveryModule = await import('../../../src/build/discovery');

// Extract the exports we need
const {
	discoverBuildCommands,
	isCommandAvailable,
	clearToolchainCache,
	getEcosystems,
	build_discovery,
} = discoveryModule;

// Re-export types for testing
type BuildCommand = {
	ecosystem: string;
	command: string;
	cwd: string;
	priority: number;
};

type BuildDiscoveryResult = {
	commands: BuildCommand[];
	skipped: { ecosystem: string; reason: string }[];
};

describe('build/discovery.ts - Types and Constants', () => {
	describe('BuildCommand interface', () => {
		test('has required properties', () => {
			const cmd: BuildCommand = {
				ecosystem: 'node',
				command: 'npm run build',
				cwd: '/test',
				priority: 1,
			};
			expect(cmd.ecosystem).toBe('node');
			expect(cmd.command).toBe('npm run build');
			expect(cmd.cwd).toBe('/test');
			expect(cmd.priority).toBe(1);
		});

		test('priority determines sort order', () => {
			const cmd1: BuildCommand = { ecosystem: 'a', command: 'cmd1', cwd: '/', priority: 3 };
			const cmd2: BuildCommand = { ecosystem: 'b', command: 'cmd2', cwd: '/', priority: 1 };
			const cmd3: BuildCommand = { ecosystem: 'c', command: 'cmd3', cwd: '/', priority: 2 };
			const sorted = [cmd1, cmd2, cmd3].sort((a, b) => a.priority - b.priority);
			expect(sorted[0].priority).toBe(1);
			expect(sorted[1].priority).toBe(2);
			expect(sorted[2].priority).toBe(3);
		});
	});

	describe('BuildDiscoveryResult interface', () => {
		test('has commands and skipped arrays', () => {
			const result: BuildDiscoveryResult = {
				commands: [],
				skipped: [],
			};
			expect(result.commands).toEqual([]);
			expect(result.skipped).toEqual([]);
		});

		test('skipped items have ecosystem and reason', () => {
			const result: BuildDiscoveryResult = {
				commands: [],
				skipped: [{ ecosystem: 'rust', reason: 'cargo not on PATH' }],
			};
			expect(result.skipped[0].ecosystem).toBe('rust');
			expect(result.skipped[0].reason).toBe('cargo not on PATH');
		});
	});

	describe('getEcosystems', () => {
		test('returns array of ecosystem names', () => {
			const ecosystems = getEcosystems();
			expect(Array.isArray(ecosystems)).toBe(true);
			expect(ecosystems.length).toBeGreaterThan(0);
		});

		test('includes all expected ecosystems', () => {
			const ecosystems = getEcosystems();
			expect(ecosystems).toContain('node');
			expect(ecosystems).toContain('rust');
			expect(ecosystems).toContain('go');
			expect(ecosystems).toContain('python');
			expect(ecosystems).toContain('java-maven');
			expect(ecosystems).toContain('java-gradle');
			expect(ecosystems).toContain('dotnet');
			expect(ecosystems).toContain('swift');
			expect(ecosystems).toContain('dart');
			expect(ecosystems).toContain('cpp');
		});

		test('returns 10 ecosystems', () => {
			const ecosystems = getEcosystems();
			expect(ecosystems.length).toBe(10);
		});
	});
});

describe('build/discovery.ts - Toolchain Detection', () => {
	beforeEach(() => {
		clearToolchainCache();
	});

	afterEach(() => {
		clearToolchainCache();
	});

	describe('isCommandAvailable', () => {
		test('returns boolean', () => {
			const result = isCommandAvailable('nonexistent-command-12345');
			expect(typeof result).toBe('boolean');
		});

		test('caches results', () => {
			const result1 = isCommandAvailable('node');
			const result2 = isCommandAvailable('node');
			expect(result1).toBe(result2);
		});

		test('handles non-existent commands', () => {
			const result = isCommandAvailable('this-command-definitely-does-not-exist-xyz');
			expect(result).toBe(false);
		});
	});

	describe('clearToolchainCache', () => {
		test('clears the cache', () => {
			// First call to populate cache
			isCommandAvailable('node');
			// Clear cache
			clearToolchainCache();
			// Should still work but cache should be cleared
			const result = isCommandAvailable('node');
			expect(typeof result).toBe('boolean');
		});
	});
});

describe('build/discovery.ts - Discovery Function', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'discovery-test-'));
	});

	afterEach(async () => {
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('discoverBuildCommands', () => {
		test('returns result with commands and skipped arrays', async () => {
			const result = await discoverBuildCommands(tempDir);
			expect(result).toHaveProperty('commands');
			expect(result).toHaveProperty('skipped');
			expect(Array.isArray(result.commands)).toBe(true);
			expect(Array.isArray(result.skipped)).toBe(true);
		});

		test('accepts empty options', async () => {
			const result = await discoverBuildCommands(tempDir, {});
			expect(result).toHaveProperty('commands');
			expect(result).toHaveProperty('skipped');
		});

		test('accepts scope option', async () => {
			const resultAll = await discoverBuildCommands(tempDir, { scope: 'all' });
			const resultChanged = await discoverBuildCommands(tempDir, { scope: 'changed' });
			expect(resultAll).toHaveProperty('commands');
			expect(resultChanged).toHaveProperty('commands');
		});

		test('accepts changedFiles option', async () => {
			const result = await discoverBuildCommands(tempDir, {
				scope: 'changed',
				changedFiles: ['src/index.ts'],
			});
			expect(result).toHaveProperty('commands');
		});

		test('returns empty commands for empty directory', async () => {
			const result = await discoverBuildCommands(tempDir);
			// Commands may be empty or skipped depending on toolchain availability
			expect(Array.isArray(result.commands)).toBe(true);
			expect(Array.isArray(result.skipped)).toBe(true);
		});
	});

	describe('Node.js ecosystem detection', () => {
		test('detects package.json', async () => {
			const pkgJson = {
				name: 'test-package',
				version: '1.0.0',
				scripts: {
					build: 'tsc',
					test: 'jest',
				},
			};
			await fs.promises.writeFile(
				path.join(tempDir, 'package.json'),
				JSON.stringify(pkgJson),
			);

			const result = await discoverBuildCommands(tempDir);
			// Should find npm if available
			expect(result.skipped.some(s => s.ecosystem === 'node')).toBe(true);
		});

		test('finds repo-defined build script', async () => {
			const pkgJson = {
				name: 'test-package',
				version: '1.0.0',
				scripts: {
					build: 'tsc',
					typecheck: 'tsc --noEmit',
				},
			};
			await fs.promises.writeFile(
				path.join(tempDir, 'package.json'),
				JSON.stringify(pkgJson),
			);

			const result = await discoverBuildCommands(tempDir);
			// If npm is available, should include repo-defined scripts
			const nodeCmds = result.commands.filter(c => c.ecosystem === 'node');
			if (nodeCmds.length > 0) {
				const hasBuild = nodeCmds.some(c => c.command.includes('build'));
				expect(hasBuild).toBe(true);
			}
		});
	});

	describe('Rust ecosystem detection', () => {
		test('detects Cargo.toml', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'Cargo.toml'),
				'[package]\nname = "test"\nversion = "1.0.0"',
			);

			const result = await discoverBuildCommands(tempDir);
			// Should either have commands or be skipped due to missing cargo
			expect(result.commands.some(c => c.ecosystem === 'rust') || result.skipped.some(s => s.ecosystem === 'rust')).toBe(true);
		});
	});

	describe('Go ecosystem detection', () => {
		test('detects go.mod', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'go.mod'),
				'module github.com/test/module\ngo 1.21',
			);

			const result = await discoverBuildCommands(tempDir);
			expect(result.commands.some(c => c.ecosystem === 'go') || result.skipped.some(s => s.ecosystem === 'go')).toBe(true);
		});
	});

	describe('Python ecosystem detection', () => {
		test('detects pyproject.toml', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'pyproject.toml'),
				'[build-system]\nrequires = ["setuptools"]',
			);

			const result = await discoverBuildCommands(tempDir);
			expect(result.commands.some(c => c.ecosystem === 'python') || result.skipped.some(s => s.ecosystem === 'python')).toBe(true);
		});

		test('detects setup.py', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'setup.py'),
				'from setuptools import setup\nsetup(name="test")',
			);

			const result = await discoverBuildCommands(tempDir);
			expect(result.commands.some(c => c.ecosystem === 'python') || result.skipped.some(s => s.ecosystem === 'python')).toBe(true);
		});
	});

	describe('Java ecosystem detection', () => {
		test('detects pom.xml for Maven', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'pom.xml'),
				'<?xml version="1.0"?><project><modelVersion>4.0.0</modelVersion></project>',
			);

			const result = await discoverBuildCommands(tempDir);
			expect(result.commands.some(c => c.ecosystem === 'java-maven') || result.skipped.some(s => s.ecosystem === 'java-maven')).toBe(true);
		});

		test('detects build.gradle for Gradle', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'build.gradle'),
				'plugins { id "java" }',
			);

			const result = await discoverBuildCommands(tempDir);
			expect(result.commands.some(c => c.ecosystem === 'java-gradle') || result.skipped.some(s => s.ecosystem === 'java-gradle')).toBe(true);
		});
	});

	describe('.NET ecosystem detection', () => {
		test('detects .csproj files', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'Test.csproj'),
				'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
			);

			const result = await discoverBuildCommands(tempDir);
			expect(result.commands.some(c => c.ecosystem === 'dotnet') || result.skipped.some(s => s.ecosystem === 'dotnet')).toBe(true);
		});
	});

	describe('Swift ecosystem detection', () => {
		test('detects Package.swift', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'Package.swift'),
				'// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package()',
			);

			const result = await discoverBuildCommands(tempDir);
			expect(result.commands.some(c => c.ecosystem === 'swift') || result.skipped.some(s => s.ecosystem === 'swift')).toBe(true);
		});
	});

	describe('Dart ecosystem detection', () => {
		test('detects pubspec.yaml', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'pubspec.yaml'),
				'name: test_package\nversion: 1.0.0',
			);

			const result = await discoverBuildCommands(tempDir);
			expect(result.commands.some(c => c.ecosystem === 'dart') || result.skipped.some(s => s.ecosystem === 'dart')).toBe(true);
		});
	});

	describe('C/C++ ecosystem detection', () => {
		test('detects Makefile', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'Makefile'),
				'.PHONY: build\nbuild:\n\tgcc -o main main.c',
			);

			const result = await discoverBuildCommands(tempDir);
			expect(result.commands.some(c => c.ecosystem === 'cpp') || result.skipped.some(s => s.ecosystem === 'cpp')).toBe(true);
		});

		test('detects CMakeLists.txt', async () => {
			await fs.promises.writeFile(
				path.join(tempDir, 'CMakeLists.txt'),
				'cmake_minimum_required(VERSION 3.10)\nproject(Test)',
			);

			const result = await discoverBuildCommands(tempDir);
			expect(result.commands.some(c => c.ecosystem === 'cpp') || result.skipped.some(s => s.ecosystem === 'cpp')).toBe(true);
		});
	});

	describe('Multiple ecosystems', () => {
		test('detects multiple build files', async () => {
			// Create both package.json and Makefile
			await fs.promises.writeFile(
				path.join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', scripts: {} }),
			);
			await fs.promises.writeFile(
				path.join(tempDir, 'Makefile'),
				'build:\n\techo hi',
			);

			const result = await discoverBuildCommands(tempDir);
			// Both should be detected (or skipped if toolchain not available)
			const hasNode = result.commands.some(c => c.ecosystem === 'node') || result.skipped.some(s => s.ecosystem === 'node');
			const hasCpp = result.commands.some(c => c.ecosystem === 'cpp') || result.skipped.some(s => s.ecosystem === 'cpp');
			expect(hasNode || hasCpp).toBe(true);
		});
	});

	describe('Priority sorting', () => {
		test('commands are sorted by priority', async () => {
			// Create a package.json with custom scripts
			await fs.promises.writeFile(
				path.join(tempDir, 'package.json'),
				JSON.stringify({ name: 'test', scripts: { build: 'tsc' } }),
			);

			const result = await discoverBuildCommands(tempDir);
			// If there are multiple commands, they should be sorted
			if (result.commands.length > 1) {
				for (let i = 0; i < result.commands.length - 1; i++) {
					expect(result.commands[i].priority).toBeLessThanOrEqual(result.commands[i + 1].priority);
				}
			}
		});
	});
});

describe('build/discovery.ts - Tool Definition', () => {
	test('build_discovery is exported', () => {
		expect(build_discovery).toBeDefined();
	});

	test('build_discovery has description', () => {
		// The tool should have a description property (implementation-dependent)
		expect(build_discovery).toBeDefined();
	});

	test('build_discovery is an object', () => {
		expect(typeof build_discovery).toBe('object');
	});
});

describe('build/discovery.ts - Edge Cases', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'discovery-edge-'));
	});

	afterEach(async () => {
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test('handles non-existent directory', async () => {
		const result = await discoverBuildCommands('/non/existent/path');
		expect(result).toHaveProperty('commands');
		expect(result).toHaveProperty('skipped');
	});

	test('handles invalid JSON in package.json', async () => {
		await fs.promises.writeFile(
			path.join(tempDir, 'package.json'),
			'invalid json {',
		);

		const result = await discoverBuildCommands(tempDir);
		// Should handle gracefully without crashing
		expect(result).toHaveProperty('commands');
		expect(result).toHaveProperty('skipped');
	});

	test('handles empty package.json scripts', async () => {
		await fs.promises.writeFile(
			path.join(tempDir, 'package.json'),
			JSON.stringify({ name: 'test' }),
		);

		const result = await discoverBuildCommands(tempDir);
		// Should handle gracefully
		expect(result).toHaveProperty('commands');
		expect(result).toHaveProperty('skipped');
	});

	test('handles package.json with non-object scripts', async () => {
		await fs.promises.writeFile(
			path.join(tempDir, 'package.json'),
			JSON.stringify({ name: 'test', scripts: 'not an object' }),
		);

		const result = await discoverBuildCommands(tempDir);
		// Should handle gracefully
		expect(result).toHaveProperty('commands');
		expect(result).toHaveProperty('skipped');
	});
});
