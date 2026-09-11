# Workflow preferences

- When the agent presents several concrete options (e.g. run local backend vs. point at deployed API) and asks which to take, the user delegates the choice ("fix now, make your want") and expects the agent to pick the workable option and execute immediately to get the system running end-to-end — not stall on another confirmation round. Confidence: 0.6
- Audits/inspects the full project structure and flow (frontend routes/pages/navigation/API calls, backend routes/controllers/models, socket and status flows) before making any changes. Confidence: 0.8
- Sometimes runs investigation as a strictly read-only phase: no new implementation and no file modifications at all, ending with a report so the user can decide next steps before any code is written. Confidence: 0.8
- Never blindly kills processes on a port conflict: first identifies the PID's working directory and command line (e.g. `lsof -a -p <pid> -d cwd`, `ps`) to determine whether it belongs to the current project; keeps it if it's the correct current instance and stops it only if it is stale/unrelated/trashed (e.g. a copy running from `~/.Trash`) and safe to stop. Confidence: 0.6
- When a feature seems missing after a merge, uses Git history forensics across all branches and commits (string/pickaxe search, blob comparisons across commits, branch membership, commit attribution) to determine whether it ever existed, which commit/branch added or removed it, and whether the merge changed its trigger or reachability. Confidence: 0.8
- The user handles Git operations themselves: do not commit or push; leave fixes in the working tree for review before the user commits. Confidence: 0.9
- Validates work with real commands (frontend lint/build, backend tests) and fixes actual errors; when a failure is clearly caused only by the local environment (e.g. Windows path issues), documents it instead of making unrelated code changes. Confidence: 0.8
- When running diagnostics, prefers throwaway/scratchpad tooling over leaving temporary scripts or test files in the repo working tree. Confidence: 0.6
- Before modifying code, verifies that referenced assets/files actually exist; if a required file is missing, reports it clearly rather than fabricating a substitute or altering the design to compensate. Confidence: 0.7
- After UI changes, expects verification across the entire affected page flow and across common mobile viewport sizes — no horizontal scrolling, no overflow/distortion, content readable, theme/state persisting across navigation — not just a single-page check; also expects build, lint, and console-error checks. Confidence: 0.75
- When the user says a just-fixed problem is still happening (e.g. bare "fix this" right after a fix was reported verified), treats the user's live UI as ground truth and re-runs the full flow end-to-end in the actual running app — API/curl-level checks alone can miss the remaining root cause (e.g. rate limiting caused by a polling hot-loop in other app clients). Confidence: 0.5
- ### RideEasy Workflow Quality Standard
  Treat a workflow task as complete only when the full continuous end-to-end flow works successfully, with no broken navigation, dead buttons, fake success states, disconnected screens, duplicate screens/navigation/state, or ride-state inconsistencies. Audit and test the entire User App as one connected chain: **Welcome → Authentication → OTP → Location → Home → Book Ride → Pickup → Drop → Find Trip → Route/Fare → Choose Ride → Search Driver → Driver Accepted → Driver Arriving → Driver Arrived → OTP → Start Ride → Live Ride → End Ride → Payment → Rating → Invoice → Home → Account/More**.

  Completion Requirements:
  1. Every screen must navigate to the correct next screen.
  2. Every button/action must perform its intended function.
  3. No fake success states or simulated production results.
  4. No disconnected or placeholder workflow steps.
  5. No duplicate screens, navigation stacks, API clients, socket connections, or state stores.
  6. Ride status must remain consistent across all screens.
  7. Frontend state must match the actual backend/database state.
  8. Never show a successful operation when the corresponding API/database operation failed.
  9. Pickup/drop addresses and coordinates must persist correctly through the booking flow.
  10. Route, distance, duration, fare, ride type, payment method, ride ID, driver information, and ride status must remain consistent throughout the ride lifecycle.
  11. Driver acceptance, arrival, OTP verification, ride start, live location, ride completion, payment, rating, and invoice must use the actual backend/API/Socket.IO flow where implemented.
  12. Completed rides must be correctly persisted and available in Ride History.
  13. Invoice must be derived from actual ride/payment data, never fabricated frontend values.
  14. Account, Profile, Ride History, Emergency Contact, Logout, Safety, and Help/FAQ flows must continue working.
  15. Existing theme, language, UI, and unrelated features must not be broken.

  Audit Before Completion:
  1. Audit the existing navigation.
  2. Audit all APIs used by the workflow.
  3. Audit Socket.IO connections and listeners.
  4. Audit ride-state management.
  5. Audit frontend/backend/database data flow.
  6. Test the complete workflow from application launch through invoice and return to Home.
  7. Test Account and More flows.
  8. Test API/database failure handling.
  9. Test relevant loading, error, retry, and empty states.
  10. Fix all discovered issues before declaring the workflow complete.

  Definition of Done: The RideEasy User App must work as one continuous, connected, real end-to-end workflow. A screen existing or an API returning successfully in isolation is NOT sufficient — the complete chain must be verified and the resulting data must persist correctly in the backend/database. Confidence: 0.85
- For end-to-end workflow audits against live servers, requires a strict per-step PASS/FAIL/BLOCKED report: for every workflow step include the screen/page, action tested, API endpoint/request used, Socket.IO event (if applicable), backend response/status, database persistence result, navigation result, and exact error on failure with the responsible file/component/API. A step must NOT be marked PASS just because the screen loads — the actual connected chain must be verified. Confidence: 0.85
- Sequencing preference for workflow audits: audit first strictly read-only (no code changes), deliver the full PASS/FAIL/BLOCKED baseline report, and only afterward propose/begin fixes; when something fails, report it as "FAIL → Root cause → File/component/API → Recommended fix" rather than fixing inline during the audit. Confidence: 0.85
- After the baseline audit, applies fixes in a strict priority order (critical end-to-end blockers → backend/API contract issues → socket/ride-state issues → navigation/state issues → UI/dead-button issues) using the smallest minimal changes. For each issue, first identify "Failure → Root cause → File/component/API → Minimal fix," then after implementing verify "Fix → Test → Result" and confirm it did not break previously-passing steps, then re-run the full end-to-end workflow before reporting completion. Confidence: 0.8
- For "connect backend and user app" tasks, treats connectivity as needing the actual servers running end-to-end: confirms both running processes are the current project's instances (identified by PID + cwd/lsof, not config files) rather than a stale/trashed/duplicate copy holding the port, installs missing deps without touching backend source, then proves the chain with a CORS preflight from the frontend origin (checking Access-Control-Allow-Origin/Methods/Headers), a health/live check (reusing an existing endpoint, never creating/modifying one), a real unauthenticated and authenticated API round-trip that reaches the running backend (no mocks/fake success/static JSON — e.g. register returns real 201 with hashed user + JWT, profile returns real DB record), and a real Socket.IO client connection with a JWT — and reports PASS/FAIL for each. Confidence: 0.8
