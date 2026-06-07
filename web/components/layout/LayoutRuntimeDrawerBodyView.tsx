"use client";

/**
 * C1b — production-safe layout runtime drawer body renderer.
 *
 * Thin wrapper over LayoutRuntimePlanView with operator-safe production variant.
 */

import LayoutRuntimePlanView, { type LayoutRuntimePlanViewProps } from "@/components/layout/LayoutRuntimePlanView";

export type LayoutRuntimeDrawerBodyViewProps = Omit<LayoutRuntimePlanViewProps, "variant">;

export default function LayoutRuntimeDrawerBodyView(props: LayoutRuntimeDrawerBodyViewProps) {
    return <LayoutRuntimePlanView {...props} variant="production" />;
}
