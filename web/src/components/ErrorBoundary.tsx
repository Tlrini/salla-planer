import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  children: ReactNode;
  /** Change it to try rendering the children again (e.g. a different model URL). */
  resetKey?: unknown;
  onError?: (error: Error) => void;
}

/** Shows `fallback` instead of crashing the whole page when a child throws (e.g. a broken .glb). */
export class ErrorBoundary extends Component<Props, { failed: boolean; key: unknown }> {
  override state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; key: unknown }) {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    this.props.onError?.(error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
