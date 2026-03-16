/**
 * Checkpoint Tool Shim
 *
 * Re-exports the checkpoint tool from the local tool registration.
 * Provides compatibility for the commands/checkpoint.ts import path.
 */

export { checkpoint } from './register.js';
