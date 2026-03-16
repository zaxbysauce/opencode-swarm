/**
 * Go Detector
 *
 * Supports: go.mod, go.sum
 */

import type { Detector, SbomComponent } from './index.js';
import { generatePurl } from './index.js';

/**
 * Parse go.mod
 *
 * Format:
 * module github.com/user/project
 * go 1.19
 *
 * require (
 *     github.com/pkg/errors v0.9.1
 *     golang.org/x/crypto v0.14.0
 * )
 */
function parseGoMod(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];
	const lines = content.split('\n');

	let inRequire = false;
	let moduleName = '';
	let moduleVersion = '';

	for (const line of lines) {
		const trimmed = line.trim();

		// Track require block
		if (trimmed === 'require (' || trimmed.startsWith('require (')) {
			inRequire = true;
			continue;
		}
		if (trimmed === ')' && inRequire) {
			inRequire = false;
			continue;
		}
		if (trimmed.startsWith('module ')) {
			// Main module
			const match = trimmed.match(/module\s+(.+?)(?:\s+v(.+))?$/);
			if (match) {
				moduleName = match[1];
				moduleVersion = match[2] || 'unknown';

				// Extract simple name from module path
				const simpleName = moduleName.split('/').pop() || moduleName;

				if (moduleName && moduleVersion !== 'unknown') {
					components.push({
						name: simpleName,
						version: moduleVersion,
						type: 'application',
						purl: generatePurl('golang', simpleName, moduleVersion, moduleName),
					});
				}
			}
			continue;
		}

		if (!inRequire) continue;
		if (!trimmed || trimmed.startsWith('//')) continue;

		// Match require lines like: github.com/pkg/errors v0.9.1
		const match = trimmed.match(/^(.+?)\s+(v?[\d.]+)/);
		if (match) {
			const fullName = match[1];
			const version = match[2];

			// For golang, the full module path becomes the namespace
			// and the last component becomes the name
			// e.g., github.com/pkg/errors -> namespace: github.com/pkg, name: errors
			const parts = fullName.split('/');
			const namespace = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
			const name = parts[parts.length - 1];

			components.push({
				name,
				version,
				type: 'library',
				purl: generatePurl('golang', name, version, namespace),
			});
		}
	}

	return components;
}

/**
 * Parse go.sum
 *
 * Format:
 * github.com/pkg/errors v0.9.1 h1:...
 * github.com/pkg/errors v0.9.1/go.mod h1:...
 */
function parseGoSum(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];
	const seen = new Set<string>();

	const lines = content.split('\n');

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		// Format: module version h1:hash
		// or: module version/go.mod h1:hash
		const match = trimmed.match(/^(.+?)\s+(v?[\d.rcbeta.]+)/);
		if (match) {
			const fullName = match[1];
			// Remove /go.mod suffix if present
			const cleanName = fullName.replace(/\/go\.mod$/, '');
			const version = match[2];

			const key = `${cleanName}@${version}`;
			if (seen.has(key)) continue;
			seen.add(key);

			// For golang, the full module path becomes the namespace
			// and the last component becomes the name
			const parts = cleanName.split('/');
			const namespace = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
			const name = parts[parts.length - 1];

			components.push({
				name,
				version,
				type: 'library',
				purl: generatePurl('golang', name, version, namespace),
			});
		}
	}

	return components;
}

export const goDetectors: Detector[] = [
	{
		name: 'Go go.sum',
		patterns: ['go.sum'],
		detect: (_filePath, content) => {
			return parseGoSum(content);
		},
	},
	{
		name: 'Go go.mod',
		patterns: ['go.mod'],
		detect: (_filePath, content) => {
			return parseGoMod(content);
		},
	},
];
