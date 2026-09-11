import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { getMapTileUrlTemplate } from '../config/externalEndpoints'
import { getRecentSearches } from '../utils/recentSearches'
import { useLanguage } from '../i18n'
import bannerCopy2 from '../assets/image copy 2.png'
import bannerCopy3 from '../assets/image copy 3.png'
import bannerCopy4 from '../assets/image copy 4.png'
import bannerCopy5 from '../assets/image copy 5.png'
import RideEasyHeader from '../components/RideEasyHeader'

const KOLHAPUR_CENTER = { lat: 16.705, lng: 74.2433 }
const DEFAULT_ZOOM = 14

/** Leaflet map is only mounted once — recenter when the live location arrives. */
function CenterOnLocation({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords?.lat != null && coords?.lng != null) {
      map.setView([Number(coords.lat), Number(coords.lng)], Math.max(map.getZoom(), 14), { animate: false })
    }
  }, [map, coords?.lat, coords?.lng])
  return null
}

const currentLocationIcon = L.divIcon({
  className: 'rideeasy-current-location-marker',
  html: `
    <div style="position:relative;width:26px;height:26px">
      <span style="position:absolute;inset:0;border-radius:50%;background:rgba(255,200,0,0.28);transform:scale(1.6)"></span>
      <span style="position:absolute;inset:5px;border-radius:50%;background:#FFC800;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></span>
    </div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

const LocationScreen = () => {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [location, setLocation] = useState(null)
  const [geoError, setGeoError] = useState('')
  const [searching, setSearching] = useState(false)
  const [recents, setRecents] = useState([])
  const [showLocationModal, setShowLocationModal] = useState(false)
  const requestedRef = useRef(false)

  useEffect(() => {
    setRecents(getRecentSearches())
  }, [])

  /** Request device location once; handle permission-denied gracefully with a retry button. */
  useEffect(() => {
    if (!navigator.geolocation || requestedRef.current) return
    requestedRef.current = true
    setSearching(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoError('')
        setSearching(false)
      },
      (err) => {
        setSearching(false)
        if (err?.code === err?.PERMISSION_DENIED || err?.code === 1) {
          setGeoError(t('location_access_off'))
        } else {
          setGeoError(t('could_not_get_location'))
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mapCenter = useMemo(() => location || KOLHAPUR_CENTER, [location])

  const retryLocation = () => {
    requestedRef.current = false
    setSearching(true)
    setGeoError('')
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setGeoError('')
          setSearching(false)
        },
        () => {
          setSearching(false)
          setGeoError(t('location_access_off'))
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      )
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-theme-bg text-theme-primary">
      <RideEasyHeader />
      {/* Map — upper portion */}
      <div className="relative h-80 min-h-[280px] w-full shrink-0 overflow-hidden">
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={DEFAULT_ZOOM}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <CenterOnLocation coords={location} />
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url={getMapTileUrlTemplate()}
          />
          {location?.lat != null && location?.lng != null && (
            <Marker position={[location.lat, location.lng]} icon={currentLocationIcon} />
          )}
        </MapContainer>

        {/* Current-location status pill */}
        {searching && (
          <div className="pointer-events-none absolute left-4 top-4 z-[1000] flex items-center gap-2 rounded-full border border-theme bg-theme-bg/90 px-3 py-1.5 text-xs text-theme-primary backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-yellow" />
            {t('locating_you')}
          </div>
        )}
        {geoError && !searching && (
          <button
            type="button"
            onClick={() => setShowLocationModal(true)}
            className="absolute inset-x-0 top-0 z-[1000] flex w-full items-center gap-3 border-b border-brand-yellow/30 bg-theme-bg/90 px-4 py-3 text-left backdrop-blur-sm transition active:bg-theme-bg/90"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
              <i className="ri-map-pin-2-line text-lg" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 whitespace-nowrap text-center text-sm font-medium text-theme-primary">
              {t('location_sharing_disabled')} <span className="text-brand-yellow">{t('tap_here_to_enable')}</span>
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-yellow/10 text-brand-yellow">
              <i className="ri-arrow-right-s-line text-xl" aria-hidden />
            </span>
          </button>
        )}

        {/* RideEasy brand chip */}
        {!geoError && (
          <div className="pointer-events-none absolute right-4 top-4 z-[1000] rounded-full border border-theme bg-theme-bg/90 px-3 py-1.5 text-xs font-bold backdrop-blur-sm">
            <span className="text-theme-primary">Ride</span>
            <span className="text-brand-yellow">Easy</span>
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      <div className="relative z-10 -mt-6 flex flex-col rounded-t-[28px] border-t border-theme bg-theme-card shadow-[0_-8px_40px_rgba(0,0,0,0.45)]">
        {/* Where to go? search bar */}
        <div className="shrink-0 px-4 pt-9">
          <button
            type="button"
            onClick={() => navigate('/home', { replace: true })}
            className="flex w-full items-center gap-3 rounded-2xl border border-theme bg-theme-card px-4 py-3.5 shadow-lg shadow-black/40 transition active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
              <i className="ri-search-line text-lg" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-semibold text-theme-primary">{t('where_to_go')}</span>
              <span className="block text-xs text-theme-muted">{t('search_pickup_drop_locations')}</span>
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-yellow/10 text-brand-yellow">
              <i className="ri-arrow-right-s-line text-lg" aria-hidden />
            </span>
          </button>
        </div>

        {/* Recent searches */}
        <div className="mt-5 flex shrink-0 flex-col px-4 pb-2">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <h2 className="text-sm font-bold text-theme-primary">{t('recent_searches')}</h2>
          </div>

          {recents.length === 0 ? (
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-theme bg-theme-card px-4 py-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-yellow/10 text-brand-yellow">
                <i className="ri-time-line text-xl" aria-hidden />
              </span>
              <p className="text-sm font-medium text-theme-primary">{t('no_recent_searches')}</p>
              <p className="text-xs text-theme-muted">{t('searched_destinations_hint')}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-theme bg-theme-card">
              {recents.slice(0, 2).map((item, idx) => (
                <button
                  key={`${item.name}-${idx}`}
                  type="button"
                  onClick={() => navigate('/home', { replace: true })}
                  className="flex w-full items-center gap-3 border-b border-theme px-3.5 py-3 text-left transition last:border-b-0 hover:bg-theme-card-muted active:bg-theme-card-muted"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                    <i className="ri-history-line text-base" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-theme-primary">{item.name}</span>
                    {item.detail && (
                      <span className="block truncate text-xs text-theme-muted">{item.detail}</span>
                    )}
                  </span>
                  <i className="ri-arrow-right-s-line text-lg text-theme-muted" aria-hidden />
                </button>
              ))}
            </div>
          )}

          {/* Offer banners — horizontally scrollable row */}
          <div className="mt-3">
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[
                { src: bannerCopy2, alt: 'RideEasy offer 1' },
                { src: bannerCopy3, alt: 'RideEasy offer 2' },
                { src: bannerCopy4, alt: 'RideEasy offer 3' },
                { src: bannerCopy5, alt: 'RideEasy offer 4' },
              ].map((b, idx) => (
                <div key={idx} className="w-[72%] shrink-0 overflow-hidden rounded-2xl border border-theme bg-theme-card">
                  <img src={b.src} alt={b.alt} className="h-36 w-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Location Accuracy modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-[1px]"
            onClick={() => setShowLocationModal(false)}
            aria-hidden
          />
          <div className="relative max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-theme bg-theme-card p-5 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-theme-card-muted" />
            <h2 className="text-base font-bold leading-snug text-theme-primary">
              {t('loc_accuracy_modal_title')}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-theme-secondary">
              <p>{t('location_settings_on')}</p>
              <p className="font-medium text-theme-primary">{t('device_location')}</p>
              <p>
                {t('loc_accuracy_google_para')}
              </p>
              <p>
                {t('loc_accuracy_change_note')}
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="w-full rounded-xl border border-theme bg-theme-card py-3 text-sm font-semibold text-theme-primary transition active:scale-[0.98]"
              >
                {t('no_thanks')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLocationModal(false)
                  retryLocation()
                }}
                className="w-full rounded-xl bg-brand-yellow py-3 text-sm font-semibold text-black transition active:scale-[0.98]"
              >
                {t('turn_on')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LocationScreen
