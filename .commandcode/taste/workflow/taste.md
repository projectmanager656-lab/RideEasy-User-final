# Workflow preferences

- Audits/inspects the full project structure and flow (frontend routes/pages/navigation/API calls, backend routes/controllers/models, socket and status flows) before making any changes. Confidence: 0.8
- Sometimes runs investigation as a strictly read-only phase: no new implementation and no file modifications at all, ending with a report so the user can decide next steps before any code is written. Confidence: 0.8
- When a feature seems missing after a merge, uses Git history forensics across all branches and commits (string/pickaxe search, blob comparisons across commits, branch membership, commit attribution) to determine whether it ever existed, which commit/branch added or removed it, and whether the merge changed its trigger or reachability. Confidence: 0.8
- The user handles Git operations themselves: do not commit or push; leave fixes in the working tree for review before the user commits. Confidence: 0.9
- Validates work with real commands (frontend lint/build, backend tests) and fixes actual errors; when a failure is clearly caused only by the local environment (e.g. Windows path issues), documents it instead of making unrelated code changes. Confidence: 0.8
- When running diagnostics, prefers throwaway/scratchpad tooling over leaving temporary scripts or test files in the repo working tree. Confidence: 0.6
