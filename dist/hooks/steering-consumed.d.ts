/**
 * Steering consumed hook for OpenCode Swarm
 *
 * Provides mechanisms for recording and tracking steering directive consumption.
 * Writes steering-consumed events to .swarm/events.jsonl for health check verification.
 */
/**
 * Event written to .swarm/events.jsonl when a steering directive is consumed
 */
export interface SteeringConsumedEvent {
    type: 'steering-consumed';
    directiveId: string;
    timestamp: string;
}
/**
 * Records a steering-consumed event to the events.jsonl file.
 * Synchronous function that appends a single JSON line.
 *
 * @param directory - The project directory containing the .swarm folder
 * @param directiveId - The ID of the steering directive that was consumed
 */
export declare function recordSteeringConsumed(directory: string, directiveId: string): void;
/**
 * Creates a hook that records steering-consumed events for any unconsumed directives.
 * Reads events.jsonl to find steering-directive events without matching consumed events.
 *
 * @param directory - The project directory containing the .swarm folder
 * @returns A fire-and-forget hook function
 */
export declare function createSteeringConsumedHook(directory: string): (input: unknown, output: unknown) => Promise<void>;
