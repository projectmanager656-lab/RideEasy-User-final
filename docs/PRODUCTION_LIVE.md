# Live / Production — पूर्ण मार्गदर्शक (कंपनीसाठी)

> हे तांत्रिक चेकलिस्ट आहे. कायदेशीर दस्तऐवजांसाठी वकील घ्या.

---

## 1) `VITE_BASE_URL` — नेमके काय टाकायचे?

| Variable | काय आहे? | उदाहरण |
|----------|-----------|---------|
| **`VITE_BASE_URL`** | तुमच्या **Node API** चा पूर्ण HTTPS URL (पोर्टसह जर लागत असेल). Frontend येथून REST + Socket.IO host काढतो. | `https://api.majhacompany.com` |

मॅप्ससाठी Google API की लागत नाही — app **Leaflet + OSM** (frontend) आणि **Photon + OSRM** (backend) वापरते.

**फाइल:** `frontend/.env` (local) किंवा `frontend/.env.production` (build वेळी).

**लक्षात ठेवा:**
- `VITE_*` Vite build वेळी **embed** होतात — `.env` git मध्ये टाकू नका.
- Android APK मध्ये `localhost` काम करणार नाही — नेहमी **public HTTPS API**.

---

## 2) `backend/.env` (production)

```env
NODE_ENV=production
PORT=5001
MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/rideeasy
JWT_SECRET=लांब-यादृच्छिक-गुप्त-स्ट्रिंग
CORS_ORIGINS=https://app.tumcha-domain.com,https://www.tumcha-domain.com
CLIENT_ORIGINS=  # किंवा वरचेच वापरा
GOOGLE_MAPS_API_KEY=     # server-side ETA / geocode जर वापरत असाल
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
FORCE_HTTPS=true

# Optional: Sentry (error monitoring)
# SENTRY_DSN=
# SENTRY_TRACES_SAMPLE_RATE=0
```

**CORS:** फक्त तुमच्या **frontend domain** ची यादी `CORS_ORIGINS` मध्ये.

**Health checks:**  
- `GET https://api.../health/live` — process up  
- `GET https://api.../health/ready` — Mongo connected (503 if down)

---

## 3) MongoDB Atlas (staging + production)

1. [mongodb.com/atlas](https://www.mongodb.com/atlas) → cluster तयार करा.  
2. **Database Access** → user + password.  
3. **Network Access** → `0.0.0.0/0` (किंवा फक्त Railway/Render IPs).  
4. Connection string → `MONGODB_URI`.  
5. **Staging** वेगळा database/cluster वापरा (`rideeasy_staging`).

---

## 4) Deploy — Railway / Render (API)

### Render (उदाहरण)

1. GitHub repo जोडा.  
2. **New Web Service** → Root: `backend` (किंवा तुमचा API folder).  
3. Build: `npm install` → Start: `npm start`.  
4. Environment variables वरचे सर्व टाका.  
5. Custom domain: `api.tumcha-domain.com` → SSL automatic.  
6. Frontend `VITE_BASE_URL` = हा URL.

### Railway

सारखेच: New Project → Deploy from repo → `backend` directory, `npm start`, env vars.

**Socket.IO:** same origin CORS + sticky sessions जर multiple instances — सुरुवातीला **एक instance** ठेवा.

---

## 5) Frontend hosting (Vercel / Netlify / Cloudflare Pages)

1. Root: `frontend`  
2. Build: `npm run build`  
3. Output: `dist`  
4. Env: `VITE_BASE_URL`, optional `VITE_SENTRY_DSN`  
5. Custom domain: `app.tumcha-domain.com`  
6. `backend` च्या `CORS_ORIGINS` मध्ये हा URL जोडा.

---

## 6) QA — Playwright (smoke)

```bash
cd frontend
npm install
npx playwright install
npm run test:e2e
```

`playwright.config.js` + `tests/e2e/smoke.spec.ts` repo मध्ये आहेत.  
Staging URL साठी `PLAYWRIGHT_BASE_URL` env वापरा.

---

## 7) Monitoring — Sentry

1. [sentry.io](https://sentry.io) → project (React + Node).  
2. Frontend: `npm i @sentry/react` → `main.jsx` मध्ये `initSentry()` (पहा `src/initSentry.js`).  
3. `backend`: `npm i @sentry/node` → `server.js` मध्ये `Sentry.init` सर्वात वर.  
4. DSN फक्त env मध्ये — commit नाही.

---

## 8) Razorpay (खरे पेमेंट)

1. [razorpay.com](https://razorpay.com) → API keys.  
2. `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — order create करण्यासाठी (तुमचा code लिहायचा बाकी).  
3. Dashboard → **Webhooks** → URL `https://api.../webhooks/razorpay` → secret → `RAZORPAY_WEBHOOK_SECRET`.  
4. Stub: `backend/src/controllers/webhooks.controller.js` मध्ये `payment.captured` नंतर ride/wallet अपडेट लिहा.

---

## 9) Push notifications (नवीन राइड)

1. Firebase **Cloud Messaging** → Android app + `google-services.json` → `android/app/`.  
2. `npm i @capacitor/push-notifications` → `cap sync`.  
3. Server: FCM HTTP v1 किंवा legacy API ने captain ला notification पाठवा (ride:new वेळी).  
4. iOS साठी Apple Developer + APNs.

---

## 10) Play Store / App Store

- `docs/ANDROID_PLAYSTORE.md` पहा.  
- Screenshots, privacy policy URL, content rating.  
- iOS: Xcode + Apple Developer Program ($99/वर्ष).

---

## 11) Legal (साचा — वकील तपासावा)

- `docs/legal/PRIVACY_POLICY_TEMPLATE.md`  
- `docs/legal/DRIVER_AGREEMENT_TEMPLATE.md`  

वेबसाइटवर `/privacy` व `/driver-terms` सारखे पेज होस्ट करा व Play Console मध्ये URL द्या.

---

## 12) Launch चेकलिस्ट

- [ ] Staging + Production Atlas DB वेगळे  
- [ ] `NODE_ENV=production`, CORS लॉक  
- [ ] HTTPS सर्वत्र  
- [ ] Health checks monitoring (UptimeRobot / Better Stack)  
- [ ] Sentry alerts  
- [ ] Backup policy (Mongo snapshots)  
- [ ] Razorpay live mode + webhook tested  
- [ ] Privacy policy live URL  

---

## `VITE_BASE_URL` चुकीचे असल्यास

- Login/API fail, Socket connect fail.  
- Browser console मध्ये network tab तपासा — कोणता host call होतो ते पहा.
