# Skill Documentation Improvements

## What changed
- **`commit-pr` skill**: Added `dist-check version mismatch` troubleshooting subsection under `Pre-existing failure handling`. Documents how to diagnose and resolve CI failures caused by stale `dist/` artifacts on `origin/main` (e.g., after release-please version bumps without corresponding dist rebuilds).
- **`ci-failure-resolver` skill**: Added `Externalize large runtime dependencies` remediation option to the `BUNDLE SIZE REGRESSION` protocol. Documents `--external <package>` as a size reduction technique, with caveats about production dependencies and lost tree-shaking optimizations.

## Why
These improvements capture hard-won lessons from PR #947:
- The `dist-check` failure on that PR was caused by a pre-existing version mismatch on `main`, not by the PR's changes. Contributors need guidance to recognize and resolve this pattern without unnecessary debugging.
- The `--external` option is already used in the project's CLI build (`--external bash-parser`) but was not documented in the skill's bundle size remediation guidance.

## Migration
No migration required. These are documentation-only changes to skill files.

## Known caveats
- The `dist-check` diagnosis commands use Unix-style `/tmp/` paths, consistent with the existing skill conventions. Windows users may need to adapt paths.
- `--external` removes bundler optimizations (tree-shaking, inlining) for the externalized package. Verify the package's full runtime footprint is acceptable before using this option.
