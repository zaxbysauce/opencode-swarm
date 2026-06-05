# Repository QA Standards

These standards apply to all Copilot interactions including code generation and PR review.

## Mandatory PR publication protocol

These instructions apply to Copilot cloud agent, custom Copilot agents, Copilot code review, and any AI agent assigned to a GitHub issue in this repository.

Before committing, pushing, opening a pull request, updating a pull request body, marking a pull request ready, or claiming CI/merge readiness, load and follow:

1. `.github/skills/commit-pr/SKILL.md`
2. `.agents/skills/commit-pr/SKILL.md`
3. `.claude/skills/commit-pr/SKILL.md`
4. `AGENTS.md`
5. `docs/engineering-invariants.md`

The `commit-pr` skill is the only approved publication workflow.

Do not run `git push`, `gh pr create`, `gh pr edit`, or `gh pr ready` until the `commit-pr` checklist is satisfied.

### PR title requirements

Every non-release-bot PR title must exactly match:

`<type>(<scope>): <description>`

Allowed types: `feat`, `fix`, `perf`, `revert`, `docs`, `chore`, `refactor`, `test`, `ci`, and `build`.

The description must be lowercase and must not end with a period.

### PR body requirements

Every PR body must include, in this order:

1. `Closes #<issue-number>` as the first line when resolving an issue, or `No issue.` as the first line when the work is maintenance-only
2. `## Summary`
3. `## Invariant audit`
4. `## Fresh-context review`
5. `## Test plan`

The test plan must list the exact commands run and their result. Do not claim validation passed unless commands were actually run or remote CI completed successfully.

### Validation requirements

Before opening or updating a PR, run the validation required by `.claude/skills/commit-pr/SKILL.md`.

At minimum, do not publish without documenting:

- build result
- typecheck result
- formatting/lint result
- relevant unit tests
- broader integration/security/smoke validation when required by the touched invariants
- any pre-existing failure proof from clean `origin/main`

If validation cannot be run because of environment limitations, keep the PR as draft and explain the limitation explicitly under `## Test plan`.

### Fresh-context review requirements

For issue-driven code changes, perform a fresh-context adversarial review before publication. Use `.github/agents/pr-reviewer.agent.md` and `.github/agents/qa-reviewer.agent.md` as read-only review checklists.

Do not claim an independent reviewer ran unless a separate Copilot/custom-agent session, human reviewer, or CI/code-review service actually reviewed the branch. If the same agent performs the check, call it a "fresh-context self-review" and include the evidence in `## Fresh-context review`.

### Issue comment requirement

If the PR closes an issue, post an issue comment containing:

- the PR link
- what changed
- how to use it
- migration steps or `No migration required`

### Hard stop

If the PR title, body, release fragment, invariant audit, fresh-context review evidence, issue comment, or validation evidence cannot be produced, do not open or mark the PR ready. Draft PRs may be opened only when the missing validation is clearly documented and the PR remains draft.

## Security

- Never hardcode secrets, tokens, API keys, or connection strings — use environment variables or a vault.
- All user input must be validated and sanitised before use.
- SQL and database queries must use parameterised statements, never string interpolation.
- No sensitive data (PII, tokens, passwords) in logs at any level.
- Public endpoints must include authentication checks and input validation.

## Reliability

- All async operations must have proper error handling (try/catch or .catch()).
- Network calls must include timeout and retry logic.
- Resource cleanup must be handled in finally blocks or equivalent.
- Avoid swallowing exceptions silently — log at minimum.

## Maintainability

- Functions must do one thing and stay under 50 lines where practical.
- No commented-out dead code — use version control instead.
- Variable and function names must be descriptive and follow project conventions.
- Avoid magic numbers and strings — use named constants.

## Performance

- Avoid unnecessary allocations in hot paths.
- Database queries must avoid N+1 patterns and use appropriate indexes.
- Large data sets must use streaming or pagination rather than loading entirely into memory.

## Testing

- All new public methods must have at least one unit test.
- Integration tests must clean up after themselves.
- Test files must be co-located with source using the pattern `<filename>.test.<ext>`.

## Code Style

- Prefer explicit types over `any` or implicit inference where possible.
- Limit line length to 120 characters.
- Use consistent indentation (spaces, not tabs) per the project's `.editorconfig`.
