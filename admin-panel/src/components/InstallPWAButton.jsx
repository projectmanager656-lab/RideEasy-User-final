import React, { useEffect, useState } from 'react'

const InstallPWAButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
      setDeferredPrompt(null)
    }
  }

  if (!visible) return null

  return (
    <button
      onClick={handleInstall}
      className="fixed bottom-24 right-4 z-30 px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold shadow-lg shadow-emerald-500/40"
    >
      Install RideEasy
    </button>
  )
}

export default InstallPWAButton

