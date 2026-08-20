import React, { useMemo, useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet'
import { getMapTileUrlTemplate } from '../config/externalEndpoints'

const containerStyle = { width: '100%', height: '100%' }
const defaultCenter = { lat: 18.5204, lng: 73.8567 } // Pune

/** Exposes the Leaflet map instance and honours external "fly to" requests. */
function MapBridge({ mapRef, flyTo }) {
    const map = useMap()
    useEffect(() => {
        if (mapRef) mapRef.current = map
    }, [map, mapRef])
    useEffect(() => {
        if (!flyTo?.center) return
        map.setView(flyTo.center, flyTo.zoom ?? map.getZoom(), { animate: true })
    }, [flyTo, map])
    return null
}

const LiveTracking = ({ onPositionChange, zoomControl = true, mapRef = null, flyTo = null }) => {
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
            <MapContainer center={center} zoom={15} style={containerStyle} zoomControl={zoomControl}>
                <MapBridge mapRef={mapRef} flyTo={flyTo} />
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
