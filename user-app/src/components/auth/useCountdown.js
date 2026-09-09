import { useEffect, useRef, useState } from 'react'

/**
 * Countdown timer (seconds). `reset` restarts it from `initial`.
 * When it reaches 0 the value stays at 0 (expired state).
 */
export function useCountdown (initial = 0) {
  const [ secondsLeft, setSecondsLeft ] = useState(initial)
  const initialRef = useRef(initial)
  const timerRef = useRef(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const reset = (next = initialRef.current) => {
    clearTimer()
    setSecondsLeft(next)
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : s))
    }, 1000)
  }

  useEffect(() => {
    reset(initialRef.current)
    return clearTimer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { secondsLeft, reset }
}