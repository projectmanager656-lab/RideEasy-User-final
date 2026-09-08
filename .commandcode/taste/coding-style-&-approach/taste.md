# Coding style & approach
- Prefers surgical, minimal fixes over rewriting or rebuilding an app; when asked to remove a UI element (e.g. a nav tab), removes only that item and keeps the remaining items, layout, and styling exactly as they are. Explicitly forbids removing existing working functionality, deleting backend features to make the frontend compile, and replacing existing UI/branding/theming unnecessarily. Confidence: 0.95
- Prefers fixing routing, imports, and paths over creating anything new: never create a duplicate page/component/route if an equivalent already exists — wire the existing one up instead. Confidence: 0.9
- Prefers real backend integration over mock data whenever a real API exists; use existing API functions/contexts/models/controllers/routes rather than new parallel implementations. Confidence: 0.8
- Respects existing environment-based API config (e.g. VITE_* base URLs / apiBaseUrl helpers); do not hardcode backend URLs. Confidence: 0.8
- Dislikes hiding problems: no eslint-disable to silence errors, no deleting functionality to pass validation; fix the actual root cause and only touch files related to the issue. Confidence: 0.8
- When merging/repairing a project with contributions from multiple developers, keep the working functionality from all contributors rather than favoring one implementation. Confidence: 0.7
- Prefers reusing existing storage/session/onboarding state to gate a flow rather than inventing new flags; explicitly wants a search for an existing "step completed" mechanism before any new state is added. Confidence: 0.7
