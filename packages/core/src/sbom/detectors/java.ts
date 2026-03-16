/**
 * Java Detector
 *
 * Supports: pom.xml, gradle.lockfile
 */

import type { Detector, SbomComponent } from './index.js';
import { generatePurl } from './index.js';

/**
 * Parse pom.xml (Maven POM file)
 *
 * Format:
 * <project>
 *   <dependencies>
 *     <dependency>
 *       <groupId>org.apache.commons</groupId>
 *       <artifactId>commons-lang3</artifactId>
 *       <version>3.12.0</version>
 *     </dependency>
 *   </dependencies>
 * </project>
 */
function parsePomXml(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	// Simple regex-based XML parsing
	// Find all dependency blocks
	const depBlocks = content.split(/<dependency>/);

	for (const block of depBlocks) {
		if (block.trim() === '') continue;

		const groupIdMatch = block.match(/<groupId>([^<]+)<\/groupId>/);
		const artifactIdMatch = block.match(/<artifactId>([^<]+)<\/artifactId>/);
		const versionMatch = block.match(/<version>([^<]+)<\/version>/);
		const scopeMatch = block.match(/<scope>([^<]+)<\/scope>/);

		if (groupIdMatch && artifactIdMatch) {
			const groupId = groupIdMatch[1];
			const artifactId = artifactIdMatch[1];
			const version = versionMatch?.[1] || 'unknown';

			// Skip test-only dependencies
			const scope = scopeMatch?.[1];
			if (scope === 'test') continue;

			// For Maven, the name is typically artifactId
			// The namespace (groupId) becomes part of the PURL
			components.push({
				name: artifactId,
				version,
				type: 'library',
				purl: generatePurl('maven', artifactId, version, groupId),
			});
		}
	}

	return components;
}

/**
 * Parse gradle.lockfile
 *
 * Format:
 * dependencies:
 *   org.apache.commons:commons-lang3:3.12.0=compileClasspath
 *   org.springframework:spring-core:5.3.27=implementation
 */
function parseGradleLockfile(content: string): SbomComponent[] {
	const components: SbomComponent[] = [];

	// Match: groupId:artifactId:version=scope
	const depRegex = /^([a-zA-Z0-9_.-]+):([a-zA-Z0-9_.-]+):([\d.]+)=/;
	const lines = content.split('\n');

	for (const line of lines) {
		const trimmed = line.trim();

		// Skip empty lines, comments, and metadata
		if (
			!trimmed ||
			trimmed.startsWith('#') ||
			trimmed.startsWith('metadata:')
		) {
			continue;
		}

		const match = trimmed.match(depRegex);
		if (match) {
			const groupId = match[1];
			const artifactId = match[2];
			const version = match[3];

			if (version && version !== 'unspecified') {
				components.push({
					name: artifactId,
					version,
					type: 'library',
					purl: generatePurl('maven', artifactId, version, groupId),
				});
			}
		}
	}

	return components;
}

export const javaDetectors: Detector[] = [
	{
		name: 'Java pom.xml',
		patterns: ['pom.xml'],
		detect: (_filePath, content) => {
			return parsePomXml(content);
		},
	},
	{
		name: 'Java gradle.lockfile',
		patterns: ['gradle.lockfile'],
		detect: (_filePath, content) => {
			return parseGradleLockfile(content);
		},
	},
];
