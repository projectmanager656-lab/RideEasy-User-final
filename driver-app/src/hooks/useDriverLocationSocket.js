import { useEffect, useRef } from 'react'

const DEFAULT_EMIT_MS = 2000

const OPT_CACHED = {
  enableHighAccuracy: false,
  maximumAge: 300000,
  timeout: 25000,
}
const OPT_FINE = {
  enableHighAccuracy: true,
  maximumAge: 10000,
  timeout: 90000,
}

/**
 * watchPosition keeps the latest fix in a ref; socket emits run on an interval.
 * Seeds with a quick cached/course fix so matching works even when cold GPS is slow.
 */
export function useDriverLocationSocket (socket, driverId, options = {}) {
  const {
    intervalMs = DEFAULT_EMIT_MS,
    enabled = true,
    onPosition,
    onGeoError,
  } = typeof options === 'number' ? { intervalMs: options } : options

  const id = driverId != null && driverId !== '' ? String(driverId) : ''
  const lastRef = useRef(null)
  const onPositionRef = useRef(onPosition)
  const onGeoErrorRef = useRef(onGeoError)
  onPositionRef.current = onPosition
  onGeoErrorRef.current = onGeoError

  useEffect(() => {
    if (!enabled || !socket || !id || !navigator.geolocation) return undefined

    const applyPos = (pos) => {
      const loc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }
      lastRef.current = loc
      onPositionRef.current?.(loc)
      if (onGeoErrorRef.current) onGeoErrorRef.current(null)
    }

    const emit = () => {
      const p = lastRef.current
      if (!p) return
      const payload = { driverId: id, lat: p.lat, lng: p.lng }
      socket.emit('driver:location-update', payload)
      socket.emit('driver-location-update', payload)
    }

    navigator.geolocation.getCurrentPosition(
      applyPos,
      () => {
        navigator.geolocation.getCurrentPosition(applyPos, () => {}, {
          enableHighAccuracy: true,
          maximumAge: 60000,
          timeout: 60000,
        })
      },
      OPT_CACHED
    )

    const watchId = navigator.geolocation.watchPosition(
      applyPos,
      (err) => {
        if (onGeoErrorRef.current) onGeoErrorRef.current(err)
      },
      OPT_FINE
    )

    emit()
    const timer = setInterval(emit, intervalMs)

    return () => {
      clearInterval(timer)
      navigator.geolocation.clearWatch(watchId)
    }
  }, [ socket, id, intervalMs, enabled ])
}
