"use client";

import { useMemo, type ReactNode } from "react";
import {
    useWorkspaceRouteVm,
    WorkspaceRouteVmProvider,
} from "@/lib/adminV2/runtime/surface/workspaceRouteVmContext";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";

/**
 * Landing-scoped Route VM enrichment.
 *
 * The shared `/workspace` layout composes the Route VM's **context** (org identity) for every route,
 * but no longer loads the landing-only `firstPaint.lifecycleCards` (that was ~600 ms of dead-weight DB
 * work on work-unit navigations — a landing-only seed no work-unit surface reads). The landing route
 * loads its own seed server-side and merges it into the layout's Route VM here — nearest-provider-wins
 * — so the workspace surface sees a fully-composed Route VM (context from the layout + lifecycle tiles
 * from the landing), with zero landing first-paint regression.
 */
export function WorkspaceLandingRouteVmBridge({
    lifecycleCards,
    children,
}: {
    lifecycleCards: readonly OperatorLifecycleLandingCard[];
    children: ReactNode;
}) {
    const base = useWorkspaceRouteVm();
    const merged = useMemo(
        () => ({ ...base, firstPaint: { ...base.firstPaint, lifecycleCards } }),
        [base, lifecycleCards],
    );
    return <WorkspaceRouteVmProvider value={merged}>{children}</WorkspaceRouteVmProvider>;
}
