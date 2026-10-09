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
      /**
       * Full GPS sample for the backend's H3 matching index (spec §2): the
       * screen-facing `loc` shape above is untouched — only the wire payload
       * gains heading/speed/accuracy/timestamp, which the backend stores in
       * `driverlocations` alongside h3Cell. Browser APIs report null heading/
       * speed when unavailable; the backend skips any field that is null.
       */
      lastRef.current = {
        ...loc,
        heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
        speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        timestamp: Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now(),
      }
      onPositionRef.current?.(loc)
      if (onGeoErrorRef.current) onGeoErrorRef.current(null)
    }

    const emit = () => {
      const p = lastRef.current
      if (!p) return
      const payload = {
        driverId: id,
        lat: p.lat,
        lng: p.lng,
        heading: p.heading,
        speed: p.speed,
        accuracy: p.accuracy,
        timestamp: p.timestamp,
      }
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
