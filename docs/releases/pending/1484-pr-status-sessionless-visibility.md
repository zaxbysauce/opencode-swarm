# PR status CLI false-negative + clearer session-less subscribe error

## What changed

- **`/swarm pr status` from the CLI now lists subscriptions across all sessions**
  (`src/commands/pr-monitor-status.ts`, `src/commands/registry.ts`): The
  `bunx opencode-swarm run pr status` path has no session context (it passes an
  empty `sessionID`), so the previous `record.sessionID === sessionID` filter
  always matched zero rows and reported "No active PR subscriptions for this
  session" even when subscriptions existed. The status handler now takes the
  command `source`; when `source === 'cli'` it lists every active subscription
  with the owning session id per record and an "all sessions" header. Every
  other caller — TUI, chat, and the agent-facing `swarm_command` tool
  (`source: 'chat'`) — stays session-scoped, so an agent can never be handed a
  cross-session dump.

- **`/swarm pr subscribe` returns a clear "no active session" error when invoked
  without a session** (`src/commands/pr-subscribe.ts`): Previously a session-less
  caller surfaced the store-layer `sessionID is required` throw as an opaque
  "Failed to subscribe" error. The handler now fails up front with an actionable
  message and never calls the store.

## Why

Issue #1484: `/swarm pr subscribe` showed a success message while
`bunx opencode-swarm pr status` reported "No active PR subscriptions for this
session", which looked like a silent subscribe failure. Investigation showed the
subscribe actually succeeds; the CLI `pr status` was a blind verifier — it could
never display a subscription created inside a session because it filtered on an
empty session id. There is no "finalized session" no-op: subscribe writes
regardless of plan state, and an empty session id throws rather than silently
succeeding.

## How to use

No config changes. `bunx opencode-swarm run pr status` now shows active
subscriptions (across sessions, with the owning session id). Inside a session,
`/swarm pr status` remains session-scoped. PR subscriptions remain session-scoped
and must be created from inside an OpenCode session.

## Invariant audit

- INV-4 (.swarm containment): no path changes; store path unchanged
- INV-7 (tests): new bun:test cases for the CLI source path and the session-less
  subscribe error; no `mock.module` added (uses existing `_internals` DI seam)
- INV-8 (session state): no session-state changes; status read is lock-free
- INV-10 (chat hooks): no chat-hook changes
- INV-12 (release): this fragment
