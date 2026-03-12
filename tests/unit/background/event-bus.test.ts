import { describe, test, expect, beforeEach } from 'bun:test';
import {
	AutomationEventBus,
	resetGlobalEventBus,
	getGlobalEventBus,
	type AutomationEventType,
} from '../../../src/background/event-bus';

describe('AutomationEventBus', () => {
	let eventBus: AutomationEventBus;

	beforeEach(() => {
		resetGlobalEventBus();
		eventBus = new AutomationEventBus({ maxHistorySize: 10 });
	});

	describe('subscribe and publish', () => {
		test('should subscribe and receive events', async () => {
			const receivedEvents: Array<{ type: string; payload: unknown }> = [];
			const unsubscribe = eventBus.subscribe(
				'queue.item.enqueued' as AutomationEventType,
				(event) => {
					receivedEvents.push({ type: event.type, payload: event.payload });
				},
			);

			await eventBus.publish('queue.item.enqueued' as AutomationEventType, {
				itemId: 'test-1',
				priority: 'high',
			});

			expect(receivedEvents).toHaveLength(1);
			expect(receivedEvents[0].type).toBe('queue.item.enqueued');
			expect(receivedEvents[0].payload).toEqual({
				itemId: 'test-1',
				priority: 'high',
			});

			unsubscribe();
		});

		test('should handle multiple subscribers for same event', async () => {
			const handler1Calls: number[] = [];
			const handler2Calls: number[] = [];

			eventBus.subscribe('worker.started' as AutomationEventType, () => {
				handler1Calls.push(1);
			});
			eventBus.subscribe('worker.started' as AutomationEventType, () => {
				handler2Calls.push(1);
			});

			await eventBus.publish('worker.started' as AutomationEventType, {
				workerName: 'test-worker',
			});

			expect(handler1Calls).toHaveLength(1);
			expect(handler2Calls).toHaveLength(1);
		});

		test('should not receive events after unsubscribe', async () => {
			const receivedEvents: unknown[] = [];
			const unsubscribe = eventBus.subscribe(
				'automation.started' as AutomationEventType,
				(event) => {
					receivedEvents.push(event);
				},
			);

			await eventBus.publish('automation.started' as AutomationEventType, {
				timestamp: Date.now(),
			});

			unsubscribe();

			await eventBus.publish('automation.started' as AutomationEventType, {
				timestamp: Date.now(),
			});

			expect(receivedEvents).toHaveLength(1);
		});

		test('should support async listeners', async () => {
			const results: string[] = [];
			const asyncListener = async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				results.push('async done');
			};

			eventBus.subscribe('automation.stopped' as AutomationEventType, asyncListener);

			await eventBus.publish('automation.stopped' as AutomationEventType, {});

			expect(results).toContain('async done');
		});

		test('should handle listener errors gracefully', async () => {
			let publishCompleted = false;
			const errorListener = () => {
				throw new Error('Listener error');
			};

			eventBus.subscribe('worker.error' as AutomationEventType, errorListener);

			await eventBus.publish('worker.error' as AutomationEventType, {
				workerName: 'test',
				error: 'test error',
			}).then(() => {
				publishCompleted = true;
			});

			expect(publishCompleted).toBe(true);
		});
	});

	describe('event history', () => {
		test('should store events in history', async () => {
			await eventBus.publish('queue.item.enqueued' as AutomationEventType, {
				itemId: '1',
			});
			await eventBus.publish('queue.item.dequeued' as AutomationEventType, {
				itemId: '1',
			});

			const history = eventBus.getHistory();
			expect(history).toHaveLength(2);
		});

		test('should filter history by event type', async () => {
			await eventBus.publish('queue.item.enqueued' as AutomationEventType, {
				itemId: '1',
			});
			await eventBus.publish('queue.item.dequeued' as AutomationEventType, {
				itemId: '1',
			});
			await eventBus.publish('queue.item.enqueued' as AutomationEventType, {
				itemId: '2',
			});

			const history = eventBus.getHistory([
				'queue.item.enqueued' as AutomationEventType,
			]);
			expect(history).toHaveLength(2);
		});

		test('should respect max history size', async () => {
			// Create new bus with small history
			const smallBus = new AutomationEventBus({ maxHistorySize: 3 });

			await smallBus.publish('queue.item.enqueued' as AutomationEventType, {
				itemId: '1',
			});
			await smallBus.publish('queue.item.enqueued' as AutomationEventType, {
				itemId: '2',
			});
			await smallBus.publish('queue.item.enqueued' as AutomationEventType, {
				itemId: '3',
			});
			await smallBus.publish('queue.item.enqueued' as AutomationEventType, {
				itemId: '4',
			});

			const history = smallBus.getHistory();
			expect(history).toHaveLength(3);
		});

		test('should clear history', async () => {
			await eventBus.publish('queue.item.enqueued' as AutomationEventType, {
				itemId: '1',
			});

			eventBus.clearHistory();
			const history = eventBus.getHistory();

			expect(history).toHaveLength(0);
		});
	});

	describe('listener management', () => {
		test('should return correct listener count', () => {
			eventBus.subscribe('test.event' as AutomationEventType, () => {});
			eventBus.subscribe('test.event' as AutomationEventType, () => {});
			eventBus.subscribe('other.event' as AutomationEventType, () => {});

			expect(
				eventBus.getListenerCount('test.event' as AutomationEventType),
			).toBe(2);
			expect(
				eventBus.getListenerCount('other.event' as AutomationEventType),
			).toBe(1);
		});

		test('should report if listeners exist', () => {
			expect(eventBus.hasListeners('test.event' as AutomationEventType)).toBe(
				false,
			);

			eventBus.subscribe('test.event' as AutomationEventType, () => {});

			expect(eventBus.hasListeners('test.event' as AutomationEventType)).toBe(
				true,
			);
		});
	});

	describe('global event bus', () => {
		test('should provide global instance', () => {
			const bus1 = getGlobalEventBus();
			const bus2 = getGlobalEventBus();

			expect(bus1).toBe(bus2);
		});

		test('should reset global instance', () => {
			const bus1 = getGlobalEventBus();
			resetGlobalEventBus();
			const bus2 = getGlobalEventBus();

			expect(bus1).not.toBe(bus2);
		});
	});

	describe('event structure', () => {
		test('should include timestamp and source in events', async () => {
			let capturedEvent: unknown;
			eventBus.subscribe(
				'circuit.breaker.opened' as AutomationEventType,
				(event: any) => {
					capturedEvent = event;
				},
			);

			const beforeTime = Date.now();
			await eventBus.publish(
				'circuit.breaker.opened' as AutomationEventType,
				{ failureCount: 5 },
				'test-source',
			);
			const afterTime = Date.now();

			const event = capturedEvent as any;
			expect(event.timestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(event.timestamp).toBeLessThanOrEqual(afterTime);
			expect(event.source).toBe('test-source');
			expect(event.payload).toEqual({ failureCount: 5 });
		});
	});
});
