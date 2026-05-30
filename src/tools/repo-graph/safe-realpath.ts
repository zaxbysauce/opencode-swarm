import { realpathSync } from 'node:fs';

export function safeRealpathSync(
	targetPath: string,
	fallback: string,
	realpathResolver: (targetPath: string) => string = realpathSync,
): string | null {
	try {
		return realpathResolver(targetPath);
	} catch (error) {
		if (
			error instanceof Error &&
			(error as NodeJS.ErrnoException).code === 'ENOENT'
		) {
			return fallback;
		}
		return null;
	}
}
