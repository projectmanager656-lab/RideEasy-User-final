import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import { fetchOsrmDrivingRoute } from '../utils/osrmClient'
import { getMapTileUrlTemplate, getOsrmPublicBase } from '../config/externalEndpoints'
import bikeVehicleImg from '../assets/Bike-img-ride.png'
import autoVehicleImg from '../assets/Auto-img-ride.png'
import carVehicleImg from '../assets/Car-img-ride.png'
import luxuryVehicleImg from '../assets/luxury-img-ride.png'

const containerStyle = { width: '100%', height: '100%' }
const defaultCenter = { lat: 18.5204, lng: 73.8567 }

const ROUTE_FETCH_DEBOUNCE_MS = 450
const ROUTE_MIN_INTERVAL_MS = 10_000

/** OSRM returns distance in meters and duration in seconds. */
function formatTripDistance(meters) {
    if (!Number.isFinite(meters) || meters < 0) return ''
    if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`
    return `${(meters / 1000).toFixed(1)} km`
}

function formatTripDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return ''
    const totalMin = Math.max(1, Math.round(seconds / 60))
    if (totalMin < 60) return `${totalMin} min`
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return m ? `${h} hr ${m} min` : `${h} hr`
}

function makeLabeledPinIcon(color, label) {
    return L.divIcon({
        className: 'rideeasy-location-marker',
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <span style="font-size:9px;font-weight:700;line-height:1;color:#fff;background:${color};border-radius:999px;padding:3px 7px;box-shadow:0 1px 3px rgba(0,0,0,.4);white-space:nowrap">${label}</span>
            <span style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></span>
        </div>`,
        iconSize: [54, 34],
        iconAnchor: [27, 32],
    })
}

const pickupDivIcon = makeLabeledPinIcon('#16C784', 'Pickup')
const dropDivIcon = makeLabeledPinIcon('#FF4D4D', 'Drop')

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

/** Exact asset per backend vehicle type — BIKE / AUTO / CAR / PREMIUM(LUXURY). */
const NEARBY_VEHICLE_IMAGES = {
    BIKE: bikeVehicleImg,
    AUTO: autoVehicleImg,
    CAR: carVehicleImg,
    PREMIUM: luxuryVehicleImg,
    LUXURY: luxuryVehicleImg,
    PREMIUM_CAR: luxuryVehicleImg,
}

/**
 * Floating map-vehicle marker: the real transparent vehicle photo directly on
 * the map (no circular badge), anchored bottom-center to its map coordinate,
 * with a subtle drop shadow for visibility against the tiles.
 */
const nearbyVehicleDivIcon = (vehicleType) => {
    const type = String(vehicleType || 'AUTO').toUpperCase()
    const img = NEARBY_VEHICLE_IMAGES[type] || autoVehicleImg
    const alt = type === 'PREMIUM' || type === 'LUXURY' || type === 'PREMIUM_CAR' ? 'Premium Car' : String(type || 'Auto')
    return L.divIcon({
        className: 'nearby-vehicle-marker',
        html: `<div style="display:flex;align-items:flex-end;justify-content:center;width:44px;height:44px">
            <img src="${img}" alt="${alt}" style="width:42px;max-height:42px;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))" draggable="false" />
        </div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 42],
    })
}

function roundCoordKey(lat, lng) {
    return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`
}

/** Leaflet MapContainer only uses initial center — keep map framing pickup/drop/driver as they update. */
function MapBoundsSync({ pickupCoords, dropCoords, driverCoords, passengerLiveCoords }) {
    const map = useMap()
    useEffect(() => {
        const isValid = (lat, lng) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))

        if (isValid(driverCoords?.lat, driverCoords?.lng)) {
            map.setView([Number(driverCoords.lat), Number(driverCoords.lng)], Math.max(map.getZoom(), 14), { animate: true })
            return
        }
        const pts = []
        if (isValid(pickupCoords?.lat, pickupCoords?.lng)) {
            pts.push(L.latLng(Number(pickupCoords.lat), Number(pickupCoords.lng)))
        }
        if (isValid(dropCoords?.lat, dropCoords?.lng)) {
            pts.push(L.latLng(Number(dropCoords.lat), Number(dropCoords.lng)))
        }
        if (isValid(passengerLiveCoords?.lat, passengerLiveCoords?.lng)) {
            pts.push(L.latLng(Number(passengerLiveCoords.lat), Number(passengerLiveCoords.lng)))
        }
        if (pts.length === 0) return
        if (pts.length === 1) {
            map.setView(pts[0], 14, { animate: true })
            return
        }
        map.fitBounds(L.latLngBounds(pts), { padding: [56, 56], maxZoom: 16, animate: true })
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
    /** Optional nearby-vehicle markers (e.g. Autos around pickup while searching). */
    nearbyVehicles = [],
    showRoute = true,
    zoom = 14,
    routeFromCurrent = false,
    /** Live OSRM leg (e.g. driver → pickup, or driver → drop). */
    trackingFrom = null,
    trackingTo = null,
    /** Show ETA chip for the tracking leg (requires trackingFrom/To). */
    showTrackingEta = true,
    /** Show the built-in "Estimated trip" duration/distance chip (kept on by default). */
    showRouteStatsChip = true,
    /** Where the Leaflet zoom (+/−) control sits. */
    zoomControlPosition = 'topleft',
}) => {
    const [routeLine, setRouteLine] = useState([])
    const [routeStats, setRouteStats] = useState(null)
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
                setRouteStats(null)
                return
            }
            try {
                const base = getOsrmPublicBase()
                const url = `${base}/route/v1/driving/${routeOLng},${routeOLat};${routeDLng},${routeDLat}?overview=full&geometries=geojson`
                const res = await fetch(url)
                const data = await res.json()
                const route = data?.routes?.[0]
                const coords = route?.geometry?.coordinates || []
                if (cancelled) return
                setRouteLine(coords.map(([lng, lat]) => [lat, lng]))
                if (typeof route?.distance === 'number' && typeof route?.duration === 'number') {
                    setRouteStats({ distanceMeters: route.distance, durationSeconds: route.duration })
                } else {
                    setRouteStats(null)
                }
            } catch {
                if (!cancelled) {
                    setRouteLine([])
                    setRouteStats(null)
                }
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
            {showRouteStatsChip && !trackingFrom && routeStats && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[1000] flex justify-center">
                    <div
                        className="rounded-[14px] border px-3.5 py-2 shadow-lg"
                        style={{ background: 'rgba(10,10,10,0.92)', borderColor: '#2A2A2A' }}
                    >
                        <div className="flex items-center gap-1.5">
                            <i className="ri-roadster-line text-base text-brand-yellow" aria-hidden />
                            <span className="text-sm font-bold text-white">
                                {formatTripDuration(routeStats.durationSeconds)}
                            </span>
                            <span className="text-xs text-[#9A9A9A]" aria-hidden>•</span>
                            <span className="text-sm font-semibold text-white">
                                {formatTripDistance(routeStats.distanceMeters)}
                            </span>
                        </div>
                        <p className="mt-0.5 text-center text-[10px] text-[#9A9A9A]">Estimated trip</p>
                    </div>
                </div>
            )}
            <MapContainer center={[center.lat, center.lng]} zoom={zoom} style={containerStyle} zoomControl={false}>
                <MapBoundsSync
                    pickupCoords={pickupCoords}
                    dropCoords={dropCoords}
                    driverCoords={driverCoords}
                    passengerLiveCoords={passengerLiveCoords}
                />
                <ZoomControl position={zoomControlPosition} />
                <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url={getMapTileUrlTemplate()}
                />

                {pickupCoords?.lat != null && pickupCoords?.lng != null && (
                    <Marker position={[pickupCoords.lat, pickupCoords.lng]} icon={pickupDivIcon} />
                )}
                {dropCoords?.lat != null && dropCoords?.lng != null && (
                    <Marker position={[dropCoords.lat, dropCoords.lng]} icon={dropDivIcon} />
                )}
                {driverCoords?.lat != null && driverCoords?.lng != null && (
                    <Marker position={[driverCoords.lat, driverCoords.lng]} icon={driverDivIcon} />
                )}
                {passengerLiveCoords?.lat != null && passengerLiveCoords?.lng != null && (
                    <Marker position={[passengerLiveCoords.lat, passengerLiveCoords.lng]} icon={passengerDivIcon} />
                )}

                {Array.isArray(nearbyVehicles) && nearbyVehicles.map((v) => {
                    const lat = Number(v?.lat)
                    const lng = Number(v?.lng)
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
                    return (
                        <Marker
                            key={v?.id || `${lat},${lng}`}
                            position={[lat, lng]}
                            icon={nearbyVehicleDivIcon(v?.vehicleType)}
                            zIndexOffset={500}
                        />
                    )
                })}

                {routeLine.length > 1 && (
                    <Polyline positions={routeLine} pathOptions={{ color: '#FFC800', weight: 5, opacity: 0.95 }} />
                )}
                {trackingLine.length > 1 && (
                    <Polyline positions={trackingLine} pathOptions={{ color: '#2563eb', weight: 5 }} />
                )}
            </MapContainer>
        </div>
    )
}

export default RideMap
