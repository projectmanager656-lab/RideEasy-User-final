# RideEasy — Affordable Cab Booking Platform

A production-ready cab booking platform similar to Ola/Uber for **Pune** and **Kolhapur District**, with lower fares and a simple driver subscription model.

## Tech Stack

| Layer    | Technology        |
|----------|-------------------|
| Frontend | React, TailwindCSS, Vite |
| Backend  | Node.js, Express.js |
| Database | MongoDB with Mongoose |

## Project Structure

```
├── backend/                    # API (Node + Express)
│   ├── src/
│   │   ├── config/           # db, env, jwt, cors
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── socket/
│   │   ├── utils/
│   │   ├── validators/
│   │   ├── tests/
│   │   ├── scripts/          # e.g. seed-test-captain
│   │   └── app.js
│   ├── api/                  # Vercel serverless entry
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/         # apiClient.js, http.js (axios + auth)
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── config/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── android/              # Capacitor (single copy)
│   ├── public/
│   └── package.json
├── docs/                     # ENVIRONMENT.md, API_CONVENTIONS.md, …
├── scripts/                  # repo-level (e.g. smoke-api.mjs)
├── .env.example              # explains where real .env files live (not auto-loaded)
└── README.md
```

Env file locations and copy-paste setup: **`docs/ENVIRONMENT.md`**. API response shapes: **`docs/API_CONVENTIONS.md`**.

## MongoDB Connection

- Connection is handled in **`backend/src/config/db.js`**.
- Uses `process.env.MONGO_URI`. If not set, falls back to `mongodb://127.0.0.1:27017/rideeasy` (see `getMongoUri()` in `backend/src/config/env.js`).

## Environment Variables

### Backend (`.env` in `backend/`)

```env
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/<dbname>?retryWrites=true&w=majority
PORT=5001
JWT_SECRET=your_jwt_secret_key_here
NODE_ENV=development
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

- **MONGO_URI** — MongoDB Atlas (or local) connection string.  
- **JWT_SECRET** — Used for user, driver, and admin tokens.  
- **GOOGLE_MAPS_API_KEY** — Optional; not used by default (maps use Photon + OSRM on the server).

### Frontend (`.env` in `frontend/`)

```env
VITE_BASE_URL=http://localhost:5001
```

- **VITE_BASE_URL** — Backend API URL. Maps use **Leaflet + OpenStreetMap** in the browser; search/fare use **Photon** (komoot) + **OSRM** on the backend — no Google Cloud account needed.

### Split apps (`user-app`, `driver-app`, `admin-panel`)

Each Vite app reads env from **its own folder** (not the repo root). For local dev, add a `.env` file (or copy from that app’s `.env.example`):

```env
VITE_BASE_URL=http://localhost:5001
```

Optional alias: `VITE_API_BASE_URL` (same value) if you prefer that name.

Install dependencies **per app** the first time:

```bash
cd user-app && npm install
cd ../driver-app && npm install
cd ../admin-panel && npm install
```

From the repo root you can run:

- `npm run dev:user` — passenger app (default Vite port, usually 5173)
- `npm run dev:driver` — driver app (see `driver-app/vite.config.js` for port, often 5174)
- `npm run dev:admin` — admin web console (port 5175)

Keep the backend running (`http://localhost:5001`) while using these.

### Login not working?

1. **Start MongoDB** (local or Atlas) and run **`cd backend && npm install && node server.js`** (API on port **5001**).
2. In **`backend/.env`**, set **`JWT_SECRET`** to a long random string (32+ chars). Without it, `/users/login` and `/captains/login` return **500**.
3. Use **`http://localhost:5173`** (or your app port) **or** open Vite’s **Network** URL — CORS in development allows **localhost** and **private LAN IPs** (10.x, 192.168.x, 172.16–31.x) against `http://localhost:5001`.
4. **Admin** (`admin-panel`): default dev credentials are **`DEFAULT_ADMIN_EMAIL`** / **`DEFAULT_ADMIN_PASSWORD`** in **`backend/.env`** (see **`backend/.env.example`**); if unset, the code often uses **`sm@gmail.com`** / **`123456`**.

A **repo root `.env` is not read** by `backend` or Vite apps; use `backend/.env` and each app’s `.env`. See **`docs/ENVIRONMENT.md`**.

## API responses

JSON responses are normalized toward a single shape for new code:

```json
{ "success": true, "message": "…", "data": { } }
```

Many routes still **spread** resource fields at the top level (e.g. `user`, `token`) for backward compatibility with existing clients. Errors go through the centralized handler and include `success: false` plus `message` (and optional `errors` for validation). The frontend helper `frontend/src/utils/apiBody.js` (`stripApiEnvelope`) unwraps this envelope when only `data` remains. Conventions for **new** endpoints: **`docs/API_CONVENTIONS.md`**.

Optional bootstrap admin credentials can be set via `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` (see `backend/.env.example`). Set `ADMIN_LOGIN_DEBUG=true` only when troubleshooting login.

## How to Run

### Backend

```bash
cd backend
npm install
# Create .env with MONGO_URI, PORT, JWT_SECRET
node server.js
```

Or with nodemon:

```bash
npx nodemon server.js
```

Server runs at `http://localhost:5001` (or your `PORT`).

### Frontend (PWA)

```bash
cd frontend
npm install
# Create .env with VITE_BASE_URL=http://localhost:5001
npm run dev
```

App runs at `http://localhost:5173` (or the port Vite shows).

### Build production PWA

```bash
cd frontend
npm run build
npm run preview
```

The service worker and manifest are generated at build time. Use `npm run preview` or a static host that serves HTTPS for best PWA support.

### Deploy

- **Backend**: deploy the **`backend/`** directory (Node + Express) to a server or service (e.g. VPS, Render, Railway, Fly.io) with `MONGO_URI`, `PORT`, `JWT_SECRET`, `GOOGLE_MAPS_API_KEY` configured.
- **Frontend**: deploy `frontend/dist` to any static host that supports HTTPS (Netlify, Vercel, Cloudflare Pages, S3+CloudFront, etc.).
- Set `VITE_BASE_URL` in the frontend build environment to point to your backend URL.

### Install the PWA on mobile

1. Open the deployed RideEasy URL in Chrome (Android) or Edge/Chrome (desktop).
2. Use the **Install RideEasy** button that appears in the app, or use the browser menu → **Add to Home screen / Install app**.
3. After installation, launch RideEasy from the home screen; it opens in standalone mode with its own splash screen and theme color.

---

## Android app (Capacitor)

The frontend can be wrapped as **two native Android apps** (same project, different build variants) that load your **deployed website** in a WebView and use the **same backend API**:

- **Customer app** (`com.rideeasy.app`) — opens at your site root: login, ride booking, live tracking.
- **Driver app** (`com.rideeasy.driver`) — opens at `/captain-login`: driver login, accept rides, live tracking.

In Android Studio use **Build → Select Build Variant** to choose `customerDebug`/`customerRelease` or `driverDebug`/`driverRelease`. See `frontend/ANDROID_README.md` for details.

### Prerequisites

- Node.js 18+ (LTS)
- Android Studio (with Android SDK)
- Deployed RideEasy site on HTTPS (e.g. `https://rideeasy.example.com`)

### Setup and build

1. **Set the deployed URL** (same domain for both apps):
   - **Customer:** `frontend/capacitor.config.json` → `server.url` = `https://your-actual-rideeasy-domain.com`
   - **Driver:** `frontend/android/app/src/driver/assets/capacitor.config.json` → `server.url` = `https://your-actual-rideeasy-domain.com/captain-login`

2. **Install and build**
   ```bash
   cd frontend
   npm install
   npm run build
   npx cap sync
   ```

3. **Open in Android Studio and run**
   ```bash
   npx cap open android
   ```
   Then in Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)** or run on a device/emulator.

### NPM scripts (frontend)

| Command | Description |
|--------|-------------|
| `npm run cap:sync` | Copy web assets and sync Capacitor config to `android/` |
| `npm run cap:open:android` | Open the Android project in Android Studio |
| `npm run android` | Build Vite, sync, then open Android Studio |

### Permissions

The Android app is configured with:

- `INTERNET` — load the website and API calls
- `ACCESS_NETWORK_STATE` — detect connectivity
- `ACCESS_FINE_LOCATION` — maps and ride tracking
- `ACCESS_COARSE_LOCATION` — approximate location

Users will be prompted for location at runtime when the site requests it.

## Admin Login

| Field    | Value      |
|----------|------------|
| **Email**    | `sm@gmail.com` |
| **Password** | `123456`       |

- First admin login creates this default admin if none exists.
- After login you are redirected to **Admin Dashboard** (`/admin/dashboard`).

## Features

### User Panel

- **Sign up / Login** — Name, phone, email, city (Pune/Kolhapur), password.
- **Book ride** — City, pickup, drop, vehicle type (AUTO / CAR). Pickup and drop must be within the selected city’s service area.
- **Fare** — Shown before booking (distance from map API, then formula).
- **Payment** — UPI, QR, or Cash on ride. No Razorpay keys required for basic flow.
- **Booking form** — Name, phone, pickup, drop, vehicle type, payment method; ride and payment stored in MongoDB.

### Driver Panel

- **Sign up / Login** — Name, phone, vehicle type, vehicle number, license, city (Pune or Kolhapur), password.
- **Dashboard** — View available (pending) rides, accept ride, earnings, subscription status.
- **Subscription** — Must have an active subscription to accept rides. Plans:
  - **AUTO:** Weekly ₹49, Monthly ₹149, Yearly ₹1299  
  - **CAR:** Weekly ₹79, Monthly ₹199, Yearly ₹1799  

### Admin Panel

- **Login** — Use admin credentials above.
- **Dashboard** — Total users, drivers, rides, revenue. **City analytics:** Pune vs Kolhapur rides, drivers, revenue.
- **Manage** — View users, drivers, rides, payments, subscriptions (with city).
- **Approve drivers** — Approve pending drivers.

## Fare Calculation

- **AUTO:** `totalFare = 25 + (distance_km × 11) + 5`  
- **CAR:** `totalFare = 40 + (distance_km × 12) + 10`  

Distance is from Google Maps Distance Matrix (or configured map API).

## Service Areas

- **Pune:** Viman Nagar, Hinjewadi
- **Kolhapur District:** Kolhapur City, Ichalkaranji, Shiroli, Hupari, Kagal

Users can only book rides within supported service areas. Drivers in the same city receive ride requests.

## MongoDB Collections

- **users** — name, email, phone, city, password (hashed).
- **drivers** (captain model) — name, phone, email, vehicleType, vehicleNumber, license, city (Pune/Kolhapur), subscriptionStatus, approved.
- **rides** — userId, driverId (captain), pickupLocation, dropLocation, city, distance, price, status, paymentMethod.
- **payments** — rideId, amount, method (paymentMode), status, type (customer_payment / driver_subscription).
- **subscriptions** — driverId, plan (weekly/monthly/yearly), price, expiryDate, status.

## Booking Flow

1. User enters pickup and drop → system gets distance (map API) and fare.
2. User selects vehicle type and sees total price.
3. User clicks “Proceed to pay” → chooses payment method (UPI / QR / Cash).
4. Ride is stored in DB; payment record created.
5. Drivers in the same city see the ride request and can accept (if subscription active).
6. Ride status: pending → accepted → ongoing → completed.

## UI Overview

- **Landing** — Hero, book ride form (with city), how it works, cities we serve (Pune + Kolhapur), driver join, pricing transparency, footer.
- **Responsive** — Mobile-first layout.
- **TailwindCSS** — Used across frontend.

## Notes

- Fix common MongoDB issues by ensuring `MONGO_URI` is correct and IP/access is allowed (e.g. Atlas network access).
- Razorpay is not required for the core flow; payment options are structured (UPI, QR, Cash) and stored in `payments`.
- Map and distance logic use **Photon** (geocoding/autocomplete), **OSRM** (routing), and **Leaflet/OSM** (tiles). No Google Maps API keys are required.
- Ride screens may offer “Open in Google Maps” as a normal web link (no API key).

---

**RideEasy** — Affordable cab booking for Pune & Kolhapur. MVP-ready for a real startup launch.
# cab
