import { describe, test, expect } from 'bun:test';
import { handleAgentsCommand } from '../../../src/commands/agents';
import type { AgentDefinition } from '../../../src/agents';
import type { GuardrailsConfig } from '../../../src/config/schema';

describe('handleAgentsCommand', () => {
    test('Returns "No agents registered." for empty agents', () => {
        const emptyAgents: Record<string, AgentDefinition> = {};
        
        const result = handleAgentsCommand(emptyAgents);
        
        expect(result).toBe('No agents registered.');
    });

    test('Lists agents with model and temperature', () => {
        const agentsWithModelAndTemp: Record<string, AgentDefinition> = {
            architect: {
                name: 'architect',
                description: 'The swarm architect',
                config: {
                    model: 'gpt-4',
                    temperature: 0.1
                }
            },
            coder: {
                name: 'coder',
                description: 'The coder agent',
                config: {
                    model: 'claude-3',
                    temperature: 0.2,
                    tools: {
                        write: true,
                        edit: true
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(agentsWithModelAndTemp);
        
        expect(result).toBe(`## Registered Agents (2 total)

- **architect** | model: \`gpt-4\` | temp: 0.1 | ✏️ read-write
  The swarm architect
- **coder** | model: \`claude-3\` | temp: 0.2 | ✏️ read-write
  The coder agent`);
    });

    test('Shows read-only for agents with tools.write === false', () => {
        const readWriteAgent: Record<string, AgentDefinition> = {
            tester: {
                name: 'tester',
                description: 'The test agent',
                config: {
                    model: 'gpt-4',
                    temperature: 0.1,
                    tools: {
                        write: false,
                        edit: true
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(readWriteAgent);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **tester** | model: \`gpt-4\` | temp: 0.1 | 🔒 read-only
  The test agent`);
    });

    test('Shows read-only for agents with tools.edit === false', () => {
        const readWriteAgent: Record<string, AgentDefinition> = {
            reviewer: {
                name: 'reviewer',
                description: 'The review agent',
                config: {
                    model: 'gpt-4',
                    temperature: 0.1,
                    tools: {
                        write: true,
                        edit: false
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(readWriteAgent);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **reviewer** | model: \`gpt-4\` | temp: 0.1 | 🔒 read-only
  The review agent`);
    });

    test('Shows read-write for agents without tool restrictions', () => {
        const readWriteAgent: Record<string, AgentDefinition> = {
            developer: {
                name: 'developer',
                description: 'The developer agent',
                config: {
                    model: 'gpt-4',
                    temperature: 0.2,
                    tools: {
                        write: true,
                        edit: true
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(readWriteAgent);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **developer** | model: \`gpt-4\` | temp: 0.2 | ✏️ read-write
  The developer agent`);
    });

    test('Shows read-write for agents with tools undefined', () => {
        const noToolsAgent: Record<string, AgentDefinition> = {
            designer: {
                name: 'designer',
                description: 'The designer agent',
                config: {
                    model: 'gpt-4',
                    temperature: 0.15
                }
            }
        };
        
        const result = handleAgentsCommand(noToolsAgent);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **designer** | model: \`gpt-4\` | temp: 0.15 | ✏️ read-write
  The designer agent`);
    });

    test('Shows default for missing model', () => {
        const noModelAgent: Record<string, AgentDefinition> = {
            helper: {
                name: 'helper',
                description: 'The helper agent',
                config: {
                    temperature: 0.3,
                    tools: {
                        write: true,
                        edit: true
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(noModelAgent);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **helper** | model: \`default\` | temp: 0.3 | ✏️ read-write
  The helper agent`);
    });

    test('Shows default for missing temperature', () => {
        const noTempAgent: Record<string, AgentDefinition> = {
            analyst: {
                name: 'analyst',
                description: 'The analyst agent',
                config: {
                    model: 'claude-3',
                    tools: {
                        write: false,
                        edit: false
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(noTempAgent);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **analyst** | model: \`claude-3\` | temp: default | 🔒 read-only
  The analyst agent`);
    });

    test('Shows default for missing temperature even when tools are read-write', () => {
        const noTempReadWriteAgent: Record<string, AgentDefinition> = {
            executor: {
                name: 'executor',
                description: 'The executor agent',
                config: {
                    model: 'gpt-3.5',
                    tools: {
                        write: true,
                        edit: true
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(noTempReadWriteAgent);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **executor** | model: \`gpt-3.5\` | temp: default | ✏️ read-write
  The executor agent`);
    });

    test('Includes description when available', () => {
        const agentsWithDesc: Record<string, AgentDefinition> = {
            architect: {
                name: 'architect',
                description: 'Responsible for project planning and architecture decisions',
                config: {
                    model: 'gpt-4',
                    temperature: 0.1,
                    tools: {
                        write: false,
                        edit: false
                    }
                }
            },
            coder: {
                name: 'coder',
                config: {
                    model: 'claude-3',
                    temperature: 0.2,
                    tools: {
                        write: true,
                        edit: true
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(agentsWithDesc);
        
        expect(result).toBe(`## Registered Agents (2 total)

- **architect** | model: \`gpt-4\` | temp: 0.1 | 🔒 read-only
  Responsible for project planning and architecture decisions
- **coder** | model: \`claude-3\` | temp: 0.2 | ✏️ read-write`);
    });

    test('Handles multiple agents with mixed configurations', () => {
        const mixedAgents: Record<string, AgentDefinition> = {
            arch: {
                name: 'arch',
                description: 'The architect agent',
                config: {
                    model: 'gpt-4',
                    temperature: 0.1,
                    tools: {
                        write: false,
                        edit: false
                    }
                }
            },
            dev: {
                name: 'dev',
                description: 'The developer agent',
                config: {
                    model: 'gpt-3.5',
                    temperature: 0.3,
                    tools: {
                        write: true,
                        edit: true
                    }
                }
            },
            tester: {
                name: 'tester',
                config: {
                    model: 'claude-2',
                    temperature: 0.2,
                    tools: {
                        write: false,
                        edit: true
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(mixedAgents);
        
        expect(result).toBe(`## Registered Agents (3 total)

- **arch** | model: \`gpt-4\` | temp: 0.1 | 🔒 read-only
  The architect agent
- **dev** | model: \`gpt-3.5\` | temp: 0.3 | ✏️ read-write
  The developer agent
- **tester** | model: \`claude-2\` | temp: 0.2 | 🔒 read-only`);
    });

    test('Handles agent with description in config rather than agent level', () => {
        const agentWithConfigDesc: Record<string, AgentDefinition> = {
            reviewer: {
                name: 'reviewer',
                config: {
                    model: 'gpt-4',
                    temperature: 0.1,
                    description: 'Reviews code and provides feedback',
                    tools: {
                        write: false,
                        edit: false
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(agentWithConfigDesc);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **reviewer** | model: \`gpt-4\` | temp: 0.1 | 🔒 read-only
  Reviews code and provides feedback`);
    });

    test('Prioritizes agent-level description over config description', () => {
        const agentWithBothDesc: Record<string, AgentDefinition> = {
            reviewer: {
                name: 'reviewer',
                description: 'Agent-level description',
                config: {
                    model: 'gpt-4',
                    temperature: 0.1,
                    description: 'Config-level description',
                    tools: {
                        write: false,
                        edit: false
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(agentWithBothDesc);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **reviewer** | model: \`gpt-4\` | temp: 0.1 | 🔒 read-only
  Agent-level description`);
    });

    test('shows "temp: 0" for agent with temperature of 0', () => {
        const agentWithZeroTemp: Record<string, AgentDefinition> = {
            precise: {
                name: 'precise',
                description: 'The precise agent',
                config: {
                    model: 'gpt-4',
                    temperature: 0
                }
            }
        };
        
        const result = handleAgentsCommand(agentWithZeroTemp);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **precise** | model: \`gpt-4\` | temp: 0 | ✏️ read-write
  The precise agent`);
    });

    test('shows read-only for agent with both write and edit set to false', () => {
        const bothFalseAgent: Record<string, AgentDefinition> = {
            restricted: {
                name: 'restricted',
                description: 'Restricted agent',
                config: {
                    model: 'gpt-4',
                    temperature: 0.1,
                    tools: {
                        write: false,
                        edit: false
                    }
                }
            }
        };
        
        const result = handleAgentsCommand(bothFalseAgent);
        
        expect(result).toBe(`## Registered Agents (1 total)

- **restricted** | model: \`gpt-4\` | temp: 0.1 | 🔒 read-only
  Restricted agent`);
    });

    test('shows read-write for agent with empty tools object', () => {
        const emptyToolsAgent: Record<string, AgentDefinition> = {
            flexible: {
                name: 'flexible',
                description: 'Flexible agent',
                config: {
                    model: 'gpt-4',
                    temperature: 0.2,
                    tools: {}
                }
            }
        };
        
        const result = handleAgentsCommand(emptyToolsAgent);

        expect(result).toBe(`## Registered Agents (1 total)

- **flexible** | model: \`gpt-4\` | temp: 0.2 | ✏️ read-write
  Flexible agent`);
    });
});

describe('enhanced agent view', () => {
    // Test fixtures
    const baseAgents: Record<string, AgentDefinition> = {
        coder: {
            name: 'coder',
            description: 'The coder agent',
            config: {
                model: 'gpt-4',
                temperature: 0.2,
                tools: { write: true, edit: true },
            },
        },
        explorer: {
            name: 'explorer',
            description: 'The explorer agent',
            config: {
                model: 'claude-3',
                temperature: 0.1,
                tools: { write: false, edit: false },
            },
        },
        architect: {
            name: 'architect',
            description: 'The architect agent',
            config: {
                model: 'gpt-4',
                temperature: 0.1,
                tools: { write: false, edit: false },
            },
        },
    };

    const baseGuardrails: GuardrailsConfig = {
        enabled: true,
        max_tool_calls: 200,
        max_duration_minutes: 30,
        max_repetitions: 10,
        max_consecutive_errors: 5,
        warning_threshold: 0.5,
    };

    const guardrailsWithProfiles: GuardrailsConfig = {
        ...baseGuardrails,
        profiles: {
            coder: { max_tool_calls: 400 },
            explorer: { max_tool_calls: 100, max_duration_minutes: 10 },
        },
    };

    const guardrailsWithEmptyProfile: GuardrailsConfig = {
        ...baseGuardrails,
        profiles: {
            architect: {},
        },
    };

    const guardrailsWithMultipleOverrides: GuardrailsConfig = {
        ...baseGuardrails,
        profiles: {
            coder: {
                max_tool_calls: 500,
                max_duration_minutes: 60,
                max_repetitions: 20,
                max_consecutive_errors: 10,
                warning_threshold: 0.8,
            },
        },
    };

    test('shows custom limits indicator for agent with profile', () => {
        const result = handleAgentsCommand(baseAgents, guardrailsWithProfiles);

        expect(result).toContain('**coder** | model: `gpt-4` | temp: 0.2 | ✏️ read-write | ⚡ custom limits');
        expect(result).toContain('**explorer** | model: `claude-3` | temp: 0.1 | 🔒 read-only | ⚡ custom limits');
        expect(result).toContain('**architect** | model: `gpt-4` | temp: 0.1 | 🔒 read-only');
    });

    test('does NOT show custom limits indicator for agent without profile', () => {
        const result = handleAgentsCommand(baseAgents, guardrailsWithEmptyProfile);

        expect(result).toContain('**architect** | model: `gpt-4` | temp: 0.1 | 🔒 read-only | ⚡ custom limits');
        expect(result).toContain('**coder** | model: `gpt-4` | temp: 0.2 | ✏️ read-write');
        expect(result).toContain('**explorer** | model: `claude-3` | temp: 0.1 | 🔒 read-only');
    });

    test('shows guardrail profiles summary section at bottom', () => {
        const result = handleAgentsCommand(baseAgents, guardrailsWithProfiles);

        expect(result).toContain('### Guardrail Profiles');
        expect(result).toContain('**coder**: max_tool_calls=400');
        expect(result).toContain('**explorer**: max_tool_calls=100, max_duration_minutes=10');
    });

    test('does NOT show guardrail profiles section when no profiles', () => {
        const result = handleAgentsCommand(baseAgents, baseGuardrails);

        expect(result).not.toContain('### Guardrail Profiles');
    });

    test('does NOT show guardrail profiles section when guardrails param is undefined', () => {
        const result = handleAgentsCommand(baseAgents);

        expect(result).not.toContain('### Guardrail Profiles');
    });

    test('shows multiple profile overrides in summary', () => {
        const result = handleAgentsCommand(baseAgents, guardrailsWithMultipleOverrides);

        expect(result).toContain('### Guardrail Profiles');
        expect(result).toContain(
            '**coder**: max_tool_calls=500, max_duration_minutes=60, max_repetitions=20, max_consecutive_errors=10, warning_threshold=0.8',
        );
    });

    test('shows "no overrides" for empty profile', () => {
        const result = handleAgentsCommand(baseAgents, guardrailsWithEmptyProfile);

        expect(result).toContain('### Guardrail Profiles');
        expect(result).toContain('**architect**: no overrides');
    });
});