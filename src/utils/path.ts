export function normalizePath(p: string): string {
	if (!p) return '';
	let result = p
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/^\.\//, '')
		.replace(/(?:^|\/)\.\//g, '/');
	result = result.replace(/\/$/, '');
	result = result.replace(/\/\.$/, '');
	if (process.platform === 'win32') result = result.toLowerCase();
	if (!result) {
		// Preserve documented contract: both '.' and './' normalize to '.'
		const norm = p.replace(/\\/g, '/');
		if (norm === '.' || norm === './') return '.';
		return '';
	}
	return result;
}
