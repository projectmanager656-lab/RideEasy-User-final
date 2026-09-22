# Taste

- Gives detailed, numbered, step-by-step implementation specs that name exact file paths, functions, and events; expects each item to be addressed (or explicitly deviated from with a reason) and reported back per item. Confidence: 0.65

- Works in the repository concurrently while the agent runs — files (e.g. `ride.controller.js`) change externally between reads. Expects the agent to re-read before editing rather than trust cached content, and not to clobber unrelated in-progress work. Confidence: 0.6

- Uses the physical Android test device/installed app himself while the agent works — screens and routes change between commands (e.g. landing on bottom-nav destinations) with no agent navigation, so an unexpected mid-boot route is likely the user's own interaction rather than a regression; settle/re-read before reporting a failure. Confidence: 0.5

- Prioritizes local/dev testability: wants hardcoded thresholds (e.g. driver search radius) relaxed or made environment-overridable so features can be exercised without strict constraints. Confidence: 0.5

- Physical Android/Capacitor builds must never point at `localhost` (inside the WebView localhost is the phone itself); the backend URL must be one centralized base URL set to a deployed HTTPS backend or the Mac LAN IP (`http://<MAC-LAN-IP>:5001`), never hardcoded per component, and wrong localhost refs in app/backend source are to be grepped out. Confidence: 0.7

- CORS must deliberately allow both browser development and the Capacitor Android WebView origin without falling back to insecure wildcard `*` and without breaking credentialed/authenticated (Authorization header) requests. Confidence: 0.6

- Mobile API client timeout should suit real phone networks: not an extremely short value, and never "fixed" by raising it indefinitely — the actual cause of a timeout is found and fixed rather than masked. Confidence: 0.6

- In this multi-app stack (user-app, driver-app, admin, Backend), requires EVERY app to target ONE shared backend: the same public HTTPS URL for both REST (`VITE_BASE_URL`) and Socket.IO (`VITE_SOCKET_URL`), with Socket.IO attached to the same Express HTTP server (no separate socket server), because a ride created against one backend can never be delivered to a client connected to another. For production Android builds explicitly forbids `localhost` AND private LAN ranges (`192.168.x.x`, `10.x.x.x`, `172.16.x.x`) — the apps must use the publicly deployed HTTPS backend so they work across different networks. Confidence: 0.75

- Expects a thorough read-only inspection of the whole project (architecture, frontend/backend contracts, models, auth, realtime) BEFORE any file is modified. Confidence: 0.8

- Prefers one canonical implementation as the single source of truth; do not create duplicate/parallel copies or extra "New"/"Merged"/"Final" folders when an existing location is the intended final destination. Confidence: 0.7

- Wants staged, clearly-phased execution (analyze → decide → change → validate → report), with a plan/todo list tracked along the way. Confidence: 0.6

- Prefers the smallest possible change; do not refactor working code, redesign UI, or restructure the project just because another architecture looks cleaner. Confidence: 0.8

- Wants changes kept backward-compatible with existing consumers; do not rename APIs, endpoints, or Socket.IO events unnecessarily. Confidence: 0.75

- Preserve existing working functionality and response/API contracts first; understand why two implementations differ before changing anything. Confidence: 0.7

- Never hard-code credentials/secrets (JWT secrets, DB creds, API keys, payment secrets) and never copy secret values from an old `.env`; document only env var names and their purposes. Confidence: 0.85

- Explicitly distinguishes VERIFIED vs CODE-LEVEL VERIFIED vs NOT TESTED DUE TO EXTERNAL DEPENDENCY, and does not want errors hidden; only claim something works if actually verified or provable by code analysis. Confidence: 0.85

- Expects a detailed structured final report: itemized files created/modified/removed, dependencies added/removed, required env var names (never values), compatibility status per app (frontend API + socket + lifecycle), tests actually run, and remaining warnings/untested areas. Confidence: 0.8

- Explicitly bounds each task to named folders/files ("work on X only") and expects everything else left untouched — no edits to sibling apps, no deletions as cleanup, no unrelated refactoring, no new packages. Confidence: 0.75

- Wants the root cause diagnosed and stated before any fix is written, insists on inspecting the real implementation instead of assuming file names, event names, response shapes, or status values, and expects the reported bug to be empirically reproduced (in an isolated environment) with the exact value/instant traced through every stage of the pipeline before any code changes — no guessed causes, no workaround patches, no "faked" fix. Confidence: 0.85

- Treats the backend/database as the single authoritative source of state: no duplicating logic (e.g. generating IDs/OTPs) on the frontend, no introducing polling where an existing socket channel can carry the update, and no reload/navigation hacks. Confidence: 0.7

- For realtime/async code, expects explicit resilience to race conditions, reconnects, duplicate events, remounts and partial payloads — without introducing duplicate requests or duplicate listeners. Confidence: 0.6

- Security-conscious about data exposure: sensitive per-user data must travel only over the authenticated owner's private channel (never broadcast/city/role rooms, unauthenticated endpoints, or logs), and should be stripped from shared payloads. Confidence: 0.6

- For layout/alignment bugs, prefers robust structural CSS (flex/grid, pseudo-elements, centre-to-centre geometry) over hard-coded per-element pixel positions, keeping geometry independent of content/label width. Confidence: 0.55

- Wants explicit go/no-go guidance before destructive steps (e.g. which files are safe to delete, whether it's safe to remove a folder) rather than unilateral cleanup. Confidence: 0.7

- Works on Windows and prefers PowerShell-based commands (e.g. commands to install deps and start services). Confidence: 0.6

- Wants time-based/background work (scheduling, dispatch, retries, cleanup) owned by the backend as a persistent, database-driven mechanism — never frontend `setTimeout`/`setInterval`/browser timers or anything requiring the page/app to stay open; it must keep working when the app is closed, the user logs out, the device sleeps, and must survive backend restart/downtime. Confidence: 0.85

- Insists that operations which may run repeatedly or concurrently be idempotent and atomic — state-guarded so each transition, dispatch, notification or request happens exactly once, safe under repeated runs, overlapping executions and process restarts. Confidence: 0.8

- Expects values that can vary per environment (dispatch/lead times, intervals, limits, radii) to live in a single configurable setting (env/config, matching the project's existing config style) instead of being hard-coded at call sites. Confidence: 0.7

- Wants correct, unambiguous time handling: one authoritative timestamp instant held on the backend (absolute UTC at the API boundary, converted once from the client's local time), never browser-local string comparisons or server-timezone guessing. Confidence: 0.7

- Expects the genuine mechanism for a required capability, not a faked substitute (e.g. a real push-notification path rather than an in-page toast); if the real mechanism can't be fully wired up, it must be identified explicitly instead of approximated. Confidence: 0.6

- Wants tests run against an isolated, throwaway environment — a scratch test database and a dedicated server on separate ports — never against the live/production DB, and never by disturbing the user's own already-running dev servers or data (their ports and processes are left untouched). Confidence: 0.7

- Expects user-facing flows to be verified end-to-end in a real browser (e.g. Playwright/Chromium driving the actual app against a real API + database), not just via mocked unit tests or API-level calls. Confidence: 0.65

- Prefers temporary verification artifacts (scratchpad harnesses, throwaway specs, temp env files) that are deleted once the run completes, leaving no leftover test files or stray processes in the repo — the isolated test DB is dropped, the isolated ports' processes are stopped, and it is then confirmed the user's own ports/processes were never disturbed. Confidence: 0.65

- Ends a task by proving the working tree is exactly as intended: git status/diff reviewed, any tracked file a test run touched (e.g. Playwright's `.last-run.json`) restored, and the diff confirmed to contain only the agreed changed files. Confidence: 0.6

- Treats the actual current code as the source of truth and expects progress/todo trackers to be reconciled to it (mark already-implemented items complete) rather than re-implementing completed work just because a checkbox is stale. Confidence: 0.7

- Avoids redundant work: expects prior verification/test results to be reused when the code is provably unchanged, and only the relevant verification re-run if the code did change — not recreating tests, harnesses or databases from scratch. Confidence: 0.65

- Dislikes unnecessary new API endpoints/services — prefers using the existing contracts and data already available client-side (e.g. the browser's own clock) and only adds an endpoint when inspection proves the current contract genuinely requires it. Confidence: 0.6

- Expects validation enforced server-side even when the client already blocks invalid input: frontend checks are guidance for the user, never a substitute for authoritative backend validation (which returns a clear existing-style 4xx). Confidence: 0.65

- Wants behaviour driven by the currently authoritative state at the moment of action rather than a stale snapshot — e.g. a click handler re-fetches by id and routes on the live status instead of trusting status stored in the payload, and UI defaults recomputed from the current clock when a surface opens instead of cached at mount or hard-coded. Confidence: 0.6

- Derives UI presentation (badge/status label) from the canonical backend status enum rather than a duplicated friendly status label. Confidence: 0.7

- Expects pre-existing failures to be *proven* unrelated to the change rather than asserted: failing suites/lint errors are inspected to confirm they don't touch the changed code, and tests/lint are re-run scoped to just the changed files, so any regression is unambiguously attributable to the change. Confidence: 0.65

- Wants time-dependent test fixtures placed far enough in the future that they cannot go stale or trip real background behaviour mid-run, and any unexpected change in seeded data investigated as a possible real product bug (logs, process uptime, DB state) before being dismissed as an environment artifact. Confidence: 0.6

- Reports observations that fall outside the agreed scope as explicitly flagged and unproven (with the theoretical risk noted) instead of silently ignoring them, overstating them, or fixing them without permission. Confidence: 0.6

- When resolving merge/rebase conflicts, expects a true union of both sides: every function, export, endpoint and route from their work AND the teammate's incoming changes must survive, with nothing omitted, overwritten or silently dropped. Confidence: 0.7

- Expects the agent to carry git operations through to completion — stage, `rebase --continue`, and push the shared branch to the remote — not just leave resolved files sitting in the working tree. Confidence: 0.6

- Wants its own taste/notes file kept clean across merges: conflict markers removed and no duplicated bullets after reconciling both sides. Confidence: 0.5
