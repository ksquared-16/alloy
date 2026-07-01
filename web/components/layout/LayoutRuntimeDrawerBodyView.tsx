"use client";

/**
 * C1b — production-safe layout runtime drawer body renderer.
 *
 * Read-only display parity for the opportunity overview pilot. No inline editing,
 * save orchestration, or mutation paths — those remain VM/legacy-owned.
 */

import LayoutRuntimePlanView, { type LayoutRuntimePlanViewProps } from "@/components/layout/LayoutRuntimePlanView";

export type LayoutRuntimeDrawerBodyViewProps = Omit<LayoutRuntimePlanViewProps, "variant">;

export default function LayoutRuntimeDrawerBodyView(props: LayoutRuntimeDrawerBodyViewProps) {
    return <LayoutRuntimePlanView {...props} variant="production" />;
}
