import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { fetchOsrmDrivingRoute } from '../utils/osrmClient'
import { getMapTileUrlTemplate, getOsrmPublicBase } from '../config/externalEndpoints'

const containerStyle = { width: '100%', height: '100%' }
const defaultCenter = { lat: 18.5204, lng: 73.8567 }

const ROUTE_FETCH_DEBOUNCE_MS = 450
const ROUTE_MIN_INTERVAL_MS = 10_000

const DefaultIcon = L.icon({
    iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
    iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
    shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
    iconSize: [25, 41],
    iconAnchor: [12, 41],
})

const driverDivIcon = L.divIcon({
    className: 'driver-live-marker',
    html: '<div style="width:20px;height:20px;background:#2563eb;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
})

const passengerDivIcon = L.divIcon({
    className: 'passenger-live-marker',
    html: '<div style="width:18px;height:18px;background:#10b981;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
})

function roundCoordKey(lat, lng) {
    return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`
}

/** Leaflet MapContainer only uses initial center — keep map framing pickup/drop/driver as they update. */
function MapBoundsSync({ pickupCoords, dropCoords, driverCoords, passengerLiveCoords }) {
    const map = useMap()
    useEffect(() => {
        if (driverCoords?.lat != null && driverCoords?.lng != null) {
            map.setView([driverCoords.lat, driverCoords.lng], Math.max(map.getZoom(), 14), { animate: false })
            return
        }
        const pts = []
        if (pickupCoords?.lat != null && pickupCoords?.lng != null) {
            pts.push(L.latLng(pickupCoords.lat, pickupCoords.lng))
        }
        if (dropCoords?.lat != null && dropCoords?.lng != null) {
            pts.push(L.latLng(dropCoords.lat, dropCoords.lng))
        }
        if (passengerLiveCoords?.lat != null && passengerLiveCoords?.lng != null) {
            pts.push(L.latLng(passengerLiveCoords.lat, passengerLiveCoords.lng))
        }
        if (pts.length === 0) return
        if (pts.length === 1) {
            map.setView(pts[0], 14, { animate: false })
            return
        }
        map.fitBounds(L.latLngBounds(pts), { padding: [56, 56], maxZoom: 16, animate: false })
    }, [
        map,
        pickupCoords?.lat,
        pickupCoords?.lng,
        dropCoords?.lat,
        dropCoords?.lng,
        driverCoords?.lat,
        driverCoords?.lng,
        passengerLiveCoords?.lat,
        passengerLiveCoords?.lng,
    ])
    return null
}

const RideMap = ({
    pickupCoords = null,
    dropCoords = null,
    driverCoords = null,
    passengerLiveCoords = null,
    currentLocation = null,
    showRoute = true,
    zoom = 14,
    routeFromCurrent = false,
    /** Live OSRM leg (e.g. driver → pickup, or driver → drop). */
    trackingFrom = null,
    trackingTo = null,
    /** Show ETA chip for the tracking leg (requires trackingFrom/To). */
    showTrackingEta = true,
}) => {
    const [routeLine, setRouteLine] = useState([])
    const [trackingLine, setTrackingLine] = useState([])
    const [trackingEtaMin, setTrackingEtaMin] = useState(null)
    const trackingMetaRef = useRef({ key: '', at: 0 })

    const center = useMemo(() => {
        if (driverCoords?.lat != null && driverCoords?.lng != null) return driverCoords
        if (pickupCoords?.lat != null && pickupCoords?.lng != null) return pickupCoords
        if (dropCoords?.lat != null && dropCoords?.lng != null) return dropCoords
        if (currentLocation?.lat != null && currentLocation?.lng != null) return currentLocation
        return defaultCenter
    }, [pickupCoords, dropCoords, driverCoords, currentLocation])

    const hasPickupAndDrop = pickupCoords?.lat != null && pickupCoords?.lng != null && dropCoords?.lat != null && dropCoords?.lng != null
    const hasCurrentForRoute = routeFromCurrent && currentLocation?.lat != null && currentLocation?.lng != null
    const shouldFetchRoute = showRoute && hasPickupAndDrop && (routeFromCurrent ? hasCurrentForRoute : true)
    const origin = routeFromCurrent && hasCurrentForRoute ? currentLocation : pickupCoords
    const destination = dropCoords
    const routeOLat = origin?.lat
    const routeOLng = origin?.lng
    const routeDLat = destination?.lat
    const routeDLng = destination?.lng

    useEffect(() => {
        let cancelled = false
        async function fetchRoute() {
            if (
                !shouldFetchRoute ||
                routeOLat == null ||
                routeOLng == null ||
                routeDLat == null ||
                routeDLng == null
            ) {
                setRouteLine([])
                return
            }
            try {
                const base = getOsrmPublicBase()
                const url = `${base}/route/v1/driving/${routeOLng},${routeOLat};${routeDLng},${routeDLat}?overview=full&geometries=geojson`
                const res = await fetch(url)
                const data = await res.json()
                const coords = data?.routes?.[0]?.geometry?.coordinates || []
                if (cancelled) return
                setRouteLine(coords.map(([lng, lat]) => [lat, lng]))
            } catch {
                if (!cancelled) setRouteLine([])
            }
        }
        fetchRoute()
        return () => {
            cancelled = true
        }
    }, [shouldFetchRoute, routeOLat, routeOLng, routeDLat, routeDLng])

    useEffect(() => {
        let cancelled = false
        let debounceTimer

        async function fetchTracking() {
            if (!trackingFrom?.lat || !trackingFrom?.lng || !trackingTo?.lat || !trackingTo?.lng) {
                trackingMetaRef.current = { key: '', at: 0 }
                setTrackingLine([])
                setTrackingEtaMin(null)
                return
            }

            const key = `${roundCoordKey(trackingFrom.lat, trackingFrom.lng)}|${roundCoordKey(trackingTo.lat, trackingTo.lng)}`
            const now = Date.now()
            const { key: prevKey, at } = trackingMetaRef.current
            if (key === prevKey && now - at < ROUTE_MIN_INTERVAL_MS) {
                return
            }

            try {
                const data = await fetchOsrmDrivingRoute(
                    trackingFrom.lng,
                    trackingFrom.lat,
                    trackingTo.lng,
                    trackingTo.lat,
                    { overview: 'simplified' }
                )
                if (cancelled) return
                trackingMetaRef.current = { key, at: Date.now() }
                const coords = Array.isArray(data.coordinates) ? data.coordinates : []
                setTrackingLine(coords.length > 1 ? coords.map(([lat, lng]) => [lat, lng]) : [])
                const sec = data.durationSec
                if (typeof sec === 'number' && Number.isFinite(sec)) {
                    setTrackingEtaMin(Math.max(1, Math.round(sec / 60)))
                } else {
                    setTrackingEtaMin(null)
                }
            } catch {
                if (!cancelled) {
                    setTrackingLine([])
                    setTrackingEtaMin(null)
                }
            }
        }

        debounceTimer = setTimeout(fetchTracking, ROUTE_FETCH_DEBOUNCE_MS)
        return () => {
            cancelled = true
            clearTimeout(debounceTimer)
        }
    }, [trackingFrom?.lat, trackingFrom?.lng, trackingTo?.lat, trackingTo?.lng])

    return (
        <div className="relative w-full h-full z-0">
            {showTrackingEta && trackingEtaMin != null && trackingFrom && trackingTo && (
                <div className="pointer-events-none absolute left-3 top-14 z-[1000] rounded-lg bg-slate-900/85 px-3 py-1.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
                    ETA ~{trackingEtaMin} min
                </div>
            )}
            <MapContainer center={[center.lat, center.lng]} zoom={zoom} style={containerStyle} zoomControl>
                <MapBoundsSync
                    pickupCoords={pickupCoords}
                    dropCoords={dropCoords}
                    driverCoords={driverCoords}
                    passengerLiveCoords={passengerLiveCoords}
                />
                <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url={getMapTileUrlTemplate()}
                />

                {pickupCoords?.lat != null && pickupCoords?.lng != null && (
                    <Marker position={[pickupCoords.lat, pickupCoords.lng]} icon={DefaultIcon} />
                )}
                {dropCoords?.lat != null && dropCoords?.lng != null && (
                    <Marker position={[dropCoords.lat, dropCoords.lng]} icon={DefaultIcon} />
                )}
                {driverCoords?.lat != null && driverCoords?.lng != null && (
                    <Marker position={[driverCoords.lat, driverCoords.lng]} icon={driverDivIcon} />
                )}
                {passengerLiveCoords?.lat != null && passengerLiveCoords?.lng != null && (
                    <Marker position={[passengerLiveCoords.lat, passengerLiveCoords.lng]} icon={passengerDivIcon} />
                )}

                {routeLine.length > 1 && (
                    <Polyline positions={routeLine} pathOptions={{ color: '#64748b', weight: 4, opacity: 0.85 }} />
                )}
                {trackingLine.length > 1 && (
                    <Polyline positions={trackingLine} pathOptions={{ color: '#2563eb', weight: 5 }} />
                )}
            </MapContainer>
        </div>
    )
}

export default RideMap
