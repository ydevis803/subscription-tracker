import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from '@/components/ui/Primitives'

/**
 * Catches a render crash anywhere below it and shows the app's own error state with a reload, instead of a
 * blank screen. Data is never touched: the crash is in the view, the records stay in IndexedDB.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
          <div className="w-full max-w-[480px] rounded-3xl border border-line bg-surface shadow-card">
            <ErrorState
              title="This screen hit a problem"
              body="Your subscriptions and notes are safe on this device. Reload to carry on; if it keeps happening, go back to Home."
              onRetry={() => {
                this.setState({ error: null })
                window.location.reload()
              }}
            />
            <div className="px-6 pb-6 text-center">
              <a href="/" className="inline-flex min-h-11 items-center font-semibold text-navy-800 underline decoration-mint-500 decoration-2 underline-offset-2">
                Back to Home
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/** Development-only: a route that throws, so the readiness check can prove the boundary works. */
export function CrashTest(): ReactNode {
  throw new Error('Readiness crash test')
}
