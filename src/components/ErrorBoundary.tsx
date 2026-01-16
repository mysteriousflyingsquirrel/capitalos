import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg-page p-4">
          <div className="max-w-2xl w-full">
            <div className="bg-space-blue border border-red-500 rounded-lg p-6">
              <h1 className="text-2xl font-bold text-red-400 mb-4">
                Application Error
              </h1>
              <div className="text-text-secondary mb-4">
                <p className="mb-2">Something went wrong. Please refresh the page.</p>
                {this.state.error && (
                  <p className="text-sm text-text-muted mb-2">
                    {this.state.error.message}
                  </p>
                )}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-text-secondary mb-2">
                  Technical Details
                </summary>
                <pre className="bg-galaxy-dark p-4 rounded overflow-auto text-xs text-text-muted">
                  {this.state.error?.stack || 'No stack trace available'}
                </pre>
              </details>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-goldenrod text-space-blue rounded-lg font-semibold hover:bg-bronze-gold transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

