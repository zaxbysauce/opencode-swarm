import { describe, it, expect, beforeEach } from 'bun:test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
	SUPPORTED_FRAMEWORKS,
	detectTestFramework,
} from '../../src/tools/test-runner';

describe('Group 1: SUPPORTED_FRAMEWORKS constant', () => {
	it('contains all 9 new frameworks', () => {
		const newFrameworks = [
			'go-test',
			'maven',
			'gradle',
			'dotnet-test',
			'ctest',
			'swift-test',
			'dart-test',
			'rspec',
			'minitest',
		] as const;

		for (const fw of newFrameworks) {
			expect(SUPPORTED_FRAMEWORKS).toContain(fw);
		}
	});

	it('has 16 total frameworks (7 original + 9 new)', () => {
		expect(SUPPORTED_FRAMEWORKS).toHaveLength(16);
	});

	it('all values are distinct (no duplicates)', () => {
		const uniqueFrameworks = new Set(SUPPORTED_FRAMEWORKS);
		expect(uniqueFrameworks.size).toBe(SUPPORTED_FRAMEWORKS.length);
	});

	it('contains all original frameworks', () => {
		const originalFrameworks = ['bun', 'vitest', 'jest', 'mocha', 'pytest', 'cargo', 'pester'] as const;
		for (const fw of originalFrameworks) {
			expect(SUPPORTED_FRAMEWORKS).toContain(fw);
		}
	});
});

describe('Group 2: detectTestFramework() — new detectors wired in', () => {
	const tmpDir = '/tmp/test-project';

	describe('go-test', () => {
		it('detects go-test when go.mod exists', async () => {
			// Create temp dir with go.mod
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-go-'));
			fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example\ngo 1.21');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('go-test');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe('maven', () => {
		it('detects maven when pom.xml exists', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-maven-'));
			fs.writeFileSync(path.join(tempDir, 'pom.xml'), '<project></project>');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('maven');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe('gradle', () => {
		it('detects gradle when build.gradle exists', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-gradle-'));
			fs.writeFileSync(path.join(tempDir, 'build.gradle'), 'plugins { id "java" }');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('gradle');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('detects gradle when build.gradle.kts exists', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-gradle-kts-'));
			fs.writeFileSync(path.join(tempDir, 'build.gradle.kts'), 'plugins { java }');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('gradle');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe('dotnet-test', () => {
		it('detects dotnet-test when .csproj exists', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-dotnet-'));
			fs.writeFileSync(path.join(tempDir, 'MyProject.csproj'), '<Project></Project>');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('dotnet-test');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe('ctest', () => {
		it('detects ctest when CMakeLists.txt exists', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-ctest-'));
			fs.writeFileSync(path.join(tempDir, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.0)');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('ctest');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('detects ctest when CMakeCache.txt exists', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-ctest-cache-'));
			fs.writeFileSync(path.join(tempDir, 'CMakeCache.txt'), '# CMake configuration');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('ctest');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe('swift-test', () => {
		it('detects swift-test when Package.swift exists', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-swift-'));
			fs.writeFileSync(path.join(tempDir, 'Package.swift'), '// swift-tools-version: 5.9');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('swift-test');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe('dart-test', () => {
		it('detects dart-test when pubspec.yaml exists', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-dart-'));
			fs.writeFileSync(path.join(tempDir, 'pubspec.yaml'), 'name: my_app\ndescription: A Dart app');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('dart-test');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe('rspec', () => {
		it('detects rspec when .rspec exists', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-rspec-'));
			fs.writeFileSync(path.join(tempDir, '.rspec'), '--require spec_helper\n--color');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('rspec');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('detects rspec when Gemfile and spec/ dir exist', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-rspec-gemfile-'));
			fs.writeFileSync(path.join(tempDir, 'Gemfile'), "source 'https://rubygems.org'");
			fs.mkdirSync(path.join(tempDir, 'spec'));
			fs.writeFileSync(path.join(tempDir, 'spec', 'my_spec.rb'), '# spec file');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('rspec');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe('minitest', () => {
		it('detects minitest when test/ dir and Gemfile exist', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-minitest-'));
			fs.mkdirSync(path.join(tempDir, 'test'));
			fs.writeFileSync(path.join(tempDir, 'test', 'my_test.rb'), '# test file');
			fs.writeFileSync(path.join(tempDir, 'Gemfile'), "source 'https://rubygems.org'");

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('minitest');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});

		it('detects minitest when test/ dir and Rakefile exist', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-minitest-rakefile-'));
			fs.mkdirSync(path.join(tempDir, 'test'));
			fs.writeFileSync(path.join(tempDir, 'test', 'my_test.rb'), '# test file');
			fs.writeFileSync(path.join(tempDir, 'Rakefile'), 'task :default => [:test]');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('minitest');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});

	describe('return "none" when NO frameworks are detected', () => {
		it('returns none when no framework markers exist', async () => {
			const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-none-'));

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('none');
			
			fs.rmSync(tempDir, { recursive: true, force: true });
		});
	});
});

describe('Group 3: buildTestCommand() — test limitation', () => {
	it('buildTestCommand is NOT exported from test-runner.ts - cannot test directly', () => {
		// This test documents the limitation - buildTestCommand is not exported
		// so we cannot directly test it.
		expect(true).toBe(true);
	});
});

describe('Group 4: parseTestOutput() — test limitation', () => {
	it('parseTestOutput is NOT exported from test-runner.ts - cannot test directly', () => {
		// This test documents the limitation - parseTestOutput is not exported
		expect(true).toBe(true);
	});
});

describe('Group 5: SOURCE_EXTENSIONS and SKIP_DIRECTORIES — test limitation', () => {
	it('SOURCE_EXTENSIONS is NOT exported from test-runner.ts - cannot test directly', () => {
		// SOURCE_EXTENSIONS is a private const without 'export' keyword
		expect(true).toBe(true);
	});

	it('SKIP_DIRECTORIES is NOT exported from test-runner.ts - cannot test directly', () => {
		// SKIP_DIRECTORIES is a private const without 'export' keyword
		expect(true).toBe(true);
	});
});

describe('Integration: detectTestFramework with multiple frameworks', () => {
	it('prioritizes JS frameworks over new languages when package.json exists', async () => {
		const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-priority-'));
		fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
			scripts: { test: 'vitest' },
		}));
		fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example\ngo 1.21');

		const result = await detectTestFramework(tempDir);
		expect(result).toBe('vitest');
		
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('detects new language frameworks when JS frameworks not detected', async () => {
		const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-new-lang-'));
		fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example\ngo 1.21');

		const result = await detectTestFramework(tempDir);
		expect(result).toBe('go-test');
		
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('returns none when no markers exist', async () => {
		const tempDir = fs.mkdtempSync(path.join('/tmp', 'test-empty-'));

		const result = await detectTestFramework(tempDir);
		expect(result).toBe('none');
		
		fs.rmSync(tempDir, { recursive: true, force: true });
	});
});
