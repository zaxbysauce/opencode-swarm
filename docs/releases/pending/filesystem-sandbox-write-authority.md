## Filesystem Write-Authority Enforcement for Coder Subprocesses

OS-native sandboxing closes shell-escape gaps in coder subprocesses by enforcing filesystem write boundaries at the OS level (not just tool-layer).

### What changed
- **New `src/sandbox/` module** with platform-specific executors: `bubblewrap` (Linux), `sandbox-exec` (macOS), PowerShell-constrained (Windows)
- **Guardrails integration**: bash/shell tool commands are wrapped in sandbox before dispatch
- **Recovery path**: graceful degradation when sandbox init fails mid-session
- **Edge-case detection**: symlink escape, /proc/self/fd, io_uring, namespace escape, hard-link/rename, mmap — detection functions for each
- **Full test suite**: 29 AC integration tests, 36 recovery tests, 252 guardrails regression tests
- **CI**: conditional sandbox tests on all 3 OS runners
- **Threat model**: `docs/dev/filesystem-sandbox-threat-model.md` — trust boundaries, attacker capabilities, bypass routes, residual risks

### What to know
- Linux (bwrap) and macOS (sandbox-exec) provide genuine OS-level isolation
- Windows is best-effort restricted execution via PowerShell env restrictions — not a true OS sandbox (native Win32 sandbox deferred to future work)
- macOS tmpfs cap is advisory only (no profile-level `size=` quota in sandbox-exec)
- io_uring blocking is detection-only, not enforced in bwrap invocation
- LD_PRELOAD/LD_AUDIT not explicitly cleared on Linux — OS-level namespace isolation is the primary defense
- IPC writes (UNIX sockets, FIFOs) are out of scope — residual exfiltration risk documented in threat model

### Migration
No migration required. Sandbox activates automatically when bwrap/sandbox-exec is available on the system.
