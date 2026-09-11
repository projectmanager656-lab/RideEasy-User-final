import React, { useMemo, useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import { getMapTileUrlTemplate } from '../config/externalEndpoints'

const containerStyle = { width: '100%', height: '100%' }
const defaultCenter = { lat: 16.705, lng: 74.243 } // Kolhapur (primary service area)

const LiveTracking = ({ onPositionChange }) => {
    const [currentPosition, setCurrentPosition] = useState(defaultCenter)
    const center = useMemo(() => [currentPosition.lat, currentPosition.lng], [currentPosition.lat, currentPosition.lng])

    useEffect(() => {
        if (!navigator.geolocation) return
        const updatePos = (position) => {
            const { latitude, longitude } = position.coords
            const next = { lat: latitude, lng: longitude }
            setCurrentPosition(next)
            onPositionChange?.(next)
        }
        navigator.geolocation.getCurrentPosition(updatePos, () => {}, { enableHighAccuracy: true })
        const watchId = navigator.geolocation.watchPosition(updatePos, () => {}, {
            enableHighAccuracy: true,
            maximumAge: 10_000,
        })
        return () => navigator.geolocation.clearWatch(watchId)
    }, [onPositionChange])

    return (
        <div className="relative w-full h-full">
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
