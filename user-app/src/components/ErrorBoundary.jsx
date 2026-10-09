import React from 'react'

/**
 * Catches render/lifecycle errors in the subtree it wraps so one broken screen
 * shows a recoverable fallback instead of letting React unmount the whole app
 * (which surfaces as a blank page). Complements the pre-mount fatal handler in
 * main.jsx, which only covers errors thrown outside the React tree.
 *
 * React only supports error boundaries as class components, so this stays a
 * class even though the rest of the app is function components.
 */
class ErrorBoundary extends React.Component {
  constructor (props) {
    super(props)
    this.state = { error: null }
    this.reset = this.reset.bind(this)
  }

  static getDerivedStateFromError (error) {
    return { error }
  }

  componentDidCatch (error, info) {
    // Never hide the real error — log it (with the component stack) for diagnosis.
    console.error('[ErrorBoundary]', error, info?.componentStack || '')
  }

  reset () {
    this.setState({ error: null })
  }

  render () {
    if (!this.state.error) return this.props.children
    return this.props.fallback
      ? this.props.fallback(this.state.error, this.reset)
      : null
  }
}

export default ErrorBoundary
