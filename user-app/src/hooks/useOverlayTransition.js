import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Open/close transition state for overlay panels (modals, bottom sheets).
 *
 * Keeps the panel mounted through its exit animation so it can actually play and
 * only then calls `onClose` once — instead of the parent unmounting it instantly.
 * The behaviour mirrors the pattern already used by NotificationSheet so every
 * overlay animates the same way.
 *
 * The returned `visible`/`closing` are derived from the `open` prop as well as the
 * internal state, so the panel appears on the very first frame it is opened (no
 * one-frame gap waiting for an effect) and starts its exit on the frame the parent
 * closes it.
 *
 * Usage:
 *   const { visible, closing, requestClose, onPanelAnimationEnd } =
 *     useOverlayTransition(open, onClose)
 *   if (!visible) return null
 *   // backdrop/panel classes toggle on `closing`; panel gets onPanelAnimationEnd
 */
export function useOverlayTransition (open, onClose) {
  const [visible, setVisible] = useState(Boolean(open))
  const [closing, setClosing] = useState(false)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const closingRef = useRef(closing)
  closingRef.current = closing

  // Enter: the parent opened (or reopened) it.
  useEffect(() => {
    if (!open) return
    setClosing(false)
    setVisible(true)
  }, [open])

  // Exit: the parent closed it while it is still mounted and idle — play the exit.
  useEffect(() => {
    if (!open && visible && !closing) setClosing(true)
  }, [open, visible, closing])

  /** Begin the exit; `onClose` fires once the exit animation finishes. */
  const requestClose = useCallback(() => {
    setClosing(true)
  }, [])

  /** Attach to the animated panel. Ignores animationend bubbling from children. */
  const onPanelAnimationEnd = useCallback((event) => {
    if (event.target !== event.currentTarget) return
    if (!closingRef.current) return
    setClosing(false)
    setVisible(false)
    onCloseRef.current?.()
  }, [])

  return {
    visible: open || visible,
    closing: closing || (!open && visible),
    requestClose,
    onPanelAnimationEnd,
  }
}
