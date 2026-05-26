---
"opencode-swarm": minor
---

Add SQLite FTS5-backed hybrid memory recall. SQLite memory now maintains an optional versioned FTS shadow index over memory text, tags, kind, source file/ref, symbols, and files; recall falls back to the existing scorer if FTS is unavailable.

Recall scoring now gives stronger structured weight to touched files, symbols, role profile kind matches, and task-term overlap so file- and task-specific memories outrank broad same-scope memories more consistently.
