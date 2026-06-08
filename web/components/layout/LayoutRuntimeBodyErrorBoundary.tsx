"use client";

/**
 * Generic render-phase error boundary for layout runtime body subtrees.
 *
 * A render failure inside a resolved-LayoutDoc body falls back to the supplied
 * node (the capability fallback) without crashing the surrounding drawer/queue
 * chrome. `onError` lets the host log with surface-specific context.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
    children: ReactNode;
    fallback: ReactNode;
    onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { hasError: boolean };

export default class LayoutRuntimeBodyErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        this.props.onError?.(error, info);
    }

    render() {
        return this.state.hasError ? this.props.fallback : this.props.children;
    }
}
