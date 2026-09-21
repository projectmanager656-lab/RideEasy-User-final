# Taste

## Communication
- Gives detailed, numbered, step-by-step implementation specs that name exact file paths, functions, and events; expects each item to be addressed (or explicitly deviated from with a reason) and reported back per item. Confidence: 0.65

## Workflow
- Works in the repository concurrently while the agent runs — files (e.g. `ride.controller.js`) change externally between reads. Expects the agent to re-read before editing rather than trust cached content, and not to clobber unrelated in-progress work. Confidence: 0.6

## Config / Tooling
- Prioritizes local/dev testability: wants hardcoded thresholds (e.g. driver search radius) relaxed or made environment-overridable so features can be exercised without strict constraints. Confidence: 0.5
