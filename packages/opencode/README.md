# opencode-swarm

> OpenCode plugin for architect-centric agentic swarm orchestration

## ⚠️ Deprecation Notice

**This package is deprecated.**

For new projects, please use [`@opencode-swarm/core`](https://www.npmjs.com/package/@opencode-swarm/core) directly:

```typescript
// New way (recommended)
import { createCoderAgent } from '@opencode-swarm/core';
```

This package (`opencode-swarm`) is maintained for backward compatibility only.

## Installation

```bash
# Install the package
npm install opencode-swarm

# Or with yarn
yarn add opencode-swarm

# Or with pnpm
pnpm add opencode-swarm
```

## Migration Guide

If you're currently using deep imports from `opencode-swarm`, here's how to migrate:

### Before (deprecated)
```typescript
// Old way - still works but not recommended
import { createCoderAgent } from 'opencode-swarm';
// or
import { createCoderAgent } from 'opencode-swarm/src/agents';
```

### After (recommended)
```typescript
// New way
import { createCoderAgent } from '@opencode-swarm/core';
```

### Import Mapping

| Old Import | New Import |
|------------|------------|
| `import { createCoderAgent } from 'opencode-swarm'` | `import { createCoderAgent } from '@opencode-swarm/core'` |
| `import { createCoderAgent } from 'opencode-swarm/src/agents'` | `import { createCoderAgent } from '@opencode-swarm/core'` |
| `import { SwarmConfig } from 'opencode-swarm/src/config'` | `import { SwarmConfig } from '@opencode-swarm/core'` |
| `import { createAgentState } from 'opencode-swarm/src/state'` | `import { createAgentState } from '@opencode-swarm/core'` |

## CLI Usage

The `opencode-swarm` CLI provides swarm orchestration commands:

```bash
# Run swarm commands
opencode-swarm status
opencode-swarm plan
opencode-swarm checkpoint
```

## License

MIT
