"use client";

/**
 * C1b — Error Boundary for layout runtime opportunity drawer overview body.
 *
 * Render-phase failures inside LayoutRuntimeDrawerBodyView fall back to the VM
 * overview body without crashing the drawer shell (header/tabs/actions unchanged).
 *
 * Read-only pilot: this boundary protects display parity only. Editing/save
 * orchestration remains VM-owned or legacy-owned outside this subtree.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import {
    logLayoutRuntimeBodyRenderFailure,
    type LayoutRuntimeBodyRenderFailureContext,
} from "@/lib/layout/runtime/logLayoutRuntimeBodyRenderFailure";

type Props = {
    children: ReactNode;
    fallback: ReactNode;
    logContext?: LayoutRuntimeBodyRenderFailureContext;
};

type State = {
    hasError: boolean;
};

export default class OpportunityDrawerLayoutRuntimeBodyErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, _info: ErrorInfo): void {
        logLayoutRuntimeBodyRenderFailure(error, this.props.logContext);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}
