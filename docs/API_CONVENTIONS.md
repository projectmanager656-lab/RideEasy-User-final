# API response conventions

## Current behaviour (do not break without a client release)

Success responses from `utils/apiResponse.js` **`ok()`** include:

- `success: true`, `ok: true`, `message`
- Resource fields are often **spread at the top level** together with a `data` object when `data` is non-empty (legacy mobile/web clients expect flat `user`, `token`, `rides`, etc.).

Errors use **`fail()`** or `errorHandler.middleware.js`: `success: false`, `ok: false`, `message`, optional `errors`.

## Frontend

Use `stripApiEnvelope()` (`frontend/src/utils/apiBody.js`) when reading responses so both `data`-only and flat shapes work.

## New endpoints (recommended)

When adding routes, prefer keeping **`ok(res, req, status, message, payload)`** as today so all clients keep working. If you introduce a stricter shape later, version the path (e.g. `/api/v2/...`) or gate behind a header instead of changing existing JSON fields.
