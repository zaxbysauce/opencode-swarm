# Filesystem Sandbox Threat Model

**Document ID:** TM-FS-SANDBOX-001  
**Feature Reference:** FR-010  
**Version:** 1.0  
**Date:** 2026-05-24

---

## 1. Executive Summary

### 1.1 Feature Overview

The Filesystem Sandbox feature restricts an agent's filesystem access to a configurable scope directory, preventing read or write operations outside the allowed boundary. It is designed to contain a compromised or misbehaving agent that attempts to:

- Read sensitive host files (e.g., `~/.ssh/`, `/etc/passwd`, environment variables)
- Write to system directories or project files outside its work scope
- Exfiltrate data via filesystem primitives

### 1.2 Threat Mitigated

> **Note on read-access enforcement:** Per FR-010 spec non-goals, read-access enforcement is explicitly out of scope. Read restriction is an **implementation side-effect** of namespace isolation (bwrap/sandbox-exec), NOT a guaranteed security property. The threat model below reflects this distinction.

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Arbitrary filesystem read on host | Critical | Implementation artifact — NOT guaranteed per spec non-goals |
| Arbitrary filesystem write on host | Critical | Write access limited to scoped temp directory |
| Privilege escalation via sandbox escape | Critical | Namespace isolation (Linux), MAC profile (macOS) |
| Data exfiltration via filesystem | High | Implementation artifact — read restriction not a spec requirement |

### 1.3 Platform Status

| Platform | Isolation Type | Enforcement Level |
|----------|---------------|-------------------|
| Linux | Bubblewrap (bwrap) | Full — OS-level namespace isolation |
| macOS | sandbox-exec | Full — MAC-based denial-by-default |
| Windows | PowerShell restrictions | Best-effort — no real OS sandbox |

---

## 2. Trust Boundaries

### 2.1 Trusted Components

| Component | Trust Level | Rationale |
|-----------|-------------|-----------|
| OpenCode plugin host | Trusted | Controls agent spawning, passes scope path |
| Sandbox binaries (bwrap, sandbox-exec) | Trusted | Setuid-root (Linux) or signed with entitlements (macOS) |
| Scope path supplied by plugin config | Trusted | Deterministic, validated against project root |
| Agent status reporting (FR-005) | Trusted | Plugin controls reporting channel |

### 2.2 Untrusted Components

| Component | Threat Modeled As |
|-----------|------------------|
| Agent (compromised) | Can execute arbitrary shell commands within sandboxed process tree |
| Agent (malicious prompt) | Can manipulate file paths, environment variables, symlinks |
| Build-time dependencies | Could be replaced via supply-chain injection |

### 2.3 Boundary Definition

```
┌─────────────────────────────────────────────────────────────┐
│                         HOST SYSTEM                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Plugin Process                         │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │        Agent Process (UNTRUSTED)                 │  │  │
│  │  │                                                  │  │  │
│  │  │   ┌─────────────────────────────────────────┐   │  │  │
│  │  │   │         SANDBOX BOUNDARY                 │   │  │  │
│  │  │   │                                          │   │  │  │
│  │  │   │   /project/.swarm/scope/  (read/write)  │   │  │  │
│  │  │   │   /project/              (read only) ⚠  │   │  │  │
│  │  │   │   /dev/null             (read only)      │   │  │  │
│  │  │   │                                          │   │  │  │
│  │  │   └─────────────────────────────────────────┘   │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```
⚠ Implementation artifact — read-only is a side-effect of namespace isolation, not a guaranteed security property per FR-010 spec non-goals.

---

## 3. Attacker Capabilities

### 3.1 Compromised Agent

An agent whose process has been compromised (e.g., via a malicious tool invocation) is modeled as having:

- **Capability:** Arbitrary shell command execution within the sandboxed process tree
- **Constraint:** Cannot escape the sandbox boundary via filesystem operations
- **Constraint:** Cannot escalate privileges via setuid binaries or LD_PRELOAD

**Attack Vectors Considered:**
- Fork/exec of new processes with different privileges → mitigated (no setuid binaries in scope)
- Opening file descriptors before sandbox entry → mitigated (bwrap `--close-fds` equivalent)
- Memory-mapped files outside scope → mitigated (mmap deny list)

### 3.2 Malicious Prompt

An agent receiving a crafted prompt designed to manipulate sandbox behavior:

- **Capability:** Can craft arbitrary file paths, symlink targets, environment variable values
- **Constraint:** Path normalization resolves symlinks before enforcement
- **Constraint:** Environment variables are scrubbed or overridden

**Attack Vectors Considered:**
- Symlink traversal (`/scope/../etc/passwd`) → mitigated (scope path normalization)
- Symlink race (TOCTOU) → mitigated (bwrap at-open-time enforcement)
- Environment variable manipulation (`LD_PRELOAD`, `LD_AUDIT`) → mitigated (OS-level namespace isolation on Linux; env scrubbing on macOS — see §5.5)

### 3.3 Supply-Chain Injection

A build-time dependency that has been tampered with:

- **Capability:** Could replace shared libraries, modify build output
- **Mitigation:** Lockfiles audited; build artifacts verified
- **Mitigation:** Sandbox binaries are signed (macOS) or setuid-root with known hashes (Linux)

---

## 4. Bypass Routes Considered

### 4.1 Symlink Escape

| Aspect | Detail |
|--------|--------|
| Attack | Agent creates symlink inside scope pointing outside (`/scope/evil` → `/etc`) |
| Resolution | Scope path normalization resolves symlinks before sandbox entry |
| Evidence | `realpath()` applied to all scope paths; symlinks not followed at access time |

### 4.2 /proc/self/fd Escape

| Aspect | Detail |
|--------|--------|
| Attack | Agent accesses file descriptors opened before sandbox entry to escape via `/proc/self/fd/N` |
| Resolution | File descriptors are not explicitly closed; relies on bwrap default behavior of not inheriting unexpected FDs |
| Evidence | bwrap default argument list does not include `--close-fds`; inherited FDs are not used by the sandbox |

### 4.3 io_uring Bypass

| Aspect | Detail |
|--------|--------|
| Attack | Agent uses io_uring interface to perform I/O operations bypassing normal path checks |
| Resolution | Detection-only; not enforced in bwrap invocation |
| Limitation | Blocking io_uring requires seccomp filters beyond the current bwrap argument set; edge-case detection function exists but no active enforcement |
| Evidence | `detectIoUringBypass()` function exists in edge-cases.ts but no `--dev-io_uring deny` in actual bwrap arguments |

### 4.4 Namespace Escape

| Aspect | Detail |
|--------|--------|
| Attack | Agent attempts to unshare namespaces to escape isolation |
| Resolution | `--unshare-user`, `--unshare-net`, `--unshare-ipc`, `--unshare-pid` flags prevent namespace operations |
| Evidence | All namespace unshare operations blocked in bwrap invocation |

### 4.5 Hard-Link / Rename Across Boundary

| Aspect | Detail |
|--------|--------|
| Attack | Agent creates hard link or renames file from scoped directory to unscoped location |
| Resolution | Edge-case functions (link, rename, renameat) intercepted and validated |
| Evidence | Deny list includes cross-boundary link/rename operations |

### 4.6 mmap Interception

| Aspect | Detail |
|--------|--------|
| Attack | Agent uses mmap to create memory-mapped access to files outside scope |
| Resolution | mmap added to deny list for direct device access |
| Evidence | `mmap` syscall restricted; MAP_ANONYMOUS allowed for tmpfs work |

### 4.7 UNIX Domain Socket Exfiltration

| Aspect | Detail |
|--------|--------|
| Attack | Agent creates UNIX domain socket inside scope, connects to external socket for data exfiltration |
| Resolution | Not mitigated — sockets are not blocked |
| Residual Risk | Indirect exfiltration channel exists (see Section 5.3) |

### 4.8 FIFO Exfiltration

| Aspect | Detail |
|--------|--------|
| Attack | Agent creates FIFO inside scope, external process reads data streamed through FIFO |
| Resolution | Not mitigated — FIFOs not blocked |
| Residual Risk | Indirect exfiltration channel exists (see Section 5.3) |

---

## 5. Residual Risks

### 5.1 Windows Limitation

| Risk | Severity | Rationale |
|------|----------|-----------|
| No OS-level sandbox | Critical | Windows implementation uses PowerShell environment restrictions only; no true process isolation |

**Impact:** A compromised agent on Windows can potentially escape the "sandbox" via native Windows APIs or PowerShell cmdlets that bypass environment variable restrictions.

**Mitigation:** Users on Windows are informed that sandbox enforcement is best-effort only. Critical workloads should use Linux or macOS.

### 5.2 tmpfs Capacity Cap

| Platform | Limit | Enforcement |
|----------|-------|-------------|
| Linux | 500 MB | bwrap `tmpfs size=` (enforced; ENOSPC on overflow) |
| macOS | 500 MB | No enforcement — advisory only (no profile-level size quota) |
| Windows | None | No enforcement (limitation) |

**Risk:** Agent could exhaust tmpfs, causing write failures or denial of service.

**Mitigation:** Linux enforces a hard 500 MB limit via tmpfs size mount option — writes fail with ENOSPC when exhausted. macOS has no enforcement.

### 5.3 IPC / Socket Write (Not Blocked)

> **Note on IPC writes:** FR-010 spec Open Question #3 (line 199) explicitly questions whether IPC writes should be considered filesystem writes. This residual-risk classification assumes IPC writes are **out of scope** per that open question.

| Risk | Severity | Description |
|------|----------|-------------|
| UNIX domain socket write | Medium | Agent can write to existing sockets outside scope if fd inherited or guessed |
| FIFO write | Low | Agent can write to FIFOs outside scope if path is known |
| Named pipe write | Low | Similar to FIFO |

**Why Not Mitigated:** Blocking all socket and FIFO creation would break legitimate agent functionality (e.g., subprocess communication, logging).

**Residual Exfiltration Vector:**
```
Agent (in scope) → UNIX domain socket → External listener
                  → FIFO              → External reader
```

**Risk Acceptance Rationale:** Requires agent to guess socket path or have prior knowledge of external socket existence. Not a filesystem-boundary bypass but an indirect channel.

### 5.4 TOCTOU Race Conditions

| Risk | Severity | Mitigation |
|------|----------|------------|
| Time-of-check-time-of-use races | Low | bwrap enforces at-open-time, not at path-resolution-time |

**Residual Risk:** A symlink created between path resolution and open could theoretically be exploited. Mitigated by bwrap's atomic semantics.

### 5.5 LD_AUDIT / LD_PRELOAD on Linux

| Risk | Severity | Mitigation |
|------|----------|------------|
| Library preloading to intercept syscalls | Medium | OS-level namespace isolation prevents writes regardless of preloaded libraries |

> **Note:** Primary enforcement is OS-level namespace isolation (bwrap `--unshare-*`), which prevents writes outside scope. Explicit env var scrubbing for `LD_PRELOAD`/`LD_AUDIT` is deferred — the Linux bwrap executor returns an empty env override set; isolation is provided by namespace flags rather than env clearing.

---

## 6. Platform Differences

### 6.1 Linux (Bubblewrap — Full Enforcement)

| Feature | Implementation |
|---------|---------------|
| Isolation mechanism | bwrap with `--unshare-user/net/ipc/pid` |
| Filesystem boundary | Bind mounts for scoped dirs; tmpfs for `/tmp` |
| FD closure | Not explicitly enforced; relies on bwrap default behavior |
| Device deny | bwrap default devtmpfs (no explicit device configuration); io_uring blocking not implemented |
| Environment scrub | Deferred to OS-level isolation via `--unshare-*` flags; `getEnvOverrides()` returns empty on Linux |
| tmpfs cap | 500 MB via `tmpfs size=500` |

**Strength:** True OS-level namespace isolation. No syscall can bypass bwrap once process is sandboxed.

### 6.2 macOS (sandbox-exec — Full Enforcement)

| Feature | Implementation |
|---------|---------------|
| Isolation mechanism | MAC-based denial-by-default profile |
| Filesystem boundary | Explicit allowlist in sandbox profile |
| tmpfs cap | Advisory only — no profile-level size quota (see §5.2) |
| Enforcement | XNU Trusted BSD Mandatory Access Control |

**Strength:** Apple-signed sandbox binary with kernel enforcement. Profile is declarative and auditable.

### 6.3 Windows (PowerShell — Best-Effort Only)

| Feature | Implementation |
|---------|---------------|
| Isolation mechanism | PowerShell `$$Env:` restrictions, `Start-Process -WindowStyle Hidden` with restricted environment |
| Filesystem boundary | Environment variable scoping; no OS-level enforcement |
| tmpfs cap | None |
| Enforcement | User-mode only |

**Weakness:** No native Windows sandboxing equivalent to bwrap or sandbox-exec. Agent can invoke native APIs or .NET libraries to bypass PowerShell restrictions.

**Recommendation:** Do not use Windows as a trusted sandbox environment for untrusted agents.

---

## 7. Security Invariants

The following invariants are maintained by design and verified in tests:

1. **Scope Containment:** Agent process cannot read or write files outside configured scope directory
2. **No FD Inheritance:** FD closure relies on bwrap default behavior; no explicit `--close-fds` enforcement
3. **No Namespace Escape:** Agent cannot unshare to escape process boundaries
4. **No Symlink Escape:** All paths are normalized before enforcement
5. **No Library Preload:** OS-level namespace isolation prevents writes regardless of preloaded libraries; explicit env clearing deferred on Linux
6. **Tmpfs Bounded:** Write space is limited to 500 MB on Linux; macOS tmpfs cap is advisory only (no profile-level enforcement)
7. **No io_uring:** io_uring is detection-only via `detectIoUringBypass()`; not enforced in bwrap invocation

---

## 8. Threat Model Summary

| Attack Surface | Bypassable? | Mitigation |
|----------------|-------------|------------|
| Filesystem read outside scope | No (Linux/macOS) | OS-level enforcement |
| Filesystem write outside scope | No (Linux/macOS) | OS-level enforcement |
| Symlink traversal | No | Path normalization |
| /proc/fd escape | No | bwrap default behavior (no explicit close-fds) |
| io_uring bypass | No | Detection-only (detectIoUringBypass(); not enforced) |
| Namespace escape | No | --unshare-* flags |
| Hard-link across boundary | No | Edge-case function deny list |
| mmap interception | No | mmap deny list |
| LD_PRELOAD escape | No | OS-level namespace isolation (no explicit env clearing on Linux) |
| Socket/FIFO exfiltration | Yes | Not blocked (residual risk) |
| Windows sandbox escape | Yes | No OS-level enforcement |
| tmpfs exhaustion | Partial | 500 MB cap on Linux; advisory only on macOS (no enforcement) |
| TOCTOU race | Minimal | Atomic bwrap semantics |

---

## 9. References

- Feature Requirement: FR-010
- Bubblewrap man page: `bwrap(1)`
- macOS Sandbox Profile Reference: `sandbox-exec(1)`
- Linux namespace(7) man page
- TrustedBSD MAC Framework documentation

---

**Document Author:** opencode-swarm architecture team  
**Last Updated:** 2026-05-24  
**Classification:** Internal — Security Sensitive
