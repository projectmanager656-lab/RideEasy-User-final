# Maps setup for RideEasy (web + Android)

RideEasy uses **free / open** map stack — **no Google Cloud API key** required for core features.

## Stack

- **Browser:** [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) tiles (`RideMap`, `LiveTracking`).
- **Backend:** [Photon](https://photon.komoot.io/) (search/geocode) + [OSRM](http://project-osrm.org/) (driving distance/time).

## Android

- Location permissions are in `frontend/android/app/src/main/AndroidManifest.xml` (`ACCESS_FINE_LOCATION`, etc.).
- After `npm run build && npx cap sync android`, the WebView loads the same Leaflet maps as the PWA.

## Optional links

- “Open in Google Maps” buttons use public `https://www.google.com/maps/...` URLs (opens the app/website) — **not** the Maps JavaScript API, so no key is needed.
