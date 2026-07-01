"use client";

/**
 * Error Boundary for layout runtime queue row rendering.
 *
 * Render failures fall back to the legacy VM queue row preview without breaking
 * row click/open or lane reveal semantics.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
    children: ReactNode;
    fallback: ReactNode;
    queueRowKey?: string;
    variant?: "pipeline" | "waitlist";
};

type State = {
    hasError: boolean;
};

export default class LayoutRuntimeQueueRowErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, _info: ErrorInfo): void {
        if (typeof console !== "undefined") {
            console.info("[layout_runtime_queue_row:render_fallback]", {
                queueRowKey: this.props.queueRowKey,
                variant: this.props.variant,
                message: error.message,
            });
        }
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}
