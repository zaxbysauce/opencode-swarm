/**
 * SBOM Detector Tests
 * 
 * Tests for manifest/lock file detectors across 8 ecosystems
 */

import { describe, it, expect } from 'bun:test';
import {
  generatePurl,
  detectEcosystemFromPath,
  findDetectorsForFile,
  detectComponents,
  allDetectors,
  SbomComponent,
} from '../../../src/sbom/detectors/index.js';

// Test fixtures - real-world lock file contents
const fixtures = {
  packageJson: JSON.stringify({
    name: 'test-project',
    version: '1.0.0',
    dependencies: {
      express: '^4.18.0',
      lodash: '~4.17.21',
    },
    devDependencies: {
      typescript: '^5.0.0',
      jest: '^29.0.0',
    },
  }),

  packageLock: JSON.stringify({
    lockfileVersion: 2,
    packages: {
      '': {
        name: 'test-project',
        version: '1.0.0',
      },
      'node_modules/express': {
        version: '4.18.2',
        resolved: 'https://registry.npmjs.org/express/-/express-4.18.2.tgz',
        integrity: 'sha-5etu',
        license: 'MIT',
      },
      'node_modules/lodash': {
        version: '4.17.21',
        resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
        integrity: 'sha512-v2',
      },
    },
  }),

  yarnLock: `lodash@4.17.21:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz###679591c564c3b2aa6e3a6eeaab10a6bbbfe23d16"
  integrity sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==

express@^4.18.0:
  version "4.18.2"
  resolved "https://registry.yarnpkg.com/express/-/express-4.18.2.tgz#3fabe00696fbe02862c66c4dd4e095a82f212a62"
  integrity sha512-5/5et1yqKGdTQX8LIjQSuK5GqGEq6Mw5Ssu4GLHx7Yz4y7lz+JJ8VpxuYk9L3N5tsqkYnF1ZZ2dGvUNzGO5w==`,

  pnpmLock: `# pnpm lock file
/packages:
  /express@4.18.2:
    resolution: {integrity: sha512-5/5etu}
    version: 4.18.2
  /lodash@4.17.21:
    resolution: {integrity: sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==
  /typescript@5.0.4:
    resolution: {integrity: sha512-rW3XW392hN5HHZ3}
    version: 5.0.4`,

  requirementsTxt: `# Requirements file
requests==2.28.0
flask>=2.0.0
django~=4.2
urllib3
# Comment
numpy
`,
  // Note: pip doesn't typically have multiline format this way, but for testing

  poetryLock: `# poetry.lock
[[package]]
name = "requests"
version = "2.28.0"
description = "Python HTTP for Humans."
license = "Apache-2.0"

[[package]]
name = "flask"
version = "2.2.2"
description = "A simple framework for building complex web applications."
license = "BSD-3-Clause"

[metadata]
lock-version = "2.0"
python-versions = ">=3.7"
`,

  pipfileLock: JSON.stringify({
    default: {
      requests: { version: '==2.28.0' },
      flask: { version: '==2.2.2' },
    },
    develop: {
      pytest: { version: '==7.2.0' },
    },
  }),

  cargoLock: `# Cargo.lock
[[package]]
name = "serde"
version = "1.0.139"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "tokio"
version = "1.27.0"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "actix-web"
version = "4.3.1"
source = "registry+https://github.com/rust-lang/crates.io-index"
`,

  goSum: `# go.sum
github.com/pkg/errors v0.9.1 h1:FEBLx1zS214owpjy7qsBeixbURkuhQAwrK5UwLGTwt4=
github.com/pkg/errors v0.9.1/go.mod h1:bwawxfHBFNV+L2hUp1rHADufV3IMtnDRdf1r5NINEl0=
golang.org/x/crypto v0.14.0 h1:wBqGXzWJW6m1XrIKlAH0Hs1JJ7+9KBwnIO8v66Q9cHc=
golang.org/x/crypto v0.14.0/go.mod h1:MVFd36DqK4CsrnJYDkBA3VC4m2GkXAM0PvzMCn4JQf4=
`,

  goMod: `module github.com/user/project

go 1.19

require (
	github.com/pkg/errors v0.9.1
	golang.org/x/crypto v0.14.0
)
`,

  pomXml: `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>my-app</artifactId>
  <version>1.0.0</version>
  
  <dependencies>
    <dependency>
      <groupId>org.apache.commons</groupId>
      <artifactId>commons-lang3</artifactId>
      <version>3.12.0</version>
    </dependency>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>6.0.0</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
`,

  gradleLockfile: `# Gradle lockfile
dependencies:
  org.apache.commons:commons-lang3:3.12.0=compileClasspath
  org.springframework:spring-core:6.0.0=implementation

metadata:
  org.apache.commons:commons-lang3:
    version: '3.12'
`,

  packagesLockJson: JSON.stringify({
    version: 2,
    dependencies: {
      'net6.0': {
        'Newtonsoft.Json': {
          type: 'Direct',
          requested: '[13.0.1, )',
          resolved: '13.0.1',
        },
      },
    },
    targets: {
      'net6.0': {
        'Newtonsoft.Json/13.0.1': {
          type: 'Direct',
          dependencies: {},
        },
      },
    },
  }),

  paketLock: `NUGET
  remote: https://www.nuget.org/api/v2
    Newtonsoft.Json (13.0.1)
      -> Newtonsoft.Json (13.0.1)
    Microsoft.AspNetCore.App (2.2.0)
      -> Microsoft.NETCore.App (2.2.0)
`,

  packageResolved: JSON.stringify({
    pins: [
      {
        identity: 'swift-algorithms',
        kind: 'remoteSourceControl',
        location: 'https://github.com/apple/swift-algorithms',
        state: { version: '1.0.0' },
      },
      {
        identity: 'async-http-client',
        kind: 'remoteSourceControl',
        location: 'https://github.com/swift-server/async-http-client',
        state: { version: '1.19.0' },
      },
    ],
  }),

  pubspecLock: `# Pub lockfile
packages:
  http:
    dependency: "direct main"
    description:
      name: http
      url: "https://pub.dartlang.org"
    source: hosted
    version: "1.0.0"
  provider:
    dependency: "direct main"
    description:
      name: provider
      url: "https://pub.dartlang.org"
    source: hosted
    version: "6.0.0"
`,

  pubspecYaml: `name: my_app
version: 1.0.0

dependencies:
  flutter:
    sdk: flutter
  http: ^1.0.0
  provider: ^6.0.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  test: ^1.0.0
`,

  // Note: pubspec.yaml uses 2-space indentation, so lines under dependencies have 2 spaces,
};

describe('SBOM Detectors', () => {
  describe('PURL Generation', () => {
    it('should generate npm PURLs', () => {
      expect(generatePurl('npm', 'express', '4.18.2')).toBe('pkg:npm/express@4.18.2');
    });

    it('should generate pypi PURLs', () => {
      expect(generatePurl('pypi', 'requests', '2.28.0')).toBe('pkg:pypi/requests@2.28.0');
    });

    it('should generate cargo PURLs', () => {
      expect(generatePurl('cargo', 'serde', '1.0.139')).toBe('pkg:cargo/serde@1.0.139');
    });

    it('should generate golang PURLs with namespace', () => {
      expect(generatePurl('golang', 'errors', 'v0.9.1', 'github.com/pkg')).toBe(
        'pkg:golang/github.com/pkg/errors@v0.9.1'
      );
    });

    it('should generate maven PURLs with group', () => {
      expect(generatePurl('maven', 'commons-lang3', '3.12.0', 'org.apache.commons')).toBe(
        'pkg:maven/org.apache.commons/commons-lang3@3.12.0'
      );
    });

    it('should generate nuget PURLs', () => {
      expect(generatePurl('nuget', 'Newtonsoft.Json', '13.0.1')).toBe(
        'pkg:nuget/Newtonsoft.Json@13.0.1'
      );
    });

    it('should generate swift PURLs with org', () => {
      expect(generatePurl('swift', 'swift-algorithms', '1.0.0', 'apple')).toBe(
        'pkg:swift/apple/swift-algorithms@1.0.0'
      );
    });

    it('should generate pub PURLs', () => {
      expect(generatePurl('pub', 'http', '1.0.0')).toBe('pkg:pub/http@1.0.0');
    });

    it('should encode special characters in PURL', () => {
      expect(generatePurl('npm', '@scope/package', '1.0.0')).toBe('pkg:npm/%40scope%2Fpackage@1.0.0');
    });
  });

  describe('Ecosystem Detection', () => {
    it('should detect npm from package.json', () => {
      expect(detectEcosystemFromPath('package.json')).toBe('npm');
    });

    it('should detect npm from package-lock.json', () => {
      expect(detectEcosystemFromPath('package-lock.json')).toBe('npm');
    });

    it('should detect npm from yarn.lock', () => {
      expect(detectEcosystemFromPath('yarn.lock')).toBe('npm');
    });

    it('should detect npm from pnpm-lock.yaml', () => {
      expect(detectEcosystemFromPath('pnpm-lock.yaml')).toBe('npm');
    });

    it('should detect pypi from requirements.txt', () => {
      expect(detectEcosystemFromPath('requirements.txt')).toBe('pypi');
    });

    it('should detect pypi from poetry.lock', () => {
      expect(detectEcosystemFromPath('poetry.lock')).toBe('pypi');
    });

    it('should detect pypi from Pipfile.lock', () => {
      expect(detectEcosystemFromPath('Pipfile.lock')).toBe('pypi');
    });

    it('should detect cargo from Cargo.lock', () => {
      expect(detectEcosystemFromPath('Cargo.lock')).toBe('cargo');
    });

    it('should detect cargo from Cargo.toml', () => {
      expect(detectEcosystemFromPath('Cargo.toml')).toBe('cargo');
    });

    it('should detect golang from go.mod', () => {
      expect(detectEcosystemFromPath('go.mod')).toBe('golang');
    });

    it('should detect golang from go.sum', () => {
      expect(detectEcosystemFromPath('go.sum')).toBe('golang');
    });

    it('should detect maven from pom.xml', () => {
      expect(detectEcosystemFromPath('pom.xml')).toBe('maven');
    });

    it('should detect maven from gradle.lockfile', () => {
      expect(detectEcosystemFromPath('gradle.lockfile')).toBe('maven');
    });

    it('should detect nuget from packages.lock.json', () => {
      expect(detectEcosystemFromPath('packages.lock.json')).toBe('nuget');
    });

    it('should detect nuget from paket.lock', () => {
      expect(detectEcosystemFromPath('paket.lock')).toBe('nuget');
    });

    it('should detect swift from Package.resolved', () => {
      expect(detectEcosystemFromPath('Package.resolved')).toBe('swift');
    });

    it('should detect pub from pubspec.lock', () => {
      expect(detectEcosystemFromPath('pubspec.lock')).toBe('pub');
    });

    it('should detect pub from pubspec.yaml', () => {
      expect(detectEcosystemFromPath('pubspec.yaml')).toBe('pub');
    });

    it('should return null for unknown files', () => {
      expect(detectEcosystemFromPath('unknown.txt')).toBeNull();
    });
  });

  describe('Node.js Detectors', () => {
    it('should parse package.json', () => {
      const components = detectComponents('package.json', fixtures.packageJson);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'express')).toBeDefined();
      expect(components.find(c => c.name === 'lodash')).toBeDefined();
    });

    it('should parse package-lock.json', () => {
      const components = detectComponents('package-lock.json', fixtures.packageLock);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'express')?.version).toBe('4.18.2');
    });

    it('should parse yarn.lock', () => {
      const components = detectComponents('yarn.lock', fixtures.yarnLock);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'lodash')?.version).toBe('4.17.21');
    });

    it('should parse pnpm-lock.yaml', () => {
      const components = detectComponents('pnpm-lock.yaml', fixtures.pnpmLock);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should generate correct PURLs for npm packages', () => {
      const components = detectComponents('package.json', fixtures.packageJson);
      const express = components.find(c => c.name === 'express');
      expect(express?.purl).toBe('pkg:npm/express@4.18.0');
    });
  });

  describe('Python Detectors', () => {
    it('should parse requirements.txt', () => {
      const components = detectComponents('requirements.txt', fixtures.requirementsTxt);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'requests')?.version).toBe('2.28.0');
    });

    it('should parse poetry.lock', () => {
      const components = detectComponents('poetry.lock', fixtures.poetryLock);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'requests')?.version).toBe('2.28.0');
      expect(components.find(c => c.name === 'requests')?.license).toBe('Apache-2.0');
    });

    it('should parse Pipfile.lock', () => {
      const components = detectComponents('Pipfile.lock', fixtures.pipfileLock);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'requests')?.version).toBe('2.28.0');
    });
  });

  describe('Rust Detectors', () => {
    it('should parse Cargo.lock', () => {
      const components = detectComponents('Cargo.lock', fixtures.cargoLock);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'serde')?.version).toBe('1.0.139');
    });
  });

  describe('Go Detectors', () => {
    it('should parse go.sum', () => {
      const components = detectComponents('go.sum', fixtures.goSum);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'errors')?.version).toBe('v0.9.1');
    });

    it('should parse go.mod', () => {
      const components = detectComponents('go.mod', fixtures.goMod);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'errors')?.version).toBe('v0.9.1');
    });

    it('should generate golang PURLs with namespace', () => {
      const components = detectComponents('go.sum', fixtures.goSum);
      const pkg = components.find(c => c.name === 'errors');
      expect(pkg?.purl).toContain('github.com/pkg');
    });
  });

  describe('Java Detectors', () => {
    it('should parse pom.xml', () => {
      const components = detectComponents('pom.xml', fixtures.pomXml);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'commons-lang3')?.version).toBe('3.12.0');
    });

    it('should skip test-scoped dependencies', () => {
      const components = detectComponents('pom.xml', fixtures.pomXml);
      expect(components.find(c => c.name === 'spring-core')).toBeUndefined();
    });

    it('should parse gradle.lockfile', () => {
      const components = detectComponents('gradle.lockfile', fixtures.gradleLockfile);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'commons-lang3')?.version).toBe('3.12.0');
    });

    it('should generate maven PURLs with group', () => {
      const components = detectComponents('pom.xml', fixtures.pomXml);
      const pkg = components.find(c => c.name === 'commons-lang3');
      expect(pkg?.purl).toContain('org.apache.commons');
    });
  });

  describe('.NET Detectors', () => {
    it('should parse packages.lock.json', () => {
      const components = detectComponents('packages.lock.json', fixtures.packagesLockJson);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'Newtonsoft.Json')?.version).toBe('13.0.1');
    });

    it('should parse paket.lock', () => {
      const components = detectComponents('paket.lock', fixtures.paketLock);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'Newtonsoft.Json')?.version).toBe('13.0.1');
    });
  });

  describe('Swift Detectors', () => {
    it('should parse Package.resolved', () => {
      const components = detectComponents('Package.resolved', fixtures.packageResolved);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'swift-algorithms')?.version).toBe('1.0.0');
    });
  });

  describe('Dart Detectors', () => {
    it('should parse pubspec.lock', () => {
      const components = detectComponents('pubspec.lock', fixtures.pubspecLock);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'http')?.version).toBe('1.0.0');
    });

    it('should parse pubspec.yaml', () => {
      const components = detectComponents('pubspec.yaml', fixtures.pubspecYaml);
      expect(components.length).toBeGreaterThan(0);
      expect(components.find(c => c.name === 'http')?.version).toBe('1.0.0');
    });
  });

  describe('Registry', () => {
    it('should have detectors for all ecosystems', () => {
      const detectorNames = allDetectors.map(d => d.name);
      expect(detectorNames).toContain('Node.js package-lock.json');
      expect(detectorNames).toContain('Node.js yarn.lock');
      expect(detectorNames).toContain('Node.js pnpm-lock.yaml');
      expect(detectorNames).toContain('Node.js package.json');
      expect(detectorNames).toContain('Python poetry.lock');
      expect(detectorNames).toContain('Python requirements.txt');
      expect(detectorNames).toContain('Rust Cargo.lock');
      expect(detectorNames).toContain('Go go.sum');
      expect(detectorNames).toContain('Java pom.xml');
      expect(detectorNames).toContain('.NET packages.lock.json');
      expect(detectorNames).toContain('Swift Package.resolved');
      expect(detectorNames).toContain('Dart pubspec.lock');
    });

    it('should find detectors by file path', () => {
      const detectors = findDetectorsForFile('package-lock.json');
      expect(detectors.length).toBeGreaterThan(0);
      expect(detectors[0].patterns).toContain('package-lock.json');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content gracefully', () => {
      const components = detectComponents('package.json', '');
      expect(components).toEqual([]);
    });

    it('should handle malformed JSON gracefully', () => {
      const components = detectComponents('package.json', 'not valid json');
      expect(components).toEqual([]);
    });

    it('should handle invalid XML gracefully', () => {
      const components = detectComponents('pom.xml', 'not valid xml');
      expect(components).toEqual([]);
    });

    it('should return empty array for unknown files', () => {
      const components = detectComponents('unknown.xyz', 'some content');
      expect(components).toEqual([]);
    });

    it('should handle case-insensitive file matching', () => {
      const detectors = findDetectorsForFile('PACKAGE.JSON');
      expect(detectors.length).toBeGreaterThan(0);
    });
  });

  describe('Component Types', () => {
    it('should set correct type for libraries', () => {
      const components = detectComponents('package-lock.json', fixtures.packageLock);
      for (const comp of components) {
        expect(['library', 'framework', 'application']).toContain(comp.type);
      }
    });
  });
});
