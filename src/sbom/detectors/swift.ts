/**
 * Swift Detector
 *
 * Supports: Package.resolved
 */

import type { Detector, SbomComponent } from './index.js';
import { generatePurl } from './index.js';

/**
 * Parse Package.resolved (Swift Package Manager pins file)
 *
 * Format:
 * {
 *   "pins" : [
 *     {
 *       "identity" : "swift-algorithms",
 *       "kind" : "remoteSourceControl",
 *       "location" : "https://github.com/apple/swift-algorithms",
 *       "state" : {
 *         "version" : "1.0.0"
 *       }
 *     }
 *   ]
 * }
 */
function parsePackageResolved(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	try {
		const resolved = JSON.parse(content);

		const pins = resolved.pins || [];

		for (const pin of pins) {
			const identity = pin.identity || pin.package || '';
			const state = pin.state || {};
			const version = state.version || state.revision || '';

			// Try to extract org from location URL
			let org = '';
			const location = pin.location || '';
			const orgMatch = location.match(/github\.com\/([^/]+)\//);
			if (orgMatch) {
				org = orgMatch[1];
			}

			if (identity && version) {
				components.push({
					name: identity,
					version,
					type: 'library',
					purl: generatePurl('swift', identity, version, org || undefined),
				});
			}
		}
	} catch {
		// Invalid JSON
	}

	return components;
}

export const swiftDetectors: Detector[] = [
	{
		name: 'Swift Package.resolved',
		patterns: ['Package.resolved'],
		detect: (_filePath, content) => {
			return parsePackageResolved(content);
		},
	},
];
