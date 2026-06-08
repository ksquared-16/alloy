"use client";

/**
 * Shared drawer overview body — layout runtime with hold + error boundary + VM emergency fallback.
 */

import type { ReactNode } from "react";
import { useMemo } from "react";
import OpportunityDrawerLayoutRuntimeBodyErrorBoundary from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeBodyErrorBoundary";
import OpportunityDrawerLayoutRuntimeOverviewHold from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeOverviewHold";
import DrawerLayoutRuntimeStagingDiagnostic from "@/components/admin/vmDrawer/DrawerLayoutRuntimeStagingDiagnostic";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import {
    isLayoutRuntimeHardCutoverActiveClient,
} from "@/lib/layout/featureFlag";
import { computeLayoutRuntimeBodyRenderStats } from "@/lib/layout/runtime/layoutRuntimeBodyRenderStats";
import type { LayoutRuntimeDrawerSurface } from "@/lib/layout/runtime/logLayoutRuntimeBodyRenderFailure";
import type { UseDrawerLayoutRuntimeBodyResult } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";

type Props = {
    layoutBody: UseDrawerLayoutRuntimeBodyResult;
    vmFallback: ReactNode;
    entityId: string;
    surface: LayoutRuntimeDrawerSurface;
    dataAttribute?: string;
};

function shouldShowStagingDiagnostic(): boolean {
    return (
        isLayoutRuntimeHardCutoverActiveClient() ||
        process.env.NEXT_PUBLIC_APP_ENV === "staging" ||
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG === "1"
    );
}

export default function DrawerLayoutRuntimeOverviewBody({
    layoutBody,
    vmFallback,
    entityId,
    surface,
    dataAttribute = "drawer-layout-runtime-overview",
}: Props) {
    const renderStats = useMemo(
        () => computeLayoutRuntimeBodyRenderStats(layoutBody.doc, layoutBody.record),
        [layoutBody.doc, layoutBody.record],
    );

    const showStagingDiagnostic = shouldShowStagingDiagnostic();
    const useEmptyBodyFallback =
        layoutBody.bodyReady &&
        renderStats.renderableItemCount === 0 &&
        renderStats.fallbackReason != null;

    if (layoutBody.bodyReady && layoutBody.doc && layoutBody.record && !useEmptyBodyFallback) {
        return (
            <OpportunityDrawerLayoutRuntimeBodyErrorBoundary
                fallback={vmFallback}
                logContext={{
                    entityId,
                    layoutSource: layoutBody.layoutSource,
                    surface,
                }}
            >
                <div
                    className="space-y-4"
                    data-drawer-layout-runtime-overview="true"
                    data-layout-runtime-surface={surface}
                    data-layout-runtime-source={layoutBody.layoutSource ?? ""}
                    data-layout-runtime-readonly="true"
                    data-drawer-layout-runtime-renderable-count={renderStats.renderableItemCount}
                >
                    {showStagingDiagnostic ?
                        <DrawerLayoutRuntimeStagingDiagnostic
                            layoutSource={layoutBody.layoutSource}
                            stats={renderStats}
                            surface={surface}
                            lastError={layoutBody.lastError}
                        />
                    :   null}
                    <LayoutRuntimeDrawerBodyView doc={layoutBody.doc} record={layoutBody.record} />
                </div>
            </OpportunityDrawerLayoutRuntimeBodyErrorBoundary>
        );
    }

    if (layoutBody.showHold) {
        return <OpportunityDrawerLayoutRuntimeOverviewHold />;
    }

    if (useEmptyBodyFallback) {
        return (
            <div className="space-y-4" data-drawer-layout-runtime-empty-fallback="true">
                {showStagingDiagnostic ?
                    <DrawerLayoutRuntimeStagingDiagnostic
                        layoutSource={layoutBody.layoutSource}
                        stats={renderStats}
                        surface={surface}
                        lastError={layoutBody.lastError ?? renderStats.fallbackReason}
                    />
                :   null}
                {vmFallback}
            </div>
        );
    }

    return <>{vmFallback}</>;
}
