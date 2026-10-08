# Taste — General Preferences

- Wants the agent to actually execute and verify changes (start the server, run syntax checks, run tests) and prove the original error is gone — not stop after editing files. Confidence: 0.7
- Prefers minimal, tightly scoped fixes that preserve all unrelated functionality; explicitly forbids touching adjacent logic, security, or configuration outside the reported bug. Confidence: 0.65
- Expects a structured, numbered final report covering root cause, files changed, corrected code, and each verification result. Confidence: 0.6
