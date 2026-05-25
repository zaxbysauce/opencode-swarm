// Re-export bridge: executor.ts expects ./executors/macos
// Actual implementation is at ../macos/sandbox-exec-executor
export { MacOSSandboxExecutor } from '../macos/sandbox-exec-executor';
