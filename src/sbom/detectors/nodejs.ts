/**
 * Node.js Detector
 *
 * Supports: package.json, package-lock.json, yarn.lock, pnpm-lock.yaml
 */

import type { Detector, SbomComponent } from './index.js';
import { generatePurl } from './index.js';

/**
 * Parse package.json dependencies (fallback)
 */
function parsePackageJson(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	try {
		const pkg = JSON.parse(content);

		// Handle both dependencies and devDependencies
		const deps = { ...pkg.dependencies, ...pkg.devDependencies };

		for (const [name, version] of Object.entries(deps)) {
			const ver = String(version);
			// Remove version prefixes like ^, ~, >=, etc. for PURL
			const cleanVersion = ver.replace(/^[\^~>=<]+/, '');

			components.push({
				name,
				version: cleanVersion || 'unknown',
				type: 'library',
				purl: generatePurl('npm', name, cleanVersion || 'unknown'),
			});
		}
	} catch {
		// Invalid JSON, return empty
	}

	return components;
}

/**
 * Parse package-lock.json (npm v2/v3 lockfile format)
 */
function parsePackageLock(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	try {
		const lock = JSON.parse(content);

		// Handle different lockfile versions
		const packages = lock.packages || lock.dependencies || {};

		for (const [pkgPath, pkgData] of Object.entries(packages)) {
			if (pkgPath === '') continue; // Skip root package

			const pkg = pkgData as Record<string, unknown>;
			const version = (pkg.version as string) || '';
			const name =
				(pkg.name as string) ||
				pkgPath.replace(/^node_modules\//, '').replace(/@.*$/, '');

			if (name && version) {
				components.push({
					name,
					version,
					type: 'library',
					purl: generatePurl('npm', name, version),
					license: pkg.license as string | undefined,
				});
			}
		}
	} catch {
		// Invalid JSON
	}

	return components;
}

/**
 * Parse yarn.lock (key-value format)
 *
 * Yarn lock format:
 * react@^17.0.0:
 *   version "17.0.2"
 *   resolved "https://registry.yarnpkg.com/react/-/react-17.0.2.tgz#..."
 */
function parseYarnLock(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	// Split by package@version blocks
	const blocks = content.split(/^(?=@?[\w-]+@)/m);

	for (const block of blocks) {
		const pkgMatch = block.match(/^(@?[\w-]+)@([\d.]+)/m);
		if (!pkgMatch) continue;

		const name = pkgMatch[1];
		const version = pkgMatch[2];

		if (name && version) {
			components.push({
				name,
				version,
				type: 'library',
				purl: generatePurl('npm', name, version),
			});
		}
	}

	return components;
}

/**
 * Parse pnpm-lock.yaml (YAML format)
 */
function parsePnpmLockYaml(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	try {
		// Simple YAML parser for pnpm-lock format
		// pnpm-lock.yaml has packages under /packages: or /node_modules
		// Format: /express@4.18.2:
		//         resolution: {integrity: sha-...}
		//         version: 4.18.2
		const lines = content.split('\n');

		for (const line of lines) {
			// Check for package entry (e.g., /lodash@4.17.21:)
			const packageMatch = line.match(/^\s*\/(@?[\w-]+)@([\d.]+):?/);
			if (packageMatch) {
				components.push({
					name: packageMatch[1],
					version: packageMatch[2],
					type: 'library',
					purl: generatePurl('npm', packageMatch[1], packageMatch[2]),
				});
			}
		}
	} catch {
		// Invalid YAML
	}

	return components;
}

export const nodejsDetectors: Detector[] = [
	{
		name: 'Node.js package-lock.json',
		patterns: ['package-lock.json'],
		detect: (_filePath, content) => {
			return parsePackageLock(content);
		},
	},
	{
		name: 'Node.js yarn.lock',
		patterns: ['yarn.lock'],
		detect: (_filePath, content) => {
			return parseYarnLock(content);
		},
	},
	{
		name: 'Node.js pnpm-lock.yaml',
		patterns: ['pnpm-lock.yaml'],
		detect: (_filePath, content) => {
			return parsePnpmLockYaml(content);
		},
	},
	{
		name: 'Node.js package.json',
		patterns: ['package.json'],
		detect: (_filePath, content) => {
			return parsePackageJson(content);
		},
	},
];
