# RideEasy Android Apps (Capacitor)

Two Android app builds share the **same bundled web app** (`dist/`) and **`frontend/.env.production`** for the API:

| Build | App ID | Start screen |
|-------|--------|----------------|
| **Customer** | `com.rideeasy.app` | `/` (landing) |
| **Driver** | `com.rideeasy.driver` | Redirects to `/captain-login` |

The API URL is **baked in at build time** (`VITE_BASE_URL`, must be **HTTPS** for real devices, e.g. `https://your-api.onrender.com`). The WebView origin is **`https://localhost`**, which the backend already allows for Capacitor.

---

## Quick start (recommended: bundled assets)

1. Set **`frontend/.env.production`**:
   ```env
   VITE_BASE_URL=https://your-live-api.example.com
   ```
   Do **not** use `localhost` — on a phone that points at the device itself.

2. Build and sync:
   ```bash
   cd frontend
   npm run build
   npx cap sync
   npx cap open android
   ```

3. In Android Studio: **Build → Select Build Variant** → `customerDebug` / `customerRelease` or `driverDebug` / `driverRelease`, then run on a **real device** or emulator.

---

## Optional: load UI from a hosted site (`server.url`)

If you point Capacitor at Vercel (or any HTTPS site), the browser **Origin** is that site, **not** `https://localhost`. Then the backend must allow it:

- Set **`CORS_ORIGINS=https://your-site.vercel.app`** on the API, **or**
- Set **`CORS_ALLOW_VERCEL_APP=true`** (allows any `*.vercel.app` origin — only if you accept that tradeoff).

The hosted site’s build must also define **`VITE_BASE_URL`** to your HTTPS API.

---

## HTTPS and networking

- Release builds use **network security config**: cleartext is **off** for the public internet; only loopback / emulator bridge domains allow HTTP (for local tooling).
- **`capacitor.config.json`** uses **`androidScheme: "https"`** and **`cleartext: false`** so the WebView matches secure context expectations for your API.

---

## Building Customer vs Driver APKs

| Output | Build variant |
|--------|----------------|
| Customer | `customerDebug` / `customerRelease` |
| Driver | `driverDebug` / `driverRelease` |

Same `npm run build` output; driver flavor uses `com.rideeasy.driver` and the app redirects `/` → `/captain-login` on launch.

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Production Vite build → `dist/` |
| `npm run cap:sync` | Copy `dist/` + config into `android/` |
| `npm run android` | Build + sync + open Android Studio |

---

## Permissions

- **Internet** — API + maps
- **Network state** — connectivity
- **Fine & coarse location** — maps and ride tracking
