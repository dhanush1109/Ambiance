import { Component } from 'react'
import './ErrorBoundary.css'

/**
 * Last line of defence: an uncaught render error used to blank the whole
 * app. This keeps a dark recovery surface so the user can reload.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Ambiance render error', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="errbound" role="alert">
        <div className="errbound-card">
          <h1 className="errbound-title">Something went wrong</h1>
          <p className="errbound-text">
            Ambiance hit an unexpected error. Reloading usually clears it —
            your lights and saved looks are still on the phone.
          </p>
          <button
            type="button"
            className="btn btn-primary errbound-btn"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
