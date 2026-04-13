/**
 * Handle /swarm brainstorm command.
 *
 * Returns a trigger prompt instructing the architect to enter
 * MODE: BRAINSTORM — the seven-phase planning workflow defined in the
 * architect prompt: CONTEXT SCAN → DIALOGUE → APPROACHES → DESIGN SECTIONS
 * → SPEC WRITE + SELF-REVIEW → QA GATE SELECTION → TRANSITION.
 *
 * Any arguments become the initial topic/problem statement for the
 * architect to reason about.
 */
export declare function handleBrainstormCommand(_directory: string, args: string[]): Promise<string>;
