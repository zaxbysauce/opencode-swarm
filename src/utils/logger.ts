const DEBUG = process.env.OPENCODE_SWARM_DEBUG === '1';

export function log(message: string, data?: unknown): void {
	if (!DEBUG) return;

	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.log(`[opencode-swarm ${timestamp}] ${message}`, data);
	} else {
		console.log(`[opencode-swarm ${timestamp}] ${message}`);
	}
}

export function warn(message: string, data?: unknown): void {
	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.warn(`[opencode-swarm ${timestamp}] WARN: ${message}`, data);
	} else {
		console.warn(`[opencode-swarm ${timestamp}] WARN: ${message}`);
	}
}

export function error(message: string, data?: unknown): void {
	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.error(`[opencode-swarm ${timestamp}] ERROR: ${message}`, data);
	} else {
		console.error(`[opencode-swarm ${timestamp}] ERROR: ${message}`);
	}
}
