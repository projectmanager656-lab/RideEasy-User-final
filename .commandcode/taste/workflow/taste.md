# Workflow Preferences

- Audit and understand the existing behavior — tracing the full runtime path end-to-end — before changing any code; do not guess. Confidence: 0.85
- Diagnose against the actual runtime environment (running processes, listening ports, active configs, logs) rather than assumed state. Confidence: 0.7
- When a case fails while a similar one works, gather concrete evidence (logs/DB records) and compare them field-by-field instead of speculating. Confidence: 0.7
- Validate work by actually running tests, frontend builds, and lint on the changed files. Confidence: 0.7
- Only report something as verified when it was genuinely tested (e.g., on physical devices); otherwise flag it as still needing manual testing. Confidence: 0.75
