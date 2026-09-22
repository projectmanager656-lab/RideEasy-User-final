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

- Explicitly distinguishes VERIFIED vs CODE-LEVEL VERIFIED vs NOT TESTED DUE TO EXTERNAL DEPENDENCY, and does not want errors hidden; only claim something works if actually verified or provable by code analysis. Confidence: 0.8

- Expects a detailed structured final report: itemized files created/modified/removed, dependencies added/removed, required env var names (never values), compatibility status per app (frontend API + socket + lifecycle), tests actually run, and remaining warnings/untested areas. Confidence: 0.75

- Wants explicit go/no-go guidance before destructive steps (e.g. which files are safe to delete, whether it's safe to remove a folder) rather than unilateral cleanup. Confidence: 0.7

- Works on Windows and prefers PowerShell-based commands (e.g. commands to install deps and start services). Confidence: 0.6