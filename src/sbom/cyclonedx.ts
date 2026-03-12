/**
 * CycloneDX SBOM Emitter
 *
 * Generates CycloneDX BOM format (v1.5 spec)
 */

import type { SbomComponent } from './detectors/index.js';
import { type Ecosystem, generatePurl } from './detectors/index.js';

/**
 * CycloneDX Component
 * Corresponds to a software dependency
 */
export interface CycloneDXComponent {
	/** Component type */
	type: 'library' | 'framework' | 'application';
	/** Package name */
	name: string;
	/** Package version */
	version: string;
	/** Package URL (PURL) */
	purl?: string;
	/** License information */
	licenses?: [{ license: { id?: string; name?: string } }];
}

/**
 * CycloneDX Metadata
 */
export interface CycloneDXMetadata {
	/** ISO 8601 timestamp */
	timestamp: string;
	/** Tools used to create the BOM */
	tools: [
		{
			/** Tool vendor */
			vendor: string;
			/** Tool name */
			name: string;
			/** Tool version */
			version: string;
		},
	];
}

/**
 * CycloneDX BOM Document
 * Conforms to CycloneDX v1.5 specification
 */
export interface CycloneDXBom {
	/** BOM format identifier */
	bomFormat: 'CycloneDX';
	/** CycloneDX specification version */
	specVersion: '1.5';
	/** Incremental BOM version */
	version: number;
	/** BOM metadata */
	metadata: CycloneDXMetadata;
	/** List of components */
	components: CycloneDXComponent[];
}

/**
 * Options for generating CycloneDX BOM
 */
export interface CycloneDXOptions {
	/** Custom tool name (default: 'sbom_generate') */
	toolName?: string;
	/** Custom tool version (default: '6.9.0') */
	toolVersion?: string;
	/** BOM version number (default: 1) */
	bomVersion?: number;
}

/**
 * Default tool information
 */
const DEFAULT_TOOL_VENDOR = 'opencode-swarm';
const DEFAULT_TOOL_NAME = 'sbom_generate';
const DEFAULT_TOOL_VERSION = '6.9.0';

/**
 * Convert an SbomComponent to a CycloneDXComponent
 */
function toCycloneDXComponent(component: SbomComponent): CycloneDXComponent {
	const cyclonedxComponent: CycloneDXComponent = {
		type: component.type,
		name: component.name,
		version: component.version,
	};

	// Use existing PURL if available, otherwise it might be generated later
	if (component.purl) {
		cyclonedxComponent.purl = component.purl;
	}

	// Add license information if available
	if (component.license) {
		// SPDX license identifiers typically start with a letter and contain only
		// alphanumeric characters, dots, hyphens, and plus signs
		const isSpdxId = /^[A-Za-z][A-Za-z0-9.*+-]*$/.test(component.license);

		cyclonedxComponent.licenses = [
			{
				license: isSpdxId
					? { id: component.license }
					: { name: component.license },
			},
		];
	}

	return cyclonedxComponent;
}

/**
 * Generate a CycloneDX BOM from SBOM components
 *
 * @param components - List of SBOM components
 * @param options - Optional configuration
 * @returns CycloneDX BOM object
 */
export function generateCycloneDX(
	components: SbomComponent[],
	options?: CycloneDXOptions,
): CycloneDXBom {
	const toolName = options?.toolName ?? DEFAULT_TOOL_NAME;
	const toolVersion = options?.toolVersion ?? DEFAULT_TOOL_VERSION;
	const bomVersion = options?.bomVersion ?? 1;

	// Generate timestamp in ISO 8601 format
	const timestamp = new Date().toISOString();

	// Convert components to CycloneDX format
	const cyclonedxComponents = components.map(toCycloneDXComponent);

	// Build the BOM
	const bom: CycloneDXBom = {
		bomFormat: 'CycloneDX',
		specVersion: '1.5',
		version: bomVersion,
		metadata: {
			timestamp,
			tools: [
				{
					vendor: DEFAULT_TOOL_VENDOR,
					name: toolName,
					version: toolVersion,
				},
			],
		},
		components: cyclonedxComponents,
	};

	return bom;
}

/**
 * Serialize a CycloneDX BOM to a JSON string
 *
 * @param bom - CycloneDX BOM object
 * @returns JSON string representation
 */
export function serializeCycloneDX(bom: CycloneDXBom): string {
	return JSON.stringify(bom, null, 2);
}

/**
 * Generate PURL for a component based on its ecosystem
 * This is a convenience function that can be used externally
 *
 * @param ecosystem - The package ecosystem
 * @param name - Package name
 * @param version - Package version
 * @param namespace - Optional namespace (for golang, maven, swift)
 * @returns Package URL
 */
export function generateComponentPurl(
	ecosystem: Ecosystem,
	name: string,
	version: string,
	namespace?: string,
): string {
	return generatePurl(ecosystem, name, version, namespace);
}

export type { Ecosystem, SbomComponent } from './detectors/index.js';
export { generatePurl } from './detectors/index.js';
