// Re-export bridge: executor.ts expects ./executors/windows
// Actual implementation is at ../win32/restricted-token-executor
export { WindowsSandboxExecutor } from '../win32/restricted-token-executor';
