import * as fs from 'node:fs';
import * as path from 'node:path';
import { type ToolContext, tool } from '@opencode-ai/plugin';

// ============ Types ============

export interface BuildCommand {
	ecosystem: string;
	command: string;
	cwd: string;
	priority: number; // Lower = higher priority
}

export interface BuildDiscoveryResult {
	commands: BuildCommand[];
	skipped: { ecosystem: string; reason: string }[];
}

export interface BuildDiscoveryOptions {
	scope?: 'changed' | 'all';
	changedFiles?: string[];
}

// ============ Ecosystem Definitions ============

interface EcosystemConfig {
	ecosystem: string;
	buildFiles: string[];
	toolchainCommands: string[];
	commands: { command: string; priority: number }[];
	repoDefinedScripts?: string[]; // Scripts that can be defined in repo config
}

const ECOSYSTEMS: EcosystemConfig[] = [
	{
		ecosystem: 'node',
		buildFiles: ['package.json'],
		toolchainCommands: ['npm', 'yarn', 'pnpm'],
		commands: [
			{ command: 'npm run build', priority: 1 },
			{ command: 'npm run typecheck', priority: 2 },
			{ command: 'npm run check', priority: 3 },
		],
		repoDefinedScripts: ['build', 'typecheck', 'check', 'compile'],
	},
	{
		ecosystem: 'rust',
		buildFiles: ['Cargo.toml'],
		toolchainCommands: ['cargo'],
		commands: [
			{ command: 'cargo build', priority: 1 },
			{ command: 'cargo check', priority: 2 },
		],
	},
	{
		ecosystem: 'go',
		buildFiles: ['go.mod'],
		toolchainCommands: ['go'],
		commands: [{ command: 'go build ./...', priority: 1 }],
	},
	{
		ecosystem: 'python',
		buildFiles: ['pyproject.toml', 'setup.py', 'setup.cfg'],
		toolchainCommands: ['python', 'python3', 'py'],
		commands: [
			{ command: 'python -m py_compile', priority: 1 },
			{ command: 'python -m build', priority: 2 },
		],
	},
	{
		ecosystem: 'java-maven',
		buildFiles: ['pom.xml'],
		toolchainCommands: ['mvn'],
		commands: [{ command: 'mvn compile', priority: 1 }],
	},
	{
		ecosystem: 'java-gradle',
		buildFiles: ['build.gradle', 'build.gradle.kts', 'gradle.properties'],
		toolchainCommands: ['gradle', 'gradlew'],
		commands: [
			{
				command:
					process.platform === 'win32'
						? 'gradlew.bat build'
						: './gradlew build',
				priority: 1,
			},
			{ command: 'gradle build', priority: 2 },
		],
	},
	{
		ecosystem: 'dotnet',
		buildFiles: ['*.csproj', '*.fsproj', '*.vbproj'],
		toolchainCommands: ['dotnet'],
		commands: [{ command: 'dotnet build', priority: 1 }],
	},
	{
		ecosystem: 'swift',
		buildFiles: ['Package.swift'],
		toolchainCommands: ['swift'],
		commands: [{ command: 'swift build', priority: 1 }],
	},
	{
		ecosystem: 'dart',
		buildFiles: ['pubspec.yaml', 'pubspec.lock'],
		toolchainCommands: ['dart', 'flutter'],
		commands: [
			{ command: 'dart analyze', priority: 1 },
			{ command: 'dart compile', priority: 2 },
		],
	},
	{
		ecosystem: 'cpp',
		buildFiles: ['Makefile', 'CMakeLists.txt'],
		toolchainCommands: ['make', 'cmake'],
		commands: [
			{ command: 'make', priority: 1 },
			{ command: 'cmake -B build && cmake --build build', priority: 2 },
		],
	},
];

// ============ Toolchain Detection Cache ============

const toolchainCache: Map<string, boolean> = new Map();

// ============ Helper Functions ============

/**
 * Check if a command exists on PATH
 * Uses 'where' on Windows, 'which' on Unix
 */
export function isCommandAvailable(command: string): boolean {
	// Check cache first
	if (toolchainCache.has(command)) {
		return toolchainCache.get(command)!;
	}

	const isWindows = process.platform === 'win32';
	const cmd = isWindows ? `${command}.exe` : command;

	try {
		const result = Bun.spawnSync({
			cmd: isWindows ? ['where', cmd] : ['which', cmd],
			stdout: 'pipe',
			stderr: 'pipe',
		});

		const available = result.success;
		toolchainCache.set(command, available);
		return available;
	} catch {
		toolchainCache.set(command, false);
		return false;
	}
}

/**
 * Check if any of the toolchain commands are available
 */
function checkToolchain(commands: string[]): boolean {
	return commands.some((cmd) => isCommandAvailable(cmd));
}

/**
 * Find build files in the given directory
 */
function findBuildFiles(workingDir: string, patterns: string[]): string | null {
	for (const pattern of patterns) {
		// Handle glob-like patterns
		if (pattern.includes('*')) {
			// For simple patterns like *.csproj
			const dir = workingDir;
			try {
				const files = fs.readdirSync(dir);
				const matches = files.filter((f) => {
					// Convert glob to regex
					const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
					return regex.test(f);
				});
				if (matches.length > 0) {
					return path.join(dir, matches[0]);
				}
			} catch {
				// Ignore errors
			}
		} else {
			// Exact file match
			const filePath = path.join(workingDir, pattern);
			if (fs.existsSync(filePath)) {
				return filePath;
			}
		}
	}
	return null;
}

/**
 * Get repo-defined build scripts from package.json
 */
function getRepoDefinedScripts(
	workingDir: string,
	scripts: string[],
): { script: string; priority: number }[] {
	const packageJsonPath = path.join(workingDir, 'package.json');

	if (!fs.existsSync(packageJsonPath)) {
		return [];
	}

	try {
		const content = fs.readFileSync(packageJsonPath, 'utf-8');
		const pkg = JSON.parse(content);

		if (!pkg.scripts || typeof pkg.scripts !== 'object') {
			return [];
		}

		const found: { script: string; priority: number }[] = [];

		for (const scriptName of scripts) {
			if (pkg.scripts[scriptName]) {
				found.push({
					script: `npm run ${scriptName}`,
					priority: 0, // Repo-defined scripts have highest priority
				});
			}
		}

		return found;
	} catch {
		return [];
	}
}

/**
 * Filter files by scope (changed or all)
 */
function filterByScope(
	workingDir: string,
	scope: 'changed' | 'all',
	changedFiles?: string[],
): string[] {
	if (scope === 'all') {
		// Return all files in the directory (recursively find build files)
		return findAllBuildFiles(workingDir);
	}

	if (!changedFiles || changedFiles.length === 0) {
		return [];
	}

	// For 'changed' scope, filter changed files to only those in relevant paths
	return changedFiles;
}

/**
 * Find all potential build files in directory tree
 */
function findAllBuildFiles(workingDir: string): string[] {
	const allBuildFiles = new Set<string>();

	for (const ecosystem of ECOSYSTEMS) {
		for (const pattern of ecosystem.buildFiles) {
			if (pattern.includes('*')) {
				// Glob pattern - search recursively
				const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
				findFilesRecursive(workingDir, regex, allBuildFiles);
			} else {
				// Exact file
				const filePath = path.join(workingDir, pattern);
				if (fs.existsSync(filePath)) {
					allBuildFiles.add(filePath);
				}
			}
		}
	}

	return Array.from(allBuildFiles);
}

/**
 * Recursively find files matching a regex
 */
function findFilesRecursive(
	dir: string,
	regex: RegExp,
	results: Set<string>,
): void {
	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			// Skip node_modules and other common ignore directories
			if (
				entry.isDirectory() &&
				!['node_modules', '.git', 'dist', 'build', 'target'].includes(
					entry.name,
				)
			) {
				findFilesRecursive(fullPath, regex, results);
			} else if (entry.isFile() && regex.test(entry.name)) {
				results.add(fullPath);
			}
		}
	} catch {
		// Ignore permission errors
	}
}

// ============ Main Discovery Function ============

/**
 * Discover build commands for a given working directory
 */
export async function discoverBuildCommands(
	workingDir: string,
	options?: BuildDiscoveryOptions,
): Promise<BuildDiscoveryResult> {
	const scope = options?.scope ?? 'all';
	const changedFiles = options?.changedFiles ?? [];

	// Get files to check based on scope
	const _filesToCheck = filterByScope(workingDir, scope, changedFiles);

	const commands: BuildCommand[] = [];
	const skipped: { ecosystem: string; reason: string }[] = [];

	// Process each ecosystem
	for (const ecosystem of ECOSYSTEMS) {
		// Check if toolchain is available
		if (!checkToolchain(ecosystem.toolchainCommands)) {
			skipped.push({
				ecosystem: ecosystem.ecosystem,
				reason: `Toolchain not found: ${ecosystem.toolchainCommands.join(
					' or ',
				)} not on PATH`,
			});
			continue;
		}

		// Check for build files
		const buildFile = findBuildFiles(workingDir, ecosystem.buildFiles);

		if (!buildFile) {
			skipped.push({
				ecosystem: ecosystem.ecosystem,
				reason: `No build file found: ${ecosystem.buildFiles.join(', ')}`,
			});
			continue;
		}

		// For Node.js, check for repo-defined scripts first
		let availableCommands: { command: string; priority: number }[] =
			ecosystem.commands;

		if (ecosystem.repoDefinedScripts) {
			const repoScripts = getRepoDefinedScripts(
				workingDir,
				ecosystem.repoDefinedScripts,
			);
			if (repoScripts.length > 0) {
				availableCommands = repoScripts.map((s) => ({
					command: s.script,
					priority: s.priority,
				}));
			}
		}

		// Add commands for this ecosystem
		for (const cmd of availableCommands) {
			commands.push({
				ecosystem: ecosystem.ecosystem,
				command: cmd.command,
				cwd: workingDir,
				priority: cmd.priority,
			});
		}
	}

	// Sort by priority (lower = higher priority)
	commands.sort((a, b) => a.priority - b.priority);

	return { commands, skipped };
}

/**
 * Clear the toolchain cache (useful for testing)
 */
export function clearToolchainCache(): void {
	toolchainCache.clear();
}

/**
 * Get ecosystem info for display
 */
export function getEcosystems(): string[] {
	return ECOSYSTEMS.map((e) => e.ecosystem);
}

// ============ Tool Definition ============

export const build_discovery: ReturnType<typeof tool> = tool({
	description:
		'Discover build commands for various ecosystems in a project directory',
	args: {
		workingDir: tool.schema
			.string()
			.describe(
				'Directory to scan for build commands (defaults to current directory)',
			),
		scope: tool.schema
			.string()
			.optional()
			.describe(
				'Scope of detection: "all" for all build files, "changed" for only changed files',
			),
		changedFiles: tool.schema
			.array(tool.schema.string())
			.optional()
			.describe('List of changed files when scope is "changed"'),
	},
	async execute(
		args: {
			workingDir: string;
			scope?: 'changed' | 'all';
			changedFiles?: string[];
		},
		_context: ToolContext,
	): Promise<string> {
		const result = await discoverBuildCommands(args.workingDir, {
			scope: args.scope ?? 'all',
			changedFiles: args.changedFiles ?? [],
		});

		return JSON.stringify(result, null, 2);
	},
});
