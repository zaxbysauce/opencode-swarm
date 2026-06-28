## What changed

Phase 3 of issue #1388 shipped two items:

### FR-004 — Skill tool gating (released)

Seven skill-management tools are now gated behind a new `skills.enabled` config flag (default `false`):

| Tool | Description |
|------|-------------|
| `skill_generate` | Compile knowledge into draft or active skills |
| `skill_list` | List drafts and active generated skills |
| `skill_apply` | Activate a draft skill into active |
| `skill_inspect` | View full skill details |
| `skill_regenerate` | Re-cluster and update an active skill |
| `skill_retire` | Retire a skill (marks with `retired.marker`) |
| `skill_improve` | Propose skill improvements from knowledge |

With `skills.enabled: false` (default), the architect does not see these tools. With `skills.enabled: true`, they reappear in the architect's tool map. Tools remain exported and registered in the plugin — only the merged architect tool map is gated. This follows the same opt-in pattern as `external_skills.curation_enabled`.

**Config:**

```json
{
  "skills": {
    "enabled": true
  }
}
```

### FR-003 — Per-turn tool narrowing (deferred/BLOCKED_EXTERNAL)

Documented as blocked pending plugin-host SDK support for per-turn `sdkConfig.tools` rebinding. Desired behavior captured in issue #1388 spec for future implementation. Not released in this fragment.
