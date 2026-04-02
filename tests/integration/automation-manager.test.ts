import { describe, expect, test } from 'bun:test';
import { createAutomationManager } from '../../src/background/manager';

describe('automation manager lifecycle', () => {
	test('manager.start() is called when mode is hybrid', () => {
		const manager = createAutomationManager({
			mode: 'hybrid',
			capabilities: {} as any,
		});
		expect(manager.isEnabled()).toBe(true);
		manager.start();
		expect(manager.isActive()).toBe(true);
		manager.stop();
	});

	test('manager.start() is called when mode is auto', () => {
		const manager = createAutomationManager({
			mode: 'auto',
			capabilities: {} as any,
		});
		expect(manager.isEnabled()).toBe(true);
		manager.start();
		expect(manager.isActive()).toBe(true);
		manager.stop();
	});

	test('manager is NOT started when mode is manual', () => {
		const manager = createAutomationManager({
			mode: 'manual',
			capabilities: {} as any,
		});
		expect(manager.isEnabled()).toBe(false);
		manager.start(); // should be no-op since not initialized when disabled
		expect(manager.isActive()).toBe(false);
	});

	test('manager.stop() cleans up gracefully', () => {
		const manager = createAutomationManager({
			mode: 'hybrid',
			capabilities: {} as any,
		});
		manager.start();
		expect(manager.isActive()).toBe(true);
		manager.stop();
		expect(manager.isActive()).toBe(false);
	});
});
