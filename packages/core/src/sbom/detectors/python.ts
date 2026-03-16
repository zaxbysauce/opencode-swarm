/**
 * Python Detector
 *
 * Supports: requirements.txt, poetry.lock, Pipfile.lock
 */

import type { Detector, SbomComponent } from './index.js';
import { generatePurl } from './index.js';

/**
 * Parse requirements.txt
 *
 * Simple format: name==version
 * Also supports: name>=version, name~=version, name
 */
function parseRequirementsTxt(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];
	const lines = content.split('\n');

	for (const line of lines) {
		const trimmed = line.trim();

		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith('#')) continue;

		// Skip options like -r, -e, --index-url, etc.
		if (trimmed.startsWith('-')) continue;

		// Match various version specifiers
		const match = trimmed.match(/^([a-zA-Z0-9_-]+)(?:[=<>~!]+)?([\d.]+)?/);
		if (match) {
			const name = match[1];
			const version = match[2] || 'unknown';

			if (name) {
				components.push({
					name,
					version,
					type: 'library',
					purl: generatePurl('pypi', name, version),
				});
			}
		}
	}

	return components;
}

/**
 * Parse poetry.lock (TOML with [[package]] entries)
 *
 * Format:
 * [[package]]
 * name = "requests"
 * version = "2.28.0"
 * description = "..."
 */
function parsePoetryLock(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	// Find all [[package]] blocks
	const packageBlocks = content.split(/\[\[package\]\]/);

	for (const block of packageBlocks) {
		if (block.trim() === '') continue;

		const nameMatch = block.match(/name\s*=\s*"([^"]+)"/);
		const versionMatch = block.match(/version\s*=\s*"([^"]+)"/);

		if (nameMatch && versionMatch) {
			const name = nameMatch[1];
			const version = versionMatch[1];

			// Try to find license
			const licenseMatch = block.match(/license\s*=\s*"([^"]+)"/);

			components.push({
				name,
				version,
				type: 'library',
				purl: generatePurl('pypi', name, version),
				license: licenseMatch?.[1],
			});
		}
	}

	return components;
}

/**
 * Parse Pipfile.lock (JSON format)
 *
 * Format:
 * {
 *   "default": {
 *     "requests": {
 *       "version": "==2.28.0",
 *       ...
 *     }
 *   }
 * }
 */
function parsePipfileLock(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	try {
		const lock = JSON.parse(content);

		// Handle both default and develop sections
		const sections = [lock.default, lock.dev].filter(Boolean);

		for (const section of sections) {
			if (!section) continue;

			for (const [name, pkgData] of Object.entries(section)) {
				const pkg = pkgData as Record<string, unknown>;
				let version = (pkg.version as string) || 'unknown';

				// Remove version specifiers like ==, >=, etc.
				version = version.replace(/^[=<>~!]+/, '');

				if (version && version !== '*') {
					components.push({
						name,
						version,
						type: 'library',
						purl: generatePurl('pypi', name, version),
					});
				}
			}
		}
	} catch {
		// Invalid JSON
	}

	return components;
}

export const pythonDetectors: Detector[] = [
	{
		name: 'Python poetry.lock',
		patterns: ['poetry.lock'],
		detect: (_filePath, content) => {
			return parsePoetryLock(content);
		},
	},
	{
		name: 'Python Pipfile.lock',
		patterns: ['Pipfile.lock'],
		detect: (_filePath, content) => {
			return parsePipfileLock(content);
		},
	},
	{
		name: 'Python requirements.txt',
		patterns: ['requirements.txt'],
		detect: (_filePath, content) => {
			return parseRequirementsTxt(content);
		},
	},
];
