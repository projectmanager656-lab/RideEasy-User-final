# Taste
- Prefers minimal, targeted changes: keep all existing working functionality, design, colors, layouts, and navigation unchanged unless a specific change is strictly necessary for the fix. Confidence: 0.9
- Wants root causes fixed, not just the visible UI symptoms. Confidence: 0.9
- Expects the existing architecture and conventions to be reused (e.g. "use the existing socket architecture") rather than introducing parallel mechanisms. Confidence: 0.8
- Expects regression tests added or updated for behavioral changes, covering the fixed flows end to end (including negative/blocked cases). Confidence: 0.85
- Expects full validation: run the targeted tests, the full suite, frontend build and lint; build/sync any other app whose code changed. Confidence: 0.8
- Never overstate verification — do not claim real-device or manual testing unless it was actually performed. Confidence: 0.85
- Proves pre-existing test failures with a pristine baseline (e.g. a detached `git worktree` at HEAD) and compares failing-suite/test counts against it before attributing failures to the change; cleans up the temporary baseline afterwards. Confidence: 0.7
- Keeps diffs clean by introducing no new lint warnings/errors: treats pre-existing lint issues as out of scope, and fixes genuine new issues properly (e.g. adding real deps to React hook dependency arrays) rather than suppressing them. Confidence: 0.75
- Prefers an explicit structured final report: root cause of each issue, how it was fixed, files changed, tests passed/failed, and build results. Confidence: 0.8
