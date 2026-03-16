import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectTestFramework } from '../../src/tools/test-runner';

describe('Test Framework Detectors (Go, Java, Gradle, .NET, C/C++, Swift, Dart, Ruby)', () => {
	let tempDirs: string[];

	beforeEach(() => {
		// Clear tempDirs at the start of each test
		tempDirs = [];
	});

	afterEach(() => {
		// Clean up all temp directories
		for (const dir of tempDirs) {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	function createTempDir(suffix: string): string {
		const tempDir = path.join(os.tmpdir(), `test-runner-detectors-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		fs.mkdirSync(tempDir, { recursive: true });
		tempDirs.push(tempDir);
		return tempDir;
	}

	function createFile(dir: string, filePath: string, content = '') {
		const fullPath = path.join(dir, filePath);
		const dirPath = path.dirname(fullPath);
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true });
		}
		fs.writeFileSync(fullPath, content);
	}

	describe('Go test detector (detectGoTest)', () => {
		it('should detect go-test for Go project with go.mod when go binary is available', async () => {
			const tempDir = createTempDir('go');
			createFile(tempDir, 'go.mod', 'module example\n\ngo 1.21');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('go-test');
		});
	});

	describe('Java/Maven detector (detectJavaMaven)', () => {
		it('should detect maven for Maven project with pom.xml when mvn binary is available', async () => {
			const tempDir = createTempDir('maven');
			createFile(tempDir, 'pom.xml', '<project></project>');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('maven');
		});
	});

	describe('Gradle detector (detectGradle)', () => {
		it('should detect gradle for Gradle project with build.gradle when gradle binary is available', async () => {
			const tempDir = createTempDir('gradle');
			createFile(tempDir, 'build.gradle', 'plugins { id "java" }');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('gradle');
		});

		it('should detect gradle for Gradle project with build.gradle.kts when gradle binary is available', async () => {
			const tempDir = createTempDir('gradle-kts');
			createFile(tempDir, 'build.gradle.kts', 'plugins { java }');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('gradle');
		});
	});

	describe('.NET detector (detectDotnetTest)', () => {
		it('should detect dotnet-test for .NET project with .csproj when dotnet binary is available', async () => {
			const tempDir = createTempDir('dotnet');
			createFile(tempDir, 'MyProject.csproj', '<Project></Project>');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('dotnet-test');
		});
	});

	describe('C/C++ CTest detector (detectCTest)', () => {
		it('should detect ctest for CMake project with CMakeLists.txt when ctest binary is available', async () => {
			const tempDir = createTempDir('ctest-source');
			createFile(tempDir, 'CMakeLists.txt', 'cmake_minimum_required(VERSION 3.0)');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('ctest');
		});

		it('should detect ctest for CMake build directory with CMakeCache.txt when ctest binary is available', async () => {
			const tempDir = createTempDir('ctest-build');
			createFile(tempDir, 'CMakeCache.txt', '# CMake configuration');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('ctest');
		});

		it('should detect ctest for CMake project with build/CMakeCache.txt when ctest binary is available', async () => {
			const tempDir = createTempDir('ctest-build-subdir');
			createFile(tempDir, 'build/CMakeCache.txt', '# CMake configuration');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('ctest');
		});
	});

	describe('Swift detector (detectSwiftTest)', () => {
		it('should detect swift-test for Swift project with Package.swift when swift binary is available', async () => {
			const tempDir = createTempDir('swift');
			createFile(tempDir, 'Package.swift', '// swift-tools-version: 5.9');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('swift-test');
		});
	});

	describe('Dart/Flutter detector (detectDartTest)', () => {
		it('should detect dart-test for Dart project with pubspec.yaml when dart binary is available', async () => {
			const tempDir = createTempDir('dart');
			createFile(tempDir, 'pubspec.yaml', 'name: my_app\ndescription: A Dart app');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('dart-test');
		});

		it('should detect dart-test for Flutter project with pubspec.yaml when flutter binary is available', async () => {
			const tempDir = createTempDir('flutter');
			createFile(tempDir, 'pubspec.yaml', 'name: my_app\ndescription: A Flutter app');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('dart-test');
		});
	});

	describe('Ruby/RSpec detector (detectRSpec)', () => {
		it('should detect rspec for RSpec project with .rspec file when bundle/rspec binary is available', async () => {
			const tempDir = createTempDir('rspec');
			createFile(tempDir, '.rspec', '--require spec_helper\n--color');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('rspec');
		});

		it('should detect rspec for RSpec project with Gemfile + spec/ directory when bundle/rspec binary is available', async () => {
			const tempDir = createTempDir('rspec-gemfile');
			createFile(tempDir, 'Gemfile', "source 'https://rubygems.org'");
			createFile(tempDir, 'spec/my_spec.rb', '# spec file');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('rspec');
		});
	});

	describe('Ruby/Minitest detector (detectMinitest)', () => {
		it('should detect minitest for Minitest project with test/ directory + Gemfile when ruby binary is available', async () => {
			const tempDir = createTempDir('minitest-gemfile');
			createFile(tempDir, 'test/my_test.rb', '# test file');
			createFile(tempDir, 'Gemfile', "source 'https://rubygems.org'");

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('minitest');
		});

		it('should detect minitest for Minitest project with test/ directory + Rakefile when ruby binary is available', async () => {
			const tempDir = createTempDir('minitest-rakefile');
			createFile(tempDir, 'test/my_test.rb', '# test file');
			createFile(tempDir, 'Rakefile', 'task :default => [:test]');

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('minitest');
		});
	});

	describe('Verification of detectGoTest logic (via marker files)', () => {
		it('should have go.mod marker file for Go detection', async () => {
			const tempDir = createTempDir('go-marker');
			createFile(tempDir, 'go.mod', 'module example\n\ngo 1.21');

			// Verify marker file exists
			expect(fs.existsSync(path.join(tempDir, 'go.mod'))).toBe(true);

			// Since detector needs go binary available
			const result = await detectTestFramework(tempDir);
			expect(result).toBe('go-test');
		});
	});

	describe('Verification of detectJavaMaven logic (via marker files)', () => {
		it('should have pom.xml marker file for Maven detection', async () => {
			const tempDir = createTempDir('maven-marker');
			createFile(tempDir, 'pom.xml', '<project></project>');

			// Verify marker file exists
			expect(fs.existsSync(path.join(tempDir, 'pom.xml'))).toBe(true);

			// Since detector needs mvn binary available
			const result = await detectTestFramework(tempDir);
			expect(result).toBe('maven');
		});
	});

	describe('Verification of detectGradle logic (via marker files)', () => {
		it('should have build.gradle marker file for Gradle detection', async () => {
			const tempDir = createTempDir('gradle-marker');
			createFile(tempDir, 'build.gradle', 'plugins { id "java" }');

			// Verify marker file exists
			expect(fs.existsSync(path.join(tempDir, 'build.gradle'))).toBe(true);

			const result = await detectTestFramework(tempDir);
			expect(result).toBe('gradle');
		});

		it('should support gradlew script as an alternative to gradle binary', async () => {
			const tempDir = createTempDir('gradle-gradlew-marker');
			createFile(tempDir, 'build.gradle', 'plugins { id "java" }');
			createFile(tempDir, 'gradlew', '#!/bin/sh\nexec gradle "$@"');

			// Verify marker files exist
			expect(fs.existsSync(path.join(tempDir, 'build.gradle'))).toBe(true);
			expect(fs.existsSync(path.join(tempDir, 'gradlew'))).toBe(true);

			// gradlew file exists on disk → hasGradlew = true → detector fires without needing binary
			const result = await detectTestFramework(tempDir);
			expect(result).toBe('gradle');
		});
	});
});
