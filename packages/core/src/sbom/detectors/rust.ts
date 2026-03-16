/**
 * Rust Detector
 *
 * Supports: Cargo.toml, Cargo.lock
 */

import type { Detector, SbomComponent } from './index.js';
import { generatePurl } from './index.js';

/**
 * Parse Cargo.toml dependencies (manifest)
 */
function parseCargoToml(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	// Simple regex-based parsing for dependencies section
	// This is best-effort since TOML parsing is complex
	const lines = content.split('\n');
	let inDependencies = false;
	let inDevDependencies = false;

	for (const line of lines) {
		const trimmed = line.trim();

		// Track which section we're in
		if (trimmed === '[dependencies]' || trimmed.startsWith('[dependencies]')) {
			inDependencies = true;
			inDevDependencies = false;
			continue;
		}
		if (
			trimmed === '[dev-dependencies]' ||
			trimmed.startsWith('[dev-dependencies]')
		) {
			inDependencies = false;
			inDevDependencies = true;
			continue;
		}
		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			inDependencies = false;
			inDevDependencies = false;
			continue;
		}

		if (!inDependencies && !inDevDependencies) continue;
		if (!trimmed || trimmed.startsWith('#')) continue;

		// Match dependency lines like:
		// serde = "1.0"
		// serde = { version = "1.0", features = [...] }
		// rand = { version = "0.8", package = "rand" }

		const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=/);
		if (match) {
			const name = match[1];

			// Try to extract version from various formats
			let version = 'unknown';

			// Simple version: name = "1.0"
			const simpleMatch = trimmed.match(/"([\d.]+)"/);
			if (simpleMatch) {
				version = simpleMatch[1];
			} else {
				// Try version field: name = { version = "1.0" }
				const versionFieldMatch = trimmed.match(/version\s*=\s*"([\d.]+)"/);
				if (versionFieldMatch) {
					version = versionFieldMatch[1];
				}
			}

			if (name && version !== 'unknown') {
				components.push({
					name,
					version,
					type: 'library',
					purl: generatePurl('cargo', name, version),
				});
			}
		}
	}

	return components;
}

/**
 * Parse Cargo.lock (TOML with [[package]] entries)
 *
 * Format:
 * [[package]]
 * name = "serde"
 * version = "1.0.139"
 * source = "registry+https://github.com/rust-lang/crates.io-index"
 */
function parseCargoLock(content: string): SbomComponent[] {
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

			components.push({
				name,
				version,
				type: 'library',
				purl: generatePurl('cargo', name, version),
			});
		}
	}

	return components;
}

export const rustDetectors: Detector[] = [
	{
		name: 'Rust Cargo.lock',
		patterns: ['Cargo.lock'],
		detect: (_filePath, content) => {
			return parseCargoLock(content);
		},
	},
	{
		name: 'Rust Cargo.toml',
		patterns: ['Cargo.toml'],
		detect: (_filePath, content) => {
			return parseCargoToml(content);
		},
	},
];
