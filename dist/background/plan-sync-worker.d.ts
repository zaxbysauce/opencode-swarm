/**
 * Plan Sync Worker
 *
 * Watches .swarm/plan.json for changes and syncs plan.md accordingly.
 * Uses fs.watch with polling fallback for cross-platform reliability.
 */
/** Configuration options for PlanSyncWorker */
export interface PlanSyncWorkerOptions {
    /** Directory containing .swarm folder (defaults to cwd) */
    directory?: string;
    /** Debounce delay in ms (default: 300ms) */
    debounceMs?: number;
    /** Polling interval in ms when fs.watch fails (default: 2000ms) */
    pollIntervalMs?: number;
    /** Sync operation timeout in ms (default: 30000ms) - prevents runaway hangs */
    syncTimeoutMs?: number;
    /** Called on sync completion (success or failure) */
    onSyncComplete?: (success: boolean, error?: Error) => void;
}
/** Worker status */
export type PlanSyncWorkerStatus = 'stopped' | 'starting' | 'running' | 'stopping';
/**
 * Plan Sync Worker
 *
 * Standalone class that watches plan.json and triggers plan.md regeneration.
 * Handles cross-platform fs.watch reliability issues with polling fallback.
 */
export declare class PlanSyncWorker {
    private readonly directory;
    private readonly debounceMs;
    private readonly pollIntervalMs;
    private readonly syncTimeoutMs;
    private readonly onSyncComplete?;
    private status;
    private watcher;
    private pollTimer;
    private debounceTimer;
    /** In-flight sync lock */
    private syncing;
    /** Pending sync requested while in-flight */
    private pendingSync;
    /** Last known plan.json stat to detect changes */
    private lastStat;
    /** Track if we've been disposed */
    private disposed;
    constructor(options?: PlanSyncWorkerOptions);
    /**
     * Get the swarm directory path
     */
    private getSwarmDir;
    /**
     * Get the plan.json file path
     */
    private getPlanJsonPath;
    /**
     * Start watching for plan.json changes
     */
    start(): void;
    /**
     * Stop watching and clean up resources
     */
    stop(): void;
    /**
     * Dispose of the worker - stop and prevent further use
     */
    dispose(): void;
    /**
     * Get current status
     */
    getStatus(): PlanSyncWorkerStatus;
    /**
     * Check if worker is running
     */
    isRunning(): boolean;
    /**
     * Initialize the stat tracking for change detection
     */
    private initializeStat;
    /**
     * Set up native fs.watch on the swarm directory
     * Returns true if successful, false if unavailable
     */
    private setupNativeWatcher;
    /**
     * Set up polling fallback
     */
    private setupPolling;
    /**
     * Check for changes via polling
     */
    private pollCheck;
    /**
     * Debounced sync - prevents rapid successive syncs
     */
    private debouncedSync;
    /**
     * Clear debounce timer
     */
    private clearDebounce;
    /**
     * Trigger a sync operation with overlap protection
     */
    private triggerSync;
    /**
     * Execute the sync operation with timeout protection
     */
    private executeSync;
    /**
     * Safely invoke onSyncComplete callback, catching any exceptions
     * to prevent callback errors from affecting worker stability
     */
    private safeCallback;
    /**
     * Advisory: check for unauthorized writes to plan.json outside of save_plan/savePlan
     * Logs a warning if plan.json appears to have been modified after the write marker
     */
    private checkForUnauthorizedWrite;
    /**
     * Wrap a promise with a timeout
     */
    private withTimeout;
}
