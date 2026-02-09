import { describe, test, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '../../');

describe('packaging smoke tests', () => {
    test('dist/index.js exists', () => {
        expect(existsSync(path.join(ROOT, 'dist/index.js'))).toBe(true);
    });

    test('dist/index.d.ts exists', () => {
        expect(existsSync(path.join(ROOT, 'dist/index.d.ts'))).toBe(true);
    });

    test('dist/cli/index.js exists', () => {
        expect(existsSync(path.join(ROOT, 'dist/cli/index.js'))).toBe(true);
    });

    test('dist/index.js is importable and exports a default function', async () => {
        const mod = await import(path.join(ROOT, 'dist/index.js'));
        expect(typeof mod.default).toBe('function');
    });

    test('plugin factory returns object with name property', async () => {
        const mod = await import(path.join(ROOT, 'dist/index.js'));
        // Call the plugin factory with a minimal context
        const plugin = await mod.default({ directory: ROOT });
        expect(plugin).toBeDefined();
        expect(typeof plugin.name).toBe('string');
        expect(plugin.name).toBe('opencode-swarm');
    });

    test('plugin factory returns object with hooks', async () => {
        const mod = await import(path.join(ROOT, 'dist/index.js'));
        const plugin = await mod.default({ directory: ROOT });
        // Plugin should have config and agent properties
        expect(plugin.config).toBeDefined();
        expect(typeof plugin.config).toBe('function');
    });

    test('dist/index.js file size is reasonable (< 5MB)', () => {
        const stats = Bun.file(path.join(ROOT, 'dist/index.js'));
        // Main bundle should be under 5MB
        expect(stats.size).toBeLessThan(5 * 1024 * 1024);
        // But should be at least 10KB (non-empty)
        expect(stats.size).toBeGreaterThan(10 * 1024);
    });

    test('dist/cli/index.js file size is reasonable (< 1MB)', () => {
        const stats = Bun.file(path.join(ROOT, 'dist/cli/index.js'));
        // CLI bundle should be under 1MB
        expect(stats.size).toBeLessThan(1 * 1024 * 1024);
        // But should be at least 1KB (non-empty)
        expect(stats.size).toBeGreaterThan(1 * 1024);
    });
});
