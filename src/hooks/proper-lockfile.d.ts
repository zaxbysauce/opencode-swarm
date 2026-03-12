declare module 'proper-lockfile' {
	export interface LockOptions {
		retries?: {
			retries: number;
			minTimeout?: number;
			maxTimeout?: number;
			factor?: number;
		};
		lockfilePath?: string;
		stale?: number;
		timeout?: number;
		realpath?: boolean;
	}
	export function lock(
		directory: string,
		options?: LockOptions,
	): Promise<() => Promise<void>>;
	export function unlock(
		directory: string,
		options?: LockOptions,
	): Promise<void>;
}
