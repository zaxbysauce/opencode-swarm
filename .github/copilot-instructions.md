# Repository QA Standards

These standards apply to all Copilot interactions including code generation and PR review.

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
