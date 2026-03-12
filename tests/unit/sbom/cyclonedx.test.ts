/**
 * CycloneDX Emitter Tests
 */

import {
	generateCycloneDX,
	serializeCycloneDX,
	generateComponentPurl,
	type CycloneDXBom,
	type CycloneDXComponent,
} from '../../../src/sbom/cyclonedx.js';
import { describe, expect, test, beforeEach } from 'bun:test';

describe('CycloneDX Emitter', () => {
	const minimalComponents = [
		{
			name: 'lodash',
			version: '4.17.21',
			type: 'library' as const,
			purl: 'pkg:npm/lodash@4.17.21',
		},
	];

	const componentsWithLicenses = [
		{
			name: 'express',
			version: '4.18.2',
			type: 'library' as const,
			license: 'MIT',
			purl: 'pkg:npm/express@4.18.2',
		},
		{
			name: 'react',
			version: '17.0.2',
			type: 'library' as const,
			license: 'MIT',
			purl: 'pkg:npm/react@17.0.2',
		},
	];

	const componentsNoPurl = [
		{
			name: 'my-package',
			version: '1.0.0',
			type: 'library' as const,
		},
	];

	describe('generateCycloneDX', () => {
		test('generates valid CycloneDX BOM with minimal components', () => {
			const bom = generateCycloneDX(minimalComponents);

			expect(bom.bomFormat).toBe('CycloneDX');
			expect(bom.specVersion).toBe('1.5');
			expect(bom.version).toBe(1);
			expect(bom.metadata).toBeDefined();
			expect(bom.metadata.timestamp).toBeDefined();
			expect(bom.metadata.tools).toHaveLength(1);
			expect(bom.metadata.tools[0].vendor).toBe('opencode-swarm');
			expect(bom.metadata.tools[0].name).toBe('sbom_generate');
			expect(bom.metadata.tools[0].version).toBe('6.9.0');
			expect(bom.components).toHaveLength(1);
		});

		test('generates BOM with correct component structure', () => {
			const bom = generateCycloneDX(minimalComponents);
			const component = bom.components[0] as CycloneDXComponent;

			expect(component.type).toBe('library');
			expect(component.name).toBe('lodash');
			expect(component.version).toBe('4.17.21');
			expect(component.purl).toBe('pkg:npm/lodash@4.17.21');
		});

		test('handles custom tool name and version', () => {
			const bom = generateCycloneDX(minimalComponents, {
				toolName: 'custom-tool',
				toolVersion: '2.0.0',
			});

			expect(bom.metadata.tools[0].name).toBe('custom-tool');
			expect(bom.metadata.tools[0].version).toBe('2.0.0');
		});

		test('handles custom BOM version', () => {
			const bom = generateCycloneDX(minimalComponents, {
				bomVersion: 5,
			});

			expect(bom.version).toBe(5);
		});

		test('handles empty components array', () => {
			const bom = generateCycloneDX([]);

			expect(bom.components).toHaveLength(0);
		});

		test('handles multiple components', () => {
			const components = [
				{ name: 'pkg1', version: '1.0.0', type: 'library' as const },
				{ name: 'pkg2', version: '2.0.0', type: 'library' as const },
				{ name: 'pkg3', version: '3.0.0', type: 'application' as const },
			];
			const bom = generateCycloneDX(components);

			expect(bom.components).toHaveLength(3);
			expect(bom.components[0].name).toBe('pkg1');
			expect(bom.components[1].name).toBe('pkg2');
			expect(bom.components[2].name).toBe('pkg3');
			expect(bom.components[2].type).toBe('application');
		});

		test('includes license information when available', () => {
			const bom = generateCycloneDX(componentsWithLicenses);

			expect(bom.components[0].licenses).toBeDefined();
			expect(bom.components[0].licenses).toHaveLength(1);
			expect(bom.components[0].licenses?.[0].license.id).toBe('MIT');
		});

		test('handles SPDX license identifiers correctly', () => {
			const components = [
				{
					name: 'pkg',
					version: '1.0.0',
					type: 'library' as const,
					license: 'Apache-2.0',
				},
			];
			const bom = generateCycloneDX(components);

			expect(bom.components[0].licenses?.[0].license.id).toBe('Apache-2.0');
		});

		test('handles non-SPDX license names', () => {
			const components = [
				{
					name: 'pkg',
					version: '1.0.0',
					type: 'library' as const,
					license: 'Custom License',
				},
			];
			const bom = generateCycloneDX(components);

			expect(bom.components[0].licenses?.[0].license.name).toBe(
				'Custom License',
			);
			expect(bom.components[0].licenses?.[0].license.id).toBeUndefined();
		});

		test('preserves existing PURL when provided', () => {
			const bom = generateCycloneDX(minimalComponents);

			expect(bom.components[0].purl).toBe('pkg:npm/lodash@4.17.21');
		});

		test('handles all component types (library, framework, application)', () => {
			const components = [
				{ name: 'lib1', version: '1.0.0', type: 'library' as const },
				{ name: 'fw1', version: '1.0.0', type: 'framework' as const },
				{ name: 'app1', version: '1.0.0', type: 'application' as const },
			];
			const bom = generateCycloneDX(components);

			expect(bom.components[0].type).toBe('library');
			expect(bom.components[1].type).toBe('framework');
			expect(bom.components[2].type).toBe('application');
		});
	});

	describe('serializeCycloneDX', () => {
		test('serializes BOM to valid JSON string', () => {
			const bom = generateCycloneDX(minimalComponents);
			const json = serializeCycloneDX(bom);

			expect(() => JSON.parse(json)).not.toThrow();
		});

		test('produces valid CycloneDX JSON structure', () => {
			const bom = generateCycloneDX(minimalComponents);
			const json = serializeCycloneDX(bom);
			const parsed = JSON.parse(json) as CycloneDXBom;

			expect(parsed.bomFormat).toBe('CycloneDX');
			expect(parsed.specVersion).toBe('1.5');
			expect(parsed.version).toBe(1);
			expect(parsed.metadata).toBeDefined();
			expect(parsed.components).toBeDefined();
		});

		test('formats JSON with 2-space indentation', () => {
			const bom = generateCycloneDX(minimalComponents);
			const json = serializeCycloneDX(bom);

			// Check that the JSON has indentation
			expect(json).toContain('\n  ');
		});
	});

	describe('generateComponentPurl', () => {
		test('generates npm PURL', () => {
			const purl = generateComponentPurl('npm', 'lodash', '4.17.21');
			expect(purl).toBe('pkg:npm/lodash@4.17.21');
		});

		test('generates pypi PURL', () => {
			const purl = generateComponentPurl('pypi', 'requests', '2.28.0');
			expect(purl).toBe('pkg:pypi/requests@2.28.0');
		});

		test('generates cargo PURL', () => {
			const purl = generateComponentPurl('cargo', 'serde', '1.0.0');
			expect(purl).toBe('pkg:cargo/serde@1.0.0');
		});

		test('generates golang PURL without namespace', () => {
			const purl = generateComponentPurl('golang', 'errors', '1.0.0');
			expect(purl).toBe('pkg:golang/errors@1.0.0');
		});

		test('generates golang PURL with namespace', () => {
			const purl = generateComponentPurl(
				'golang',
				'errors',
				'1.0.0',
				'github.com/pkg',
			);
			expect(purl).toBe('pkg:golang/github.com/pkg/errors@1.0.0');
		});

		test('generates maven PURL', () => {
			const purl = generateComponentPurl('maven', 'junit', '4.13.2', 'junit');
			expect(purl).toBe('pkg:maven/junit/junit@4.13.2');
		});

		test('generates nuget PURL', () => {
			const purl = generateComponentPurl('nuget', 'Newtonsoft.Json', '13.0.1');
			expect(purl).toBe('pkg:nuget/Newtonsoft.Json@13.0.1');
		});

		test('generates swift PURL without namespace', () => {
			const purl = generateComponentPurl('swift', 'Alamofire', '5.0.0');
			expect(purl).toBe('pkg:swift/Alamofire@5.0.0');
		});

		test('generates swift PURL with namespace', () => {
			const purl = generateComponentPurl(
				'swift',
				'Alamofire',
				'5.0.0',
				'Alamofire',
			);
			expect(purl).toBe('pkg:swift/Alamofire/Alamofire@5.0.0');
		});

		test('generates pub PURL', () => {
			const purl = generateComponentPurl('pub', 'flutter', '1.0.0');
			expect(purl).toBe('pkg:pub/flutter@1.0.0');
		});

		test('encodes special characters in PURL', () => {
			const purl = generateComponentPurl('npm', '@types/node', '18.0.0');
			expect(purl).toBe('pkg:npm/%40types%2Fnode@18.0.0');
		});
	});

	describe('Timestamp', () => {
		test('generates ISO 8601 compliant timestamp', () => {
			const bom = generateCycloneDX(minimalComponents);
			const timestamp = bom.metadata.timestamp;

			// ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
			expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
			expect(timestamp).toContain('Z');
		});
	});
});
