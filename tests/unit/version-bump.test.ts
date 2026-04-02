import { describe, expect, it } from 'bun:test';
import pkg from '../../package.json';

describe('Version Bump Verification', () => {
	it('should have a valid semver version', () => {
		const semverRegex = /^\d+\.\d+\.\d+$/;
		expect(pkg.version).toMatch(semverRegex);
	});

	it('should have a non-empty version', () => {
		expect(pkg.version).toBeTruthy();
		expect(pkg.version.length).toBeGreaterThan(0);
	});
});
