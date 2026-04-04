import { describe, expect, it } from 'bun:test';
import * as tools from '../../../src/tools/index';
import { TOOL_NAMES } from '../../../src/tools/tool-names';

describe('Tool Registration Conformance', () => {
	describe('TOOL_NAMES alignment', () => {
		it('every TOOL_NAMES entry should be exported from tools/index', () => {
			const missingTools: string[] = [];
			for (const toolName of TOOL_NAMES) {
				if (!(toolName in tools)) {
					missingTools.push(toolName);
				}
			}
			expect(missingTools).toHaveLength(0);
		});
	});
});
