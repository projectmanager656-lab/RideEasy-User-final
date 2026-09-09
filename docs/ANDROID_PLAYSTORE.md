# Android app + Play Store (RideEasy / Capacitor)

## आधी fix (एकदाच)

- `capacitor.config.json` → `webDir` = `frontend/dist` (Vite build output).
- फोनवर `localhost` चालणार नाही — production build मध्ये **`VITE_BASE_URL`** = तुमचा **HTTPS API** (उदा. `https://api.tumcha-domain.com`).

---

## भाग १ — PC वर तयारी

1. **Node.js** LTS + **JDK 17** + **Android Studio** (SDK + Android SDK Platform).
2. प्रोजेक्ट रूट: `H:\uber-video-main`
3. Dependencies:
   ```bash
   cd H:\uber-video-main
   npm install
   cd frontend && npm install && cd ..
   ```

---

## भाग २ — Web build + Capacitor sync

रूट फोल्डरमधून:

```bash
cd H:\uber-video-main
```

Production API URL साठी `frontend/.env.production` बनवा (उदा.):

```
VITE_BASE_URL=https://api.tumcha-domain.com
```

मग:

```bash
npm run android:sync
```

हे `frontend/dist` बनवून `android/` मध्ये कॉपी करते.

जर `cap` सापडला नाही:

```bash
npm run build:web
npx cap sync android
```

---

## भाग ३ — Android Studio मध्ये चालवा

```bash
npm run android:open
```

किंवा Android Studio → **Open** → `H:\uber-video-main\android`

- USB debugging चालू करून फोन लावा **किंवा** Emulator निवडा.
- **Run** ▶ (green play).

**लक्षात ठेवा:** API इंटरनेटवर उपलब्ध असावा; same Wi‑Fi वर LAN IP चालू शकेल development साठी.

---

## भाग ४ — Play Store साठी AAB (release)

1. Android Studio → **Build → Generate Signed App Bundle / APK**  
   → **Android App Bundle** निवडा.
2. नवीन **Keystore** तयार करा — **पासवर्ड सुरक्षित ठेवा** (हरवला तर अपडेट देता येत नाही).
3. **release** variant → **.aab** फाइल तयार होईल.

किंवा command line (तुमच्या signing नुसार):

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

---

## भाग ५ — Google Play Console

1. [play.google.com/console](https://play.google.com/console) → Developer account ($25 एकदाच).
2. **Create app** → नाव, डीफॉल्ट भाषा, प्रकार.
3. **Dashboard** वरील सूचना पूर्ण करा:
   - Store listing (screenshots, short/full description, icon 512×512)
   - Privacy policy URL (जर location / user data गोळा करता)
   - Content rating questionnaire
   - Target audience
4. **Production** (किंवा Internal testing) → **Create new release** → **.aab** अपलोड.
5. Review नंतर **Publish**.

---

## सामान्य समस्या

| समस्या | उपाय |
|--------|------|
| पांढरा स्क्रीन | `webDir` चुकीचे; `npm run build:web` नंतर `cap sync` |
| API connect नाही | `VITE_BASE_URL` — HTTPS + सर्व्हर सुरू |
| Map रिकामे | `npm run build` नंतर `cap sync`; इंटरनेट + `VITE_BASE_URL` बरोबर |
| Location परवानगी | `AndroidManifest.xml` मध्ये आधीच FINE/COARSE आहे |

---

## आवृत्ती वाढवणे

प्रत्येक Play अपडेटपूर्वी `android/app/build.gradle` मध्ये `versionCode` + `versionName` वाढवा, मग पुन्हा `bundleRelease`.
