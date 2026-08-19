import React from 'react'

/**
 * Primary RideEasy action button — orange, full width, with loading spinner.
 * Text is black for sufficient contrast on the bright orange accent.
 */
const AuthButton = ({ loading = false, children, className = '', ...rest }) => {
  return (
    <button
      type="submit"
      disabled={loading}
      className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-black transition-all hover:bg-brand-light active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 ${className}`}
      {...rest}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black"
          aria-hidden
        />
      )}
      {children}
    </button>
  )
}

export default AuthButton