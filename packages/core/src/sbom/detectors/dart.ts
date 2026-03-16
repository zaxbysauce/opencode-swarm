/**
 * Dart/Flutter Detector
 *
 * Supports: pubspec.yaml, pubspec.lock
 */

import type { Detector, SbomComponent } from './index.js';
import { generatePurl } from './index.js';

/**
 * Parse pubspec.lock (YAML format)
 *
 * Format:
 * packages:
 *   flutter:
 *     dependency: "direct dev"
 *     description: flutter
 *     name: flutter
 *     source: sdk
 *     version: "0.0.0"
 *
 *   http:
 *     dependency: "direct main"
 *     description:
 *       name: http
 *       url: "https://pub.dartlang.org"
 *     source: hosted
 *     version: "1.0.0"
 */
function parsePubspecLock(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	// Simple YAML parsing - look for packages: section
	const packagesMatch = content.match(/^packages:\s*$/m);
	if (!packagesMatch) return components;

	const lines = content.split('\n');
	let inPackages = false;
	let currentPackage = '';
	let currentVersion = '';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.replace(/^ {2}/, ''); // Remove 2-space indentation

		if (trimmed === 'packages:' || trimmed.startsWith('packages:')) {
			inPackages = true;
			continue;
		}

		if (!inPackages) continue;

		// Check if we're starting a new package (2-space indent at column 0 after packages section)
		const packageMatch = line.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/);
		if (packageMatch) {
			// Save previous package if exists
			if (currentPackage && currentVersion) {
				components.push({
					name: currentPackage,
					version: currentVersion,
					type: 'library',
					purl: generatePurl('pub', currentPackage, currentVersion),
				});
			}
			currentPackage = packageMatch[1];
			currentVersion = '';
			continue;
		}

		// Look for version in current package
		if (currentPackage && line.includes('version:')) {
			const versionMatch = line.match(/version:\s*"([^"]+)"/);
			if (versionMatch) {
				currentVersion = versionMatch[1];
			}
		}
	}

	// Don't forget the last package
	if (currentPackage && currentVersion) {
		components.push({
			name: currentPackage,
			version: currentVersion,
			type: 'library',
			purl: generatePurl('pub', currentPackage, currentVersion),
		});
	}

	return components;
}

/**
 * Parse pubspec.yaml (Dart manifest)
 *
 * Format:
 * name: my_app
 * version: 1.0.0
 *
 * dependencies:
 *   flutter:
 *     sdk: flutter
 *   http: ^1.0.0
 *   provider: ^6.0.0
 */
function parsePubspecYaml(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];
	const lines = content.split('\n');

	let inDependencies = false;
	let inDevDependencies = false;

	for (const line of lines) {
		const trimmed = line.trim();

		// Track sections - only match section headers that end with colon (no trailing content)
		if (trimmed === 'dependencies:') {
			inDependencies = true;
			inDevDependencies = false;
			continue;
		}
		if (trimmed === 'dev_dependencies:') {
			inDependencies = false;
			inDevDependencies = true;
			continue;
		}
		// Skip other YAML sections that are not dependency declarations
		if (
			trimmed === 'dependencies_overrides:' ||
			trimmed === 'dev_dependencies_overrides:' ||
			trimmed.startsWith('environment:')
		) {
			inDependencies = false;
			inDevDependencies = false;
			continue;
		}

		// End of all dependencies
		if (!inDependencies && !inDevDependencies) continue;

		// Skip empty lines, comments, and sdk references
		if (!trimmed || trimmed.startsWith('#') || trimmed.includes('sdk:'))
			continue;

		// Match dependency lines like: package_name: ^1.0.0
		// or: package_name: { host: "..." }
		const match = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.+)?$/);
		if (match) {
			const name = match[1];
			const value = match[2] || '';

			// Skip things that are clearly not dependencies
			if (name === 'flutter' || name === 'environment') continue;

			// Extract version - try various formats
			let version = 'unknown';

			// Format: ^1.0.0 or >=1.0.0
			const caretMatch = value.match(/\^?([\d.]+)/);
			if (caretMatch) {
				version = caretMatch[1];
			}

			// Check for hosted package with specific version
			const hostedMatch = value.match(/version:\s*"?\^?([\d.]+)/);
			if (hostedMatch) {
				version = hostedMatch[1];
			}

			if (name && version !== 'unknown') {
				components.push({
					name,
					version,
					type: 'library',
					purl: generatePurl('pub', name, version),
				});
			}
		}
	}

	return components;
}

export const dartDetectors: Detector[] = [
	{
		name: 'Dart pubspec.lock',
		patterns: ['pubspec.lock'],
		detect: (_filePath, content) => {
			return parsePubspecLock(content);
		},
	},
	{
		name: 'Dart pubspec.yaml',
		patterns: ['pubspec.yaml'],
		detect: (_filePath, content) => {
			return parsePubspecYaml(content);
		},
	},
];
