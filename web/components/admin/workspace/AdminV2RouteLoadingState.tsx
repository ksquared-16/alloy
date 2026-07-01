import type { ReactNode } from "react";
import "@/app/adminV2/components/workspace/workspace.css";
import { BosExecutionLoader } from "@/components/admin/actions/BosExecutionLoader";
import { WsRouteLoadingRibbon } from "@/components/admin/workspace/workspaceRouteSkeletons";
import {
    ADMIN_V2_ROUTE_LOADING_VOCABULARY,
    type AdminV2RouteLoadingVariant,
} from "@/lib/adminV2/navigation/adminV2RouteLoadingVocabulary";

export type { AdminV2RouteLoadingVariant } from "@/lib/adminV2/navigation/adminV2RouteLoadingVocabulary";

/**
 * Unified AdminV2 route-level loading — BOS panel loader for cold surfaces, inline for compact queue holds.
 * Row/section skeletons belong inside stable surfaces (e.g. queue lane), not here.
 */
export function AdminV2RouteLoadingState({
    variant,
    title: titleOverride,
    description: descriptionOverride,
    ribbonLabel,
    showRibbon = true,
    showIndeterminateBar: _showIndeterminateBar = true,
    children,
    className = "",
}: {
    variant: AdminV2RouteLoadingVariant;
    title?: string;
    description?: string;
    ribbonLabel?: string;
    showRibbon?: boolean;
    showIndeterminateBar?: boolean;
    children?: ReactNode;
    className?: string;
}) {
    const d = ADMIN_V2_ROUTE_LOADING_VOCABULARY[variant];
    const title = titleOverride ?? d.title;
    const description = descriptionOverride ?? d.description;
    const compact = variant === "queue";
    return (
        <>
            {showRibbon ? <WsRouteLoadingRibbon label={ribbonLabel ?? d.ribbon} /> : null}
            <div
                className={
                    compact
                        ? `rounded-lg border border-alloy-blue/18 bg-white/95 px-4 py-4 shadow-sm ring-1 ring-alloy-stone/[0.07] ${className}`
                        : `rounded-xl border border-admin-border/55 bg-gradient-to-b from-white to-alloy-stone/[0.04] px-6 py-12 shadow-sm ring-1 ring-alloy-stone/8 ${className}`
                }
                aria-busy="true"
                aria-live="polite"
                aria-label={title}
            >
                <BosExecutionLoader
                    variant={compact ? "inline" : "panel"}
                    title={title}
                    subtitle={description}
                    data-testid="adminv2-route-loading-state"
                />
                {children ?
                    <div className={compact ? "mt-3 w-full border-t border-alloy-blue/10 pt-3" : "mx-auto mt-8 w-full max-w-xl text-left"}>
                        {children}
                    </div>
                :   null}
            </div>
        </>
    );
}
