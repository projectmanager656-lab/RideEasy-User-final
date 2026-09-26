import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import { fetchOsrmDrivingRoute } from '../utils/osrmClient'
import { nearbyVehiclePoints } from '../utils/nearbyVehicles'
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

/**
 * Exact asset per vehicle type. Accepts either the backend vehicle type
 * (BIKE / AUTO / CAR / PREMIUM) or a booked tier (ECONOMY / COMFORT / XL) so
 * callers can pass whichever they already hold.
 */
const VEHICLE_IMAGE_BY_KEY = {
    BIKE: bikeVehicleImg,
    AUTO: autoVehicleImg,
    RICKSHAW: autoVehicleImg,
    ECONOMY: autoVehicleImg,
    CAR: carVehicleImg,
    COMFORT: carVehicleImg,
    PREMIUM: luxuryVehicleImg,
    XL: luxuryVehicleImg,
    LUXURY: luxuryVehicleImg,
    PREMIUM_CAR: luxuryVehicleImg,
}

const MARKER_BOX_PX = 40

/**
 * Searching-stage neighbours use a smaller box than the assigned driver, so a
 * simulated vehicle can never read as "my driver".
 */
const NEARBY_MARKER_BOX_PX = 26

/**
 * Floating map-vehicle marker: the vehicle photo directly on the map (no circular
 * badge), contained in a fixed box and anchored bottom-centre so the coordinate
 * lands where the vehicle meets the road. One vehicle per marker — the assets each
 * hold a single vehicle, so the image is never scaled from a multi-vehicle sprite.
 */
const vehicleMarkerIcon = (vehicleType, { boxPx = MARKER_BOX_PX, className = 'rideeasy-vehicle-marker' } = {}) => {
    const key = String(vehicleType || '').trim().toUpperCase()
    const img = VEHICLE_IMAGE_BY_KEY[key] || autoVehicleImg
    return L.divIcon({
        className,
        html: `<img src="${img}" alt="" draggable="false" style="width:${boxPx}px;height:${boxPx}px;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))" />`,
        iconSize: [boxPx, boxPx],
        iconAnchor: [boxPx / 2, boxPx - 2],
    })
}

/**
 * The assigned driver's vehicle at its authoritative coordinate.
 *
 * Built imperatively rather than through <Marker>: the Leaflet layer is created
 * once per ride and then only moved, so a stream of location updates can never
 * stack up duplicate markers or remount the icon, and the animation runs on the
 * map instead of through a React render every frame.
 */
function DriverVehicleMarker({ lat, lng, vehicleType, durationMs = 900 }) {
    const map = useMap()
    const markerRef = useRef(null)
    const iconKeyRef = useRef(null)
    const renderedRef = useRef(null)
    const rafRef = useRef(null)

    useEffect(() => {
        const startLat = Number(lat)
        const startLng = Number(lng)
        if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) return undefined
        const marker = L.marker([startLat, startLng], {
            icon: vehicleMarkerIcon(vehicleType),
            interactive: false,
            zIndexOffset: 900,
        }).addTo(map)
        markerRef.current = marker
        iconKeyRef.current = String(vehicleType || '')
        renderedRef.current = { lat: startLat, lng: startLng }
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
            marker.remove()
            markerRef.current = null
            renderedRef.current = null
        }
        // Mount-only on purpose: later coordinates are applied to this same marker.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map])

    /** Swap the artwork only when the vehicle type itself changes. */
    useEffect(() => {
        const key = String(vehicleType || '')
        if (!markerRef.current || key === iconKeyRef.current) return
        iconKeyRef.current = key
        markerRef.current.setIcon(vehicleMarkerIcon(vehicleType))
    }, [vehicleType])

    /** Ease from the last rendered position to each new authoritative one. */
    useEffect(() => {
        const targetLat = Number(lat)
        const targetLng = Number(lng)
        if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return undefined
        const from = renderedRef.current
        if (!from) return undefined
        if (from.lat === targetLat && from.lng === targetLng) return undefined
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        const startedAt = performance.now()
        const step = (now) => {
            const t = Math.min(1, (now - startedAt) / durationMs)
            const eased = t * t * (3 - 2 * t)
            const next = {
                lat: from.lat + (targetLat - from.lat) * eased,
                lng: from.lng + (targetLng - from.lng) * eased,
            }
            renderedRef.current = next
            markerRef.current?.setLatLng(next)
            rafRef.current = t < 1 ? requestAnimationFrame(step) : null
        }
        rafRef.current = requestAnimationFrame(step)
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [lat, lng, durationMs])

    return null
}

/**
 * Ring radius in screen pixels, eased a little with zoom so the neighbours still
 * read as "nearby" when looking at a long route without ever bunching up.
 */
function nearbyRingRadiusPx(zoom) {
    const z = Number(zoom)
    const base = Number.isFinite(z) ? 56 + (z - 14) * 7 : 56
    return Math.min(96, Math.max(56, base))
}

/**
 * Simulated nearby vehicles shown while the passenger is still searching.
 *
 * Offsets are computed in screen pixels around the pickup and converted back to
 * coordinates every animation frame, so the spacing stays identical at every zoom
 * level — the failure mode of the previous fixed-metre ring, which collapsed into
 * one oversized blob once the route zoomed out. Nothing here is a real driver:
 * the component is mounted only for the searching stage and is torn down (markers
 * and animation frame together) the moment an assigned driver exists.
 */
function NearbyVehicleSearch({ origin, seed }) {
    const map = useMap()
    const markersRef = useRef(new Map())
    const rafRef = useRef(0)
    const vehicleTypeRef = useRef(origin?.vehicleType)
    vehicleTypeRef.current = origin?.vehicleType

    const lat = Number(origin?.lat)
    const lng = Number(origin?.lng)
    const hasOrigin = origin != null && Number.isFinite(lat) && Number.isFinite(lng)

    useEffect(() => {
        if (!hasOrigin) return undefined
        const seedKey = String(seed ?? 'nearby')
        const originLatLng = L.latLng(lat, lng)
        const startedAt = performance.now()
        /** One Map of markers for the whole mounted life of the simulation. */
        const markers = markersRef.current

        const step = (now) => {
            rafRef.current = requestAnimationFrame(step)
            /** The container has no size until layout runs — nothing to place yet. */
            const size = map.getSize()
            if (size.x <= 0 || size.y <= 0) return
            const radiusPx = nearbyRingRadiusPx(map.getZoom())
            const originPoint = map.latLngToContainerPoint(originLatLng)
            const points = nearbyVehiclePoints(seedKey, (now - startedAt) / 1000, radiusPx)
            const alive = new Set()

            points.forEach((point) => {
                alive.add(point.id)
                const nextPoint = L.point(originPoint.x + point.dx, originPoint.y + point.dy)
                let entry = markers.get(point.id)
                if (!entry) {
                    const marker = L.marker(map.containerPointToLatLng(nextPoint), {
                        icon: vehicleMarkerIcon(vehicleTypeRef.current, {
                            boxPx: NEARBY_MARKER_BOX_PX,
                            className: 'nearby-vehicle-marker',
                        }),
                        interactive: false,
                        keyboard: false,
                        zIndexOffset: 300,
                    }).addTo(map)
                    entry = { marker, type: vehicleTypeRef.current, point: nextPoint }
                    markers.set(point.id, entry)
                    return
                }
                /** Swap the artwork only when the selected ride type changes. */
                if (entry.type !== vehicleTypeRef.current) {
                    entry.type = vehicleTypeRef.current
                    entry.marker.setIcon(vehicleMarkerIcon(entry.type, {
                        boxPx: NEARBY_MARKER_BOX_PX,
                        className: 'nearby-vehicle-marker',
                    }))
                }
                /** Sub-pixel moves are skipped — the drift is far too slow to show them. */
                if (entry.point.distanceTo(nextPoint) < 0.35) return
                entry.point = nextPoint
                entry.marker.setLatLng(map.containerPointToLatLng(nextPoint))
            })

            markers.forEach((entry, id) => {
                if (alive.has(id)) return
                entry.marker.remove()
                markers.delete(id)
            })
        }

        rafRef.current = requestAnimationFrame(step)
        return () => {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = 0
            markers.forEach((entry) => entry.marker.remove())
            markers.clear()
        }
    }, [map, hasOrigin, lat, lng, seed])

    return null
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
            map.setView([Number(driverCoords.lat), Number(driverCoords.lng)], Math.max(map.getZoom(), 14), { animate: false })
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

function MapCenterTracker ({ onMove, onMoveEnd }) {
    const map = useMap()

    useEffect(() => {
        const handleMove = () => {
            const center = map.getCenter()
            onMove?.({ lat: center.lat, lng: center.lng })
        }
        const handleMoveEnd = () => {
            const center = map.getCenter()
            onMoveEnd?.({ lat: center.lat, lng: center.lng })
        }
        map.on('move', handleMove)
        map.on('moveend', handleMoveEnd)
        return () => {
            map.off('move', handleMove)
            map.off('moveend', handleMoveEnd)
        }
    }, [map, onMove, onMoveEnd])

    return null
}
const RideMap = ({
    pickupCoords = null,
    dropCoords = null,
    driverCoords = null,
    /**
     * Vehicle type for the driver marker (backend type or booked tier). When set,
     * the driver is drawn as their real vehicle; when omitted the plain dot is
     * used, so captain/self-location screens are unaffected.
     */
    driverVehicleType = null,
    /**
     * Searching-stage neighbours: `{ lat, lng, vehicleType, seed }` around the
     * pickup. Simulated visual indicator only — the caller keeps it null unless a
     * search is actually running, and the map never draws it next to an
     * authoritative driver position.
     */
    nearbySearch = null,
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
    /** Show the built-in "Estimated trip" duration/distance chip (kept on by default). */
    showRouteStatsChip = true,
    /** Where the Leaflet zoom (+/−) control sits. */
    zoomControlPosition = 'topleft',
    /** Allow the pickup marker to be adjusted by the passenger. */
    draggablePickup = false,
    onPickupChange,
    /** Use a fixed screen overlay and report the map center for pickup selection. */
    fixedPickupPin = false,
    onMapCenterChange,
    onMapCenterSettled,
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
                {!fixedPickupPin && (
                    <MapBoundsSync
                        pickupCoords={pickupCoords}
                        dropCoords={dropCoords}
                        driverCoords={driverCoords}
                        passengerLiveCoords={passengerLiveCoords}
                    />
                )}
                {fixedPickupPin && (
                    <MapCenterTracker onMove={onMapCenterChange} onMoveEnd={onMapCenterSettled} />
                )}
                <ZoomControl position={zoomControlPosition} />
                <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url={getMapTileUrlTemplate()}
                />

                {!fixedPickupPin && pickupCoords?.lat != null && pickupCoords?.lng != null && (
                    <Marker
                        position={[pickupCoords.lat, pickupCoords.lng]}
                        icon={pickupDivIcon}
                        draggable={draggablePickup}
                        eventHandlers={draggablePickup ? {
                            dragend: (event) => {
                                const point = event.target.getLatLng()
                                onPickupChange?.({ lat: point.lat, lng: point.lng })
                            },
                        } : undefined}
                    />
                )}
                {!fixedPickupPin && dropCoords?.lat != null && dropCoords?.lng != null && (
                    <Marker position={[dropCoords.lat, dropCoords.lng]} icon={dropDivIcon} />
                )}
                {driverCoords?.lat != null && driverCoords?.lng != null && (
                    driverVehicleType ? (
                        <DriverVehicleMarker
                            lat={driverCoords.lat}
                            lng={driverCoords.lng}
                            vehicleType={driverVehicleType}
                        />
                    ) : (
                        <Marker position={[driverCoords.lat, driverCoords.lng]} icon={driverDivIcon} />
                    )
                )}
                {passengerLiveCoords?.lat != null && passengerLiveCoords?.lng != null && (
                    <Marker position={[passengerLiveCoords.lat, passengerLiveCoords.lng]} icon={passengerDivIcon} />
                )}
                {nearbySearch && !(driverCoords?.lat != null && driverCoords?.lng != null) && (
                    <NearbyVehicleSearch origin={nearbySearch} seed={nearbySearch.seed} />
                )}

                {routeLine.length > 1 && (
                    <Polyline positions={routeLine} pathOptions={{ color: '#FFC800', weight: 5, opacity: 0.95 }} />
                )}
                {trackingLine.length > 1 && (
                    <Polyline positions={trackingLine} pathOptions={{ color: '#2563eb', weight: 5 }} />
                )}
            </MapContainer>
            {fixedPickupPin && (
                <div
                    className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-full"
                    aria-label="Pickup location"
                >
                    <div className="flex flex-col items-center">
                        <span className="h-7 w-7 -rotate-45 rounded-[55%_55%_55%_0] border-2 border-white bg-blue-600 shadow-[0_2px_5px_rgba(0,0,0,0.45)]" />
                        <span className="absolute top-[9px] h-2.5 w-2.5 rounded-full bg-white" />
                    </div>
                </div>
            )}
        </div>
    )
}

export default RideMap
