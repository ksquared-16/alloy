import type { ReactNode } from "react";
import "@/app/adminV2/components/workspace/workspace.css";
import { WsRouteLoadingRibbon } from "@/components/admin/workspace/workspaceRouteSkeletons";
import {
    ADMIN_V2_ROUTE_LOADING_VOCABULARY,
    type AdminV2RouteLoadingVariant,
} from "@/lib/adminV2/navigation/adminV2RouteLoadingVocabulary";

export type { AdminV2RouteLoadingVariant } from "@/lib/adminV2/navigation/adminV2RouteLoadingVocabulary";

/**
 * Unified AdminV2 route-level loading — polished card + motion (no full-page ghost layouts).
 * Row/section skeletons belong inside stable surfaces (e.g. queue lane), not here.
 */
export function AdminV2RouteLoadingState({
    variant,
    title: titleOverride,
    description: descriptionOverride,
    ribbonLabel,
    showRibbon = true,
    showIndeterminateBar = true,
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
    const showBar = showIndeterminateBar && !compact;
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
                {compact ? (
                    <div className="flex max-w-2xl items-start gap-3 text-left">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-alloy-blue/[0.06]" aria-hidden>
                            <div
                                className="h-[18px] w-[18px] rounded-full border-[2px] border-alloy-blue/12 border-r-alloy-blue/28 border-t-alloy-blue/70 animate-spin motion-reduce:animate-none"
                                style={{ animationDuration: "0.95s" }}
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="m-0 text-[13px] font-semibold text-alloy-forge">{title}</p>
                            <p className="m-0 mt-1 text-[11px] leading-snug text-alloy-forge/62">{description}</p>
                            {children ? (
                                <div className="mt-3 w-full border-t border-alloy-blue/10 pt-3">{children}</div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="mx-auto max-w-md text-center">
                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center" aria-hidden>
                            <div
                                className="h-11 w-11 rounded-full border-[3px] border-alloy-forge/12 border-t-alloy-forge/70 border-r-alloy-forge/35 animate-spin motion-reduce:animate-none"
                                style={{ animationDuration: "0.95s" }}
                            />
                        </div>
                        <p className="text-sm font-semibold text-alloy-forge">{title}</p>
                        <p className="mt-1 text-xs text-alloy-forge/60">{description}</p>
                        {showBar ? (
                            <div className="adminv2-route-loading-track mx-auto mt-8" aria-hidden>
                                <div className="adminv2-route-loading-track__bar" />
                            </div>
                        ) : null}
                        {children ? <div className="mx-auto mt-8 w-full max-w-xl text-left">{children}</div> : null}
                    </div>
                )}
            </div>
        </>
    );
}
