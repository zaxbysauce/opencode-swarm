export function resolvePrompt(
	base: string,
	custom?: string,
	append?: string,
): string {
	if (custom) return custom;
	if (append) return `${base}\n\n${append}`;
	return base;
}
