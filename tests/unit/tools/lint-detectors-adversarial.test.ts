import * as fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectAdditionalLinter } from '../../../src/tools/lint';

// Mock node:fs for filesystem operations
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockReaddirSync = vi.fn();
vi.mock('node:fs', () => ({
	existsSync: (...args: unknown[]) => mockExistsSync(...args),
	readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
	readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
}));

// Mock isCommandAvailable from build/discovery
const mockIsCommandAvailable = vi.fn();
vi.mock('../../../src/build/discovery', () => ({
	isCommandAvailable: (...args: unknown[]) => mockIsCommandAvailable(...args),
}));

describe('Lint Detectors - Adversarial Security/Edge-Case Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Path traversal / injection', () => {
		it('should not crash on path traversal attempt - "../../etc/passwd"', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue([]);

			const result = detectAdditionalLinter('../../etc/passwd');

			expect(result).toBeNull();
			// readdirSync is called by detectDotnetFormat and detectKtlint, so it will be called
		});

		it('should not crash on complex path traversal - "/dev/null/../../../etc"', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue([]);

			const result = detectAdditionalLinter('/dev/null/../../../etc');

			expect(result).toBeNull();
		});

		it('should not crash on empty string cwd', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue([]);

			const result = detectAdditionalLinter('');

			expect(result).toBeNull();
		});

		it('should not crash on current dir "." (should behave normally)', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue([]);

			const result = detectAdditionalLinter('.');

			expect(result).toBeNull();
			expect(mockExistsSync).toHaveBeenCalled();
		});

		it('should not crash on null-byte injection', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue([]);

			const result = detectAdditionalLinter('path\x00injection');

			expect(result).toBeNull();
		});

		it('should not crash on deeply nested path traversal', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue([]);

			const result = detectAdditionalLinter('../../../../../../../etc/passwd');

			expect(result).toBeNull();
		});
	});

	describe('File system errors', () => {
		it('should return null when readdirSync throws EACCES (permission denied)', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockImplementation(() => {
				const error = new Error('EACCES: permission denied');
				(error as any).code = 'EACCES';
				throw error;
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should return null when readdirSync throws ENOTDIR (path is a file)', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockImplementation(() => {
				const error = new Error('ENOTDIR: not a directory');
				(error as any).code = 'ENOTDIR';
				throw error;
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should return null when readdirSync throws ENOENT (no such file)', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockImplementation(() => {
				const error = new Error('ENOENT: no such file');
				(error as any).code = 'ENOENT';
				throw error;
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should return null when readdirSync returns empty array', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue([]);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should not crash when readFileSync throws error on pyproject.toml', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('pyproject.toml');
			});
			mockReadFileSync.mockImplementation(() => {
				throw new Error('EACCES: permission denied reading pyproject.toml');
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should handle generic error from readdirSync gracefully', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockImplementation(() => {
				throw new Error('Unknown filesystem error');
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});
	});

	describe('Malicious filenames in readdirSync results', () => {
		it('should not trigger false positive for file named "../../etc/passwd"', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['../../etc/passwd']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should handle hidden file ".kt" appropriately', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['.kt']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			// .kt ends with .kt, so it would match the pattern
			// Test that it doesn't crash
			expect(result).toBe('ktlint');
		});

		it('should not trigger for file "notakotlinfile.txt" with malicious name', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['notakotlinfile.txt']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should handle extremely long filename (2000 chars ending in .kt)', () => {
			mockExistsSync.mockReturnValue(false);
			const longName = 'a'.repeat(1996) + '.kt';
			mockReaddirSync.mockReturnValue([longName]);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('ktlint');
		});

		it('should NOT match "build.gradle.kts.bak" (not exact .kts extension)', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['build.gradle.kts.bak']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should handle "build.gradle" as directory (existsSync returns true)', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('build.gradle');
			});
			mockReaddirSync.mockReturnValue([]);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			// Since build.gradle exists, it should try to detect checkstyle
			// but needs mvn or gradle available
			expect(mockIsCommandAvailable).toHaveBeenCalled();
		});

		it('should not crash on filename with null byte', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['test\x00.kt']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			// Should not crash
			expect(result).toBe('ktlint');
		});

		it('should handle filename with Unicode characters', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['файл.kt', '中文.kts']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('ktlint');
		});

		it('should handle filename with control characters', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['test\n.kt', 'file\t.kts']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('ktlint');
		});

		it('should handle mixed case extensions (.KT vs .kt)', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['file.KT', 'file.Kts']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			// .endsWith is case-sensitive, so these shouldn't match
			expect(result).toBeNull();
		});
	});

	describe('Boolean edge cases for detectKtlint', () => {
		it('should handle IIFE returning false with empty dirs', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue([]);
			mockIsCommandAvailable.mockReturnValue(false);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should return null when both build.gradle.kts AND .kt file exist, but ktlint unavailable', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('build.gradle.kts');
			});
			mockReaddirSync.mockReturnValue(['test.kt']);
			mockIsCommandAvailable.mockReturnValue(false);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should handle case where .kts file exists but binary unavailable', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['script.kts']);
			mockIsCommandAvailable.mockReturnValue(false);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should handle only .kt files in readdir', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['file1.kt', 'file2.kt', 'file3.kt']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('ktlint');
		});

		it('should handle only .kts files in readdir', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['script1.kts', 'script2.kts']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('ktlint');
		});

		it('should handle mixed .kt and .kts files', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['main.kt', 'script.kts', 'other.kt']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('ktlint');
		});
	});

	describe('Boolean edge cases for detectCheckstyle', () => {
		it('should detect via Maven when pom.xml exists and only mvn available', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('pom.xml') || path.includes('build.gradle');
			});
			mockIsCommandAvailable.mockImplementation((cmd: string) => {
				return cmd === 'mvn';
			});

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('checkstyle');
		});

		it('should detect via Gradle when both pom.xml and build.gradle exist, only gradlew available', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return (
					path.includes('pom.xml') ||
					path.includes('build.gradle') ||
					path.includes('gradlew')
				);
			});
			mockIsCommandAvailable.mockImplementation((cmd: string) => {
				return cmd === 'gradlew'; // gradlew is checked via existsSync, not isCommandAvailable
			});

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('checkstyle');
		});

		it('should return checkstyle when build.gradle exists, gradlew exists as file, no gradle binary', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('build.gradle') || path.includes('gradlew');
			});
			mockIsCommandAvailable.mockReturnValue(false);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('checkstyle');
		});

		it('should return null when pom.xml exists but no mvn binary', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('pom.xml');
			});
			mockIsCommandAvailable.mockReturnValue(false);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should return null when build.gradle exists but no gradlew or gradle binary', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('build.gradle');
			});
			mockIsCommandAvailable.mockReturnValue(false);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should detect with both pom.xml and build.gradle, mvn and gradle both available', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('pom.xml') || path.includes('build.gradle');
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('checkstyle');
		});
	});

	describe('detectCppcheck src/ scan', () => {
		it('should return null when src/ directory exists but contains no C/C++ files', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('src');
			});
			mockReaddirSync.mockImplementation((path: string) => {
				if (path.includes('src')) {
					return ['file.txt', 'README.md', 'other.js'];
				}
				return [];
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should return cppcheck when src/ contains only .h files (headers are valid C/C++)', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('src');
			});
			mockReaddirSync.mockImplementation((path: string) => {
				if (path.includes('src')) {
					return ['header1.h', 'header2.hpp', 'header3.h'];
				}
				return [];
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('cppcheck');
		});

		it('should handle readdirSync throw on src/ gracefully', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('src');
			});
			mockReaddirSync.mockImplementation((path: string) => {
				if (path.includes('src')) {
					const error = new Error('EACCES: permission denied on src');
					(error as any).code = 'EACCES';
					throw error;
				}
				return [];
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should detect cppcheck when root has C files', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['main.c', 'util.c']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('cppcheck');
		});

		it('should detect cppcheck when root has .cpp files', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['main.cpp', 'util.cpp']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('cppcheck');
		});

		it('should detect cppcheck when root has .cc files', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['main.cc', 'util.cc']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('cppcheck');
		});

		it('should detect cppcheck when root has .cxx files', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['main.cxx', 'util.cxx']);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('cppcheck');
		});

		it('should detect cppcheck when CMakeLists.txt exists regardless of file scan', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('CMakeLists.txt');
			});
			mockReaddirSync.mockReturnValue([]);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBe('cppcheck');
		});
	});

	describe('Additional adversarial scenarios', () => {
		it('should not crash on concurrent calls with same path', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(['test.kt']);
			mockIsCommandAvailable.mockReturnValue(true);

			const results = [
				detectAdditionalLinter('/test/path'),
				detectAdditionalLinter('/test/path'),
				detectAdditionalLinter('/test/path'),
			];

			expect(results.every((r) => r === 'ktlint')).toBe(true);
		});

		it('should crash when existsSync throws error (no try-catch wrapper)', () => {
			mockExistsSync.mockImplementation(() => {
				throw new Error('Disk error');
			});
			mockReaddirSync.mockReturnValue([]);
			mockIsCommandAvailable.mockReturnValue(true);

			// Should crash since existsSync is not wrapped in try-catch in detectors
			expect(() => detectAdditionalLinter('/test/path')).toThrow('Disk error');
		});

		it('should handle case where all commands are unavailable', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue([
				'test.kt',
				'pom.xml',
				'Cargo.toml',
				'go.mod',
			]);
			mockIsCommandAvailable.mockReturnValue(false);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should handle when readdirSync returns non-array values (null)', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue(null as unknown as string[]);
			mockIsCommandAvailable.mockReturnValue(true);

			// The catch blocks should handle TypeError from .some() on null and return null
			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});
	});

	describe('detectRuff adversarial tests', () => {
		it('should handle corrupted pyproject.toml that causes readFileSync to throw', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('pyproject.toml');
			});
			mockReadFileSync.mockImplementation(() => {
				throw new Error('Invalid UTF-8 sequence');
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should handle pyproject.toml with [tool.ruff] but binary unavailable', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('pyproject.toml');
			});
			mockReadFileSync.mockReturnValue(
				'# config\n[tool.ruff]\nline-length = 88',
			);
			mockIsCommandAvailable.mockReturnValue(false);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should handle pyproject.toml without [tool.ruff] section', () => {
			mockExistsSync.mockImplementation((path: string) => {
				return path.includes('pyproject.toml');
			});
			mockReadFileSync.mockReturnValue('[tool.black]\nline-length = 88');
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});
	});

	describe('detectDotnetFormat adversarial tests', () => {
		it('should handle readdirSync throwing for dotnet detection', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockImplementation(() => {
				throw new Error('ENOTDIR: not a directory');
			});
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});

		it('should handle empty directory listing for dotnet', () => {
			mockExistsSync.mockReturnValue(false);
			mockReaddirSync.mockReturnValue([]);
			mockIsCommandAvailable.mockReturnValue(true);

			const result = detectAdditionalLinter('/test/path');

			expect(result).toBeNull();
		});
	});
});
