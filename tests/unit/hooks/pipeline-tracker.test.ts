import { describe, it, expect } from 'bun:test';
import { createPipelineTrackerHook } from '../../../src/hooks/pipeline-tracker';

describe('Pipeline Tracker Hook', () => {
  describe('Disabled hook behavior', () => {
    it('returns empty object when inject_phase_reminders is false', () => {
      const config = { 
        inject_phase_reminders: false, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      expect(hook).toEqual({});
    });

    it('returns empty object when inject_phase_reminders is not provided', () => {
      // Test with missing property (will be undefined)
      const hook = createPipelineTrackerHook({ max_iterations: 5, qa_retry_limit: 3 } as any);
      expect(hook).toEqual({});
    });
  });

  describe('Enabled hook behavior', () => {
    it('returns object with experimental.chat.messages.transform key', () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      expect(hook['experimental.chat.messages.transform']).toBeDefined();
    });

    it('returns an async transform function', () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'] as any;
      expect(typeof transform).toBe('function');
      expect(transform.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('Transform behavior - injection', () => {
    it('injects PHASE_REMINDER into last user message first text part', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = {
        messages: [
          {
            info: { role: 'assistant', agent: 'explorer' },
            parts: [{ type: 'text', text: 'Previous assistant message' }]
          },
          {
            info: { role: 'user', agent: 'architect' },
            parts: [{ type: 'text', text: 'Last user message' }]
          }
        ]
      };

      await transform({}, output);

      expect(output.messages[1].parts[0].text).toContain('<swarm_reminder>');
    });

    it('only modifies the LAST user message', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = {
        messages: [
          {
            info: { role: 'user', agent: 'architect' },
            parts: [{ type: 'text', text: 'First user message' }]
          },
          {
            info: { role: 'assistant', agent: 'explorer' },
            parts: [{ type: 'text', text: 'Assistant message' }]
          },
          {
            info: { role: 'user', agent: 'architect' },
            parts: [{ type: 'text', text: 'Last user message' }]
          }
        ]
      };

      await transform({}, output);

      // First user message should remain unchanged
      expect(output.messages[0].parts[0].text).toBe('First user message');
      
      // Last user message should be modified
      expect(output.messages[2].parts[0].text).toContain('<swarm_reminder>');
    });

    it('modifies only the FIRST text part when user message has multiple text parts', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = {
        messages: [
          {
            info: { role: 'user', agent: 'architect' },
            parts: [
              { type: 'text', text: 'First text part' },
              { type: 'text', text: 'Second text part' }
            ]
          }
        ]
      };

      await transform({}, output);

      // First text part should be modified
      expect(output.messages[0].parts[0].text).toContain('<swarm_reminder>');
      expect(output.messages[0].parts[0].text).toContain('First text part');
      
      // Second text part should remain unchanged
      expect(output.messages[0].parts[1].text).toBe('Second text part');
    });
  });

  describe('Transform behavior - agent filtering', () => {
    it('injects when agent is undefined (main session)', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = {
        messages: [
          {
            info: { role: 'user' }, // No agent specified = architect
            parts: [{ type: 'text', text: 'User message without agent' }]
          }
        ]
      };

      await transform({}, output);

      expect(output.messages[0].parts[0].text).toContain('<swarm_reminder>');
    });

    it('injects when agent is architect', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = {
        messages: [
          {
            info: { role: 'user', agent: 'architect' },
            parts: [{ type: 'text', text: 'User message for architect' }]
          }
        ]
      };

      await transform({}, output);

      expect(output.messages[0].parts[0].text).toContain('<swarm_reminder>');
    });

    it('does NOT inject when agent is coder', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = {
        messages: [
          {
            info: { role: 'user', agent: 'coder' },
            parts: [{ type: 'text', text: 'User message for coder' }]
          }
        ]
      };

      await transform({}, output);

      expect(output.messages[0].parts[0].text).toBe('User message for coder');
      expect(output.messages[0].parts[0].text).not.toContain('<swarm_reminder>');
    });

    it('does NOT inject for other non-architect agents', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = {
        messages: [
          {
            info: { role: 'user', agent: 'explorer' },
            parts: [{ type: 'text', text: 'User message for explorer' }]
          }
        ]
      };

      await transform({}, output);

      expect(output.messages[0].parts[0].text).toBe('User message for explorer');
      expect(output.messages[0].parts[0].text).not.toContain('<swarm_reminder>');
    });
  });

  describe('Transform behavior - edge cases', () => {
    it('does nothing when messages array is empty', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = { messages: [] };

      await transform({}, output);

      expect(output.messages).toEqual([]);
    });

    it('does nothing when output.messages is undefined', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = {};

      await transform({}, output);

      expect(output).toEqual({});
    });

    it('does nothing when there are no user messages', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = {
        messages: [
          {
            info: { role: 'assistant', agent: 'architect' },
            parts: [{ type: 'text', text: 'Assistant message' }]
          }
        ]
      };

      await transform({}, output);

      expect(output.messages[0].parts[0].text).toBe('Assistant message');
      expect(output.messages[0].parts[0].text).not.toContain('<swarm_reminder>');
    });

    it('does nothing when user message has no text parts', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      const output = {
        messages: [
          {
            info: { role: 'user', agent: 'architect' },
            parts: [{ type: 'image', url: 'some_image_url' }]
          }
        ]
      };

      await transform({}, output);

      expect(output.messages[0].parts[0].type).toBe('image');
      expect(output.messages[0].parts[0]).not.toHaveProperty('text');
    });

    it('does not crash on completely malformed input', async () => {
      const config = { 
        inject_phase_reminders: true, 
        max_iterations: 5, 
        qa_retry_limit: 3 
      };
      const hook = createPipelineTrackerHook(config);
      const transform = hook['experimental.chat.messages.transform'];
      
      // Test 1: messages with no text part — should not modify anything
      const output1: any = { 
        messages: [
          {
            info: { role: 'user' },
            parts: [{ type: 'image' }]
          }
        ] 
      };
      await transform({}, output1);
      expect(output1.messages[0].parts[0]).toEqual({ type: 'image' });

      // Test 2: null messages — should not throw
      const output2: any = { messages: null };
      await transform({}, output2);
      expect(output2.messages).toBeNull();

      // Test 3: messages with missing parts — should not throw
      const output3: any = { 
        messages: [
          { info: { role: 'user' } }
        ] 
      };
      await transform({}, output3);
      expect(output3.messages[0].parts).toBeUndefined();

      // Test 4: message with null info — should not throw
      const output4: any = { 
        messages: [
          { info: null, parts: [{ type: 'text', text: 'test' }] }
        ] 
      };
      await transform({}, output4);
      expect(output4.messages[0].parts[0].text).toBe('test');
    });
  });
});