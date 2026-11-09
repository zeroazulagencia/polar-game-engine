"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"

interface Props {
  children: ReactNode
  name?: string
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="size-10 text-destructive" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {this.props.name ?? "Panel"} crashed
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {this.state.error.message}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <RotateCcw className="size-3" />
            Reset panel
          </button>
        </div>
      )
    }

    return this.props.children
  }
}