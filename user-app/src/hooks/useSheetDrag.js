import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Handle-driven drag-to-close for the app's EXISTING bottom sheets — no new modal
 * system, no markup duplication: a sheet only gets a ref, a style and this hook.
 *
 * The grey drag handle at the top of the sheet is the only control:
 *   • tap the handle                       → close
 *   • hold + drag down                     → the sheet follows the finger
 *                                            (100% → 75% → 50% → 25% of its height)
 *   • release after ~25% / 50% / 75% down  → close
 *   • release after a small downward drag  → snap smoothly back to open
 *
 * Only downward movement ever moves the sheet (it starts fully open), and the
 * listeners are attached to the handle alone, so scrolling the sheet's content is
 * never intercepted — no accidental closes while reading/scrolling.
 *
 * @param {() => void} onClose  runs when the sheet should close (tap or drag past
 *                              the threshold); wire it to the sheet's OWN close.
 * @param {boolean} open        the sheet's open flag — resets the drag state when
 *                              the sheet is closed through some other control.
 * @param {boolean} closing     the sheet's exit-animation flag; while it is true
 *                              the entrance animation stays available for the
 *                              slide-down, so the close animation still plays.
 * @param {number} threshold    fraction of the sheet height that counts as "closed".
 */
export default function useSheetDrag ({ onClose, open = true, closing = false, threshold = 0.25 } = {}) {
  const panelRef = useRef(null)
  /**
   * The handle only exists while the sheet is on screen, so the element itself is
   * state: a ref alone would leave the effect attached to nothing for sheets that
   * render their panel after their first render.
   */
  const [handleEl, setHandleEl] = useState(null)
  const handleRef = useCallback((node) => {
    setHandleEl((prev) => (prev === node ? prev : node))
  }, [])
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  /** Live gesture state — kept in a ref so the native listeners never go stale. */
  const gesture = useRef({ active: false, startY: 0, dy: 0, moved: false, pointerId: null, suppressClick: false })
  const [dragY, setDragY] = useState(null)
  const [settling, setSettling] = useState(false)
  const [hasDragged, setHasDragged] = useState(false)

  /** Another control closed the sheet — forget the gesture and the animation bypass. */
  useEffect(() => {
    if (open && !closing) return
    gesture.current = { active: false, startY: 0, dy: 0, moved: false, pointerId: null, suppressClick: false }
    setDragY(null)
    setSettling(false)
    if (!open) setHasDragged(false)
  }, [open, closing])

  /** Release the snap-back transition once it has finished. */
  useEffect(() => {
    if (!settling) return undefined
    const timer = setTimeout(() => setSettling(false), 260)
    return () => clearTimeout(timer)
  }, [settling])

  useEffect(() => {
    const handle = handleEl
    if (!handle) return undefined

    const onPointerDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const g = gesture.current
      g.active = true
      g.startY = event.clientY
      g.dy = 0
      g.moved = false
      g.suppressClick = false
      g.pointerId = event.pointerId
      setHasDragged(true)
      setSettling(false)
      setDragY(0)
      try { handle.setPointerCapture(event.pointerId) } catch { /* ignore */ }
    }

    const onPointerMove = (event) => {
      const g = gesture.current
      if (!g.active) return
      /** Keep the page/sheet from scrolling while the finger is dragging the handle. */
      event.preventDefault()
      const dy = event.clientY - g.startY
      g.dy = dy
      if (Math.abs(dy) > 6) g.moved = true
      /** The sheet is fully open: it follows the finger down and never moves up. */
      setDragY(Math.max(0, Math.round(dy)))
    }

    const settle = (event) => {
      const g = gesture.current
      if (!g.active) return
      g.active = false
      g.suppressClick = true
      try { handle.releasePointerCapture(event.pointerId) } catch { /* ignore */ }

      const panel = panelRef.current
      const height = panel ? panel.offsetHeight : 0

      /** A tap on the handle closes the sheet. */
      if (!g.moved) {
        setDragY(null)
        setSettling(false)
        closeRef.current?.()
        return
      }

      /** Released at/below the 25% mark (75%/50%/25% open) → the sheet is closed. */
      if (height > 0 && g.dy >= height * threshold) {
        setDragY(null)
        setSettling(false)
        closeRef.current?.()
        return
      }

      /** Small downward drag → snap smoothly back to the open position. */
      setSettling(true)
      setDragY(null)
    }

    /** A drag must never fall through as a click on the handle (e.g. tap-to-close). */
    const onClickCapture = (event) => {
      if (!gesture.current.suppressClick) return
      gesture.current.suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    }

    handle.addEventListener('pointerdown', onPointerDown)
    handle.addEventListener('pointermove', onPointerMove, { passive: false })
    handle.addEventListener('pointerup', settle)
    handle.addEventListener('pointercancel', settle)
    handle.addEventListener('click', onClickCapture, true)
    return () => {
      handle.removeEventListener('pointerdown', onPointerDown)
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', settle)
      handle.removeEventListener('pointercancel', settle)
      handle.removeEventListener('click', onClickCapture, true)
    }
  }, [handleEl, threshold])

  /**
   * `animation: 'none'` after the first drag: the sheets keep their `sheet-slide-up`
   * class (filled with `forwards`), which would otherwise outrank an inline
   * transform and keep the sheet glued to the screen. It is dropped as soon as the
   * sheet starts closing, so the existing slide-down exit still plays.
   */
  const suppressEntranceAnimation = hasDragged && !closing
  const panelStyle = {
    ...(suppressEntranceAnimation ? { animation: 'none' } : {}),
    ...(dragY != null
      ? { transform: `translateY(${dragY}px)` }
      : settling
        ? { transform: 'translateY(0)', transition: 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)' }
        : {}),
  }

  return { panelRef, handleRef, panelStyle }
}
