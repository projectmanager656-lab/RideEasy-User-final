import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useNavigate } from 'react-router-dom'
import { getMapTileUrlTemplate } from '../config/externalEndpoints'
import { getRecentSearches } from '../utils/recentSearches'

const KOLHAPUR_CENTER = { lat: 16.705, lng: 74.2433 }
const DEFAULT_ZOOM = 14

/** Leaflet map is only mounted once — recenter when the live location arrives. */
function CenterOnLocation({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords?.lat != null && coords?.lng != null) {
      map.setView([Number(coords.lat), Number(coords.lng)], Math.max(map.getZoom(), 14), { animate: true })
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
  const navigate = useNavigate()
  const [location, setLocation] = useState(null)
  const [geoError, setGeoError] = useState('')
  const [searching, setSearching] = useState(false)
  const [recents, setRecents] = useState([])
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
          setGeoError('Location access is off. Enable location to see where you are.')
        } else {
          setGeoError('Could not get your current location. Please try again.')
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    )
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
          setGeoError('Location access is off. Enable location to see where you are.')
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      )
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-black text-white">
      {/* Map — upper portion */}
      <div className="relative h-[52%] min-h-[280px] w-full shrink-0 overflow-hidden">
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
          <div className="pointer-events-none absolute left-4 top-4 z-[1000] flex items-center gap-2 rounded-full border border-brand-border bg-black/80 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-yellow" />
            Locating you…
          </div>
        )}
        {geoError && !searching && (
          <div className="pointer-events-none absolute left-4 top-4 z-[1000] flex items-center gap-2 rounded-full border border-brand-border bg-black/80 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur-sm">
            <i className="ri-map-pin-line text-brand-yellow" aria-hidden />
            <span>{geoError}</span>
            <button
              type="button"
              onClick={retryLocation}
              className="pointer-events-auto ml-1 rounded-full border border-brand-yellow px-2 py-0.5 text-[10px] font-semibold text-brand-yellow active:scale-95"
            >
              Retry
            </button>
          </div>
        )}

        {/* RideEasy brand chip */}
        <div className="pointer-events-none absolute right-4 top-4 z-[1000] rounded-full border border-brand-border bg-black/80 px-3 py-1.5 text-xs font-bold backdrop-blur-sm">
          <span className="text-white">Ride</span>
          <span className="text-brand-yellow">Easy</span>
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="relative z-10 -mt-6 flex min-h-0 flex-1 flex-col rounded-t-[28px] border-t border-brand-border bg-[#101010] shadow-[0_-8px_40px_rgba(0,0,0,0.45)]">
        {/* Where to go? search bar */}
        <div className="shrink-0 px-4 pt-4">
          <button
            type="button"
            onClick={() => navigate('/home', { replace: true })}
            className="flex w-full items-center gap-3 rounded-2xl border border-brand-border bg-brand-card px-4 py-4 shadow-lg shadow-black/40 transition active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
              <i className="ri-search-line text-lg" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-semibold text-white">Where to go ?</span>
              <span className="block text-xs text-[#707070]">Search pickup &amp; drop locations</span>
            </span>
            <i className="ri-arrow-right-s-line text-xl text-zinc-500" aria-hidden />
          </button>
        </div>

        {/* Recent searches */}
        <div className="mt-5 flex min-h-0 flex-1 flex-col px-4 pb-4">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <h2 className="text-sm font-bold text-white">Recent Searches</h2>
          </div>

          {recents.length === 0 ? (
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-border bg-brand-card/40 px-4 py-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-yellow/10 text-brand-yellow">
                <i className="ri-time-line text-xl" aria-hidden />
              </span>
              <p className="text-sm font-medium text-zinc-300">No recent searches yet</p>
              <p className="text-xs text-zinc-500">Your searched destinations will appear here.</p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-brand-border bg-brand-card">
              {recents.map((item, idx) => (
                <button
                  key={`${item.name}-${idx}`}
                  type="button"
                  onClick={() => navigate('/home', { replace: true })}
                  className="flex w-full items-center gap-3 border-b border-brand-border px-3.5 py-3 text-left transition last:border-b-0 hover:bg-[#1B1D1F] active:bg-[#1B1D1F]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-yellow/15 text-brand-yellow">
                    <i className="ri-history-line text-base" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{item.name}</span>
                    {item.detail && (
                      <span className="block truncate text-xs text-zinc-500">{item.detail}</span>
                    )}
                  </span>
                  <i className="ri-arrow-right-s-line text-lg text-zinc-600" aria-hidden />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LocationScreen
