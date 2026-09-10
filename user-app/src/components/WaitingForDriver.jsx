import React, { useEffect, useMemo, useState } from 'react'
import RideConfirmationPanel from './RideConfirmationPanel'
import { fetchOsrmDrivingRoute } from '../utils/osrmClient'

const WaitingForDriver = (props) => {
  const [etaMinutes, setEtaMinutes] = useState(null)

  const dLat = props.driverCoords?.lat
  const dLng = props.driverCoords?.lng
  const pLat = props.pickupCoords?.lat
  const pLng = props.pickupCoords?.lng

  const canComputeEta = useMemo(() => {
    return dLat != null && dLng != null && pLat != null && pLng != null
  }, [dLat, dLng, pLat, pLng])

  useEffect(() => {
    let cancelled = false
    async function fetchEta () {
      if (!canComputeEta) {
        setEtaMinutes(null)
        return
      }
      try {
        const data = await fetchOsrmDrivingRoute(dLng, dLat, pLng, pLat, { overview: 'false' })
        if (cancelled) return
        const sec = data?.durationSec
        if (typeof sec === 'number' && Number.isFinite(sec)) setEtaMinutes(Math.max(1, Math.round(sec / 60)))
        else setEtaMinutes(null)
      } catch {
        if (!cancelled) setEtaMinutes(null)
      }
    }
    fetchEta()
    return () => { cancelled = true }
  }, [canComputeEta, dLat, dLng, pLat, pLng])

  const confirmationWithEta = useMemo(() => {
    const base = props.confirmation ? { ...props.confirmation } : {}
    if (etaMinutes != null && (base.etaMinutes == null || base.etaMinutes === undefined)) {
      base.etaMinutes = etaMinutes
      base.eta = `${etaMinutes} min`
    }
    return Object.keys(base).length ? base : null
  }, [props.confirmation, etaMinutes])

  return (
    <RideConfirmationPanel
      ride={props.ride}
      confirmation={confirmationWithEta}
      passengerOtp={props.passengerOtp}
      driverCoords={props.driverCoords}
      pickupCoords={props.pickupCoords}
      dropCoords={props.dropCoords}
      onCloseWaiting={props.setWaitingForDriver}
    />
  )
}

export default WaitingForDriver
