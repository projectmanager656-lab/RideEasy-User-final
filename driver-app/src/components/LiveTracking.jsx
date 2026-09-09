import React, { useMemo, useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import { getMapTileUrlTemplate } from '../config/externalEndpoints'

const containerStyle = { width: '100%', height: '100%' }
const defaultCenter = { lat: 18.5204, lng: 73.8567 } // Pune

const LiveTracking = ({ onPositionChange, onGeolocationError }) => {
    const [currentPosition, setCurrentPosition] = useState(defaultCenter)
    const [permissionDenied, setPermissionDenied] = useState(false)
    const [geoUnavailable, setGeoUnavailable] = useState(false)
    const center = useMemo(() => [currentPosition.lat, currentPosition.lng], [currentPosition.lat, currentPosition.lng])

    useEffect(() => {
        if (!navigator.geolocation) {
            setGeoUnavailable(true)
            return undefined
        }
        const updatePos = (position) => {
            const { latitude, longitude } = position.coords
            const next = { lat: latitude, lng: longitude }
            setCurrentPosition(next)
            setPermissionDenied(false)
            setGeoUnavailable(false)
            onPositionChange?.(next)
        }
        const onErr = (err) => {
            if (err?.code === 1) setPermissionDenied(true)
            else setGeoUnavailable(true)
            onGeolocationError?.(err)
        }
        navigator.geolocation.getCurrentPosition(updatePos, onErr, { enableHighAccuracy: true })
        const watchId = navigator.geolocation.watchPosition(updatePos, onErr, {
            enableHighAccuracy: true,
            maximumAge: 10_000,
        })
        return () => navigator.geolocation.clearWatch(watchId)
    }, [onPositionChange, onGeolocationError])

    return (
        <div className="relative w-full h-full">
            {permissionDenied && (
                <div className="absolute inset-x-0 top-0 z-[500] bg-amber-950/90 px-3 py-2 text-center text-xs text-amber-100">
                    Location access denied — allow location in browser settings to show your position on the map.
                </div>
            )}
            {geoUnavailable && !permissionDenied && (
                <div className="absolute inset-x-0 top-0 z-[500] bg-slate-900/90 px-3 py-2 text-center text-xs text-slate-300">
                    Could not get GPS. Check signal or permissions.
                </div>
            )}
            <MapContainer center={center} zoom={15} style={containerStyle} zoomControl>
                <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url={getMapTileUrlTemplate()}
                />
                <CircleMarker
                    center={center}
                    radius={8}
                    pathOptions={{ color: 'white', weight: 2, fillColor: '#10b981', fillOpacity: 1 }}
                />
            </MapContainer>
        </div>
    )
}

export default LiveTracking
