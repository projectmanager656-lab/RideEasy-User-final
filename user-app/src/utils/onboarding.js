import { completeOnboarding, getOnboardingStatus } from '../services/userService'
import { getDeviceId } from './deviceId'

// Vite replaces __BUILD_STAMP__ with a unique build timestamp
// (see vite.config.js). Scoping onboarding to the stamp means a new
// build shows the Welcome page once, regardless of any flag left by an
// older build — while a logged-out returning user (same build) still
// goes straight to Login.
const BUILD_STAMP = '__BUILD_STAMP__'
const ONBOARDED_KEY = 'rideeasy_onboarded'

export const hasCompletedOnboarding = () => {
    try {
        return localStorage.getItem(ONBOARDED_KEY) === BUILD_STAMP
    } catch {
        return false
    }
}

const persistToServer = () => {
    try {
        const deviceId = getDeviceId()
        if (!deviceId) return
        completeOnboarding(deviceId).catch(() => {})
    } catch {
        /* best-effort — the local flag is the source of truth */
    }
}

export const markOnboardingComplete = () => {
    try {
        localStorage.setItem(ONBOARDED_KEY, BUILD_STAMP)
    } catch {
        /* storage unavailable — best-effort convenience */
    }
    persistToServer()
}

/**
 * Pulls the server-side onboarding state for this device into localStorage.
 * Returns true when the server record flipped the local flag (e.g. the local
 * flag was lost but this device already completed onboarding).
 */
export const syncOnboardingFromServer = async () => {
    try {
        const deviceId = getDeviceId()
        if (!deviceId) return false
        const response = await getOnboardingStatus(deviceId)
        const onboarded = Boolean(response.data?.data?.onboarded ?? response.data?.onboarded)
        if (onboarded) {
            try {
                localStorage.setItem(ONBOARDED_KEY, BUILD_STAMP)
            } catch {
                /* storage unavailable */
            }
            return true
        }
    } catch {
        /* offline or server error — fall back to the local flag only */
    }
    return false
}
