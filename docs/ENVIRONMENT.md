# Environment files

| Location | Loaded by | Purpose |
|----------|-----------|---------|
| `backend/.env` | `backend/server.js` via `dotenv` (cwd = `backend/`) | MongoDB, JWT, CORS, optional Sentry, Razorpay, etc. |
| `frontend/.env`, `frontend/.env.production` | Vite (`import.meta.env`) | `VITE_BASE_URL`, feature flags |
| Repo root `.env` | **Nothing in this repo** | Optional for your own tools; not read by `npm run dev:backend` or Vite |

## Setup

1. `cp backend/.env.example backend/.env` and fill secrets.
2. `cp frontend/.env.example frontend/.env` and set `VITE_BASE_URL` to your API origin (no trailing slash).

## Root `package.json` scripts

Scripts use `npm --prefix backend` and `npm --prefix frontend`. They do **not** load a root `.env`.

## Production

Set the same variables in your host’s environment (Render, Railway, etc.) or inject `.env` in the deployed `backend` directory. See `docs/PRODUCTION_LIVE.md`.
