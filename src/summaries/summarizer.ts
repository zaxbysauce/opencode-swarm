/**
 * Summarization engine for tool outputs.
 * Provides content type detection, summarization decision logic, and structured summary creation.
 */

/**
 * Hysteresis factor to prevent churn for outputs near the threshold.
 * An output must be 25% larger than the threshold to be summarized.
 */
export const HYSTERESIS_FACTOR = 1.25;

/**
 * Content type classification for tool outputs.
 */
type ContentType = 'json' | 'code' | 'text' | 'binary';

/**
 * Heuristic-based content type detection.
 * @param output - The tool output string to analyze
 * @param toolName - The name of the tool that produced the output
 * @returns The detected content type: 'json', 'code', 'text', or 'binary'
 */
export function detectContentType(
	output: string,
	toolName: string,
): ContentType {
	// Check for JSON first
	const trimmed = output.trim();
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		try {
			JSON.parse(trimmed);
			return 'json';
		} catch {
			// Not valid JSON, continue to other checks
		}
	}

	// Check if tool suggests code (read, cat, grep, bash)
	const codeToolNames = ['read', 'cat', 'grep', 'bash'];
	const lowerToolName = toolName.toLowerCase();
	const toolSegments = lowerToolName.split(/[.\-_/]/);
	if (codeToolNames.some((name) => toolSegments.includes(name))) {
		return 'code';
	}

	// Check for common code patterns
	const codePatterns = [
		'function ',
		'const ',
		'import ',
		'export ',
		'class ',
		'def ',
		'return ',
		'=>',
	];
	const startsWithShebang = trimmed.startsWith('#!');

	if (
		codePatterns.some((pattern) => output.includes(pattern)) ||
		startsWithShebang
	) {
		return 'code';
	}

	// Check for binary content (high ratio of non-printable characters)
	const sampleSize = Math.min(1000, output.length);
	let nonPrintableCount = 0;
	for (let i = 0; i < sampleSize; i++) {
		const charCode = output.charCodeAt(i);
		// Count chars with code < 32, excluding \n (10), \r (13), \t (9)
		if (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13) {
			nonPrintableCount++;
		}
	}

	if (sampleSize > 0 && nonPrintableCount / sampleSize > 0.1) {
		return 'binary';
	}

	// Default to text
	return 'text';
}

/**
 * Determines whether output should be summarized based on size and hysteresis.
 * Uses hysteresis to prevent repeated summarization decisions for outputs near the threshold.
 * @param output - The tool output string to check
 * @param thresholdBytes - The threshold in bytes
 * @returns true if the output should be summarized
 */
export function shouldSummarize(
	output: string,
	thresholdBytes: number,
): boolean {
	const byteLength = Buffer.byteLength(output, 'utf8');
	return byteLength >= thresholdBytes * HYSTERESIS_FACTOR;
}

/**
 * Formats bytes into a human-readable string.
 * @param bytes - The number of bytes
 * @returns Formatted string (e.g., "20.5 KB", "1.2 MB")
 */
function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB'];
	let unitIndex = 0;
	let size = bytes;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	// Format to 1 decimal place if not whole number
	const formatted = unitIndex === 0 ? size.toString() : size.toFixed(1);
	return `${formatted} ${units[unitIndex]}`;
}

/**
 * Creates a structured summary string from tool output.
 * @param output - The full tool output string
 * @param toolName - The name of the tool that produced the output
 * @param summaryId - Unique identifier for this summary
 * @param maxSummaryChars - Maximum characters allowed for the preview
 * @returns Formatted summary string
 */
export function createSummary(
	output: string,
	toolName: string,
	summaryId: string,
	maxSummaryChars: number,
): string {
	const contentType = detectContentType(output, toolName);
	const lineCount = output.split('\n').length;
	const byteSize = Buffer.byteLength(output, 'utf8');
	const formattedSize = formatBytes(byteSize);

	// Calculate overhead for header and footer lines
	const headerLine = `[SUMMARY ${summaryId}] ${formattedSize} | ${contentType} | ${lineCount} lines`;
	const footerLine = `→ Use /swarm retrieve ${summaryId} for full content`;
	const overhead = headerLine.length + 1 + footerLine.length + 1; // +1 for newline each

	const maxPreviewChars = maxSummaryChars - overhead;

	let preview: string;

	switch (contentType) {
		case 'json': {
			try {
				const parsed = JSON.parse(output.trim());
				if (Array.isArray(parsed)) {
					preview = `[ ${parsed.length} items ]`;
				} else if (typeof parsed === 'object' && parsed !== null) {
					const keys = Object.keys(parsed).slice(0, 3);
					preview = `{ ${keys.join(', ')}${Object.keys(parsed).length > 3 ? ', ...' : ''} }`;
				} else {
					// Fallback to first lines
					const lines = output
						.split('\n')
						.filter((line) => line.trim().length > 0)
						.slice(0, 3);
					preview = lines.join('\n');
				}
			} catch {
				// Fallback to first lines if JSON parse fails
				const lines = output
					.split('\n')
					.filter((line) => line.trim().length > 0)
					.slice(0, 3);
				preview = lines.join('\n');
			}
			break;
		}
		case 'code': {
			const lines = output
				.split('\n')
				.filter((line) => line.trim().length > 0)
				.slice(0, 5);
			preview = lines.join('\n');
			break;
		}
		case 'text': {
			const lines = output
				.split('\n')
				.filter((line) => line.trim().length > 0)
				.slice(0, 5);
			preview = lines.join('\n');
			break;
		}
		case 'binary': {
			preview = `[Binary content - ${formattedSize}]`;
			break;
		}
		default: {
			const lines = output
				.split('\n')
				.filter((line) => line.trim().length > 0)
				.slice(0, 5);
			preview = lines.join('\n');
		}
	}

	// Truncate preview if it exceeds max preview chars
	if (preview.length > maxPreviewChars) {
		preview = `${preview.substring(0, maxPreviewChars - 3)}...`;
	}

	return `${headerLine}\n${preview}\n${footerLine}`;
}
