"use client";

/**
 * Shared drawer overview body — layout runtime with hold + error boundary + VM emergency fallback.
 */

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import OpportunityDrawerLayoutRuntimeBodyErrorBoundary from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeBodyErrorBoundary";
import OpportunityDrawerLayoutRuntimeOverviewHold from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeOverviewHold";
import DrawerLayoutRuntimeStagingDiagnostic from "@/components/admin/vmDrawer/DrawerLayoutRuntimeStagingDiagnostic";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import LayoutRuntimeDrawerEditProvider from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import LayoutRuntimeErrorPanel from "@/components/layout/LayoutRuntimeErrorPanel";
import {
    isLayoutRuntimeHardCutoverActiveClient,
} from "@/lib/layout/featureFlag";
import { computeLayoutRuntimeBodyRenderStats } from "@/lib/layout/runtime/layoutRuntimeBodyRenderStats";
import {
    buildLayoutRuntimeDrawerEvidence,
    logLayoutRuntimeDrawerEvidence,
} from "@/lib/layout/runtime/layoutRuntimeEvidence";
import { shouldLogLayoutRuntimeEvidence } from "@/lib/layout/runtime/layoutRuntimeEvidenceClient";
import type { LayoutRuntimeDrawerSurface } from "@/lib/layout/runtime/logLayoutRuntimeBodyRenderFailure";
import type { UseDrawerLayoutRuntimeBodyResult } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";

type Props = {
    layoutBody: UseDrawerLayoutRuntimeBodyResult;
    vmFallback: ReactNode;
    entityId: string;
    surface: LayoutRuntimeDrawerSurface;
    dataAttribute?: string;
    onAdornmentAction?: import("@/components/layout/LayoutRuntimePlanView").AdornmentActionHandler;
};

function shouldShowStagingDiagnostic(): boolean {
    return process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG === "1";
}

export default function DrawerLayoutRuntimeOverviewBody({
    layoutBody,
    vmFallback,
    entityId,
    surface,
    onAdornmentAction,
}: Props) {
    const renderStats = useMemo(
        () => computeLayoutRuntimeBodyRenderStats(layoutBody.doc, layoutBody.record),
        [layoutBody.doc, layoutBody.record],
    );

    const evidence = useMemo(
        () =>
            buildLayoutRuntimeDrawerEvidence({
                opportunityId: entityId,
                doc: layoutBody.doc,
                record: layoutBody.record,
                layoutSource: layoutBody.layoutSource,
                layoutKey: layoutBody.layoutKey,
                layoutRecordId: layoutBody.layoutRecordId,
                layoutVersion: layoutBody.layoutVersion,
                phase: layoutBody.phase,
                bodyReady: layoutBody.bodyReady,
                showHold: layoutBody.showHold,
                useVmFallback: layoutBody.useVmFallback,
                lastError: layoutBody.lastError,
            }),
        [entityId, layoutBody],
    );

    useEffect(() => {
        if (!shouldLogLayoutRuntimeEvidence()) return;
        logLayoutRuntimeDrawerEvidence(evidence);
    }, [evidence]);

    const showStagingDiagnostic = shouldShowStagingDiagnostic();
    /** VM fallback only when the layout doc has zero production-safe items — not when values are blank. */
    const useEmptyBodyFallback =
        layoutBody.bodyReady && renderStats.fallbackReason === "no_production_supported_items";

    // Hard cutover: NEVER show the legacy VM overview body. When the layout can't
    // render (fetch fail / timeout / render throw / no supported items), surface a
    // visible error panel instead of silently falling back to the old drawer.
    const hardCutover = isLayoutRuntimeHardCutoverActiveClient();
    const fallbackNode = hardCutover ? (
        <LayoutRuntimeErrorPanel
            surface={surface}
            reason={layoutBody.lastError ?? renderStats.fallbackReason ?? layoutBody.phase}
            layoutSource={layoutBody.layoutSource}
            layoutKey={layoutBody.layoutKey}
            detail={{ phase: layoutBody.phase, bodyReady: layoutBody.bodyReady, sectionCount: renderStats.sectionCount }}
        />
    ) : (
        vmFallback
    );

    if (layoutBody.bodyReady && layoutBody.doc && layoutBody.record && !useEmptyBodyFallback) {
        const noRenderedItems = evidence.renderedItemCount === 0 && evidence.itemEvidence.length > 0;
        return (
            <OpportunityDrawerLayoutRuntimeBodyErrorBoundary
                fallback={fallbackNode}
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
                    data-layout-runtime-key={layoutBody.layoutKey ?? ""}
                    data-layout-runtime-record-id={layoutBody.layoutRecordId ?? ""}
                    data-layout-runtime-version={layoutBody.layoutVersion ?? ""}
                    data-drawer-layout-runtime-renderable-count={renderStats.renderableItemCount}
                >
                    {showStagingDiagnostic ?
                        <DrawerLayoutRuntimeStagingDiagnostic
                            layoutSource={layoutBody.layoutSource}
                            stats={renderStats}
                            surface={surface}
                            lastError={layoutBody.lastError ?? (noRenderedItems ? "zero_rendered_items" : null)}
                            evidence={evidence}
                        />
                    :   null}
                    {noRenderedItems && !showStagingDiagnostic ?
                        <div
                            className="rounded-md border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-950"
                            data-drawer-layout-runtime-empty-body="true"
                        >
                            Layout configured but no items rendered. Enable staging diagnostic for item evidence.
                        </div>
                    :   null}
                    <LayoutRuntimeDrawerEditProvider record={layoutBody.record}>
                        <LayoutRuntimeDrawerBodyView
                            doc={layoutBody.doc}
                            record={layoutBody.record}
                            onAdornmentAction={onAdornmentAction}
                        />
                    </LayoutRuntimeDrawerEditProvider>
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
                        evidence={evidence}
                    />
                :   null}
                {fallbackNode}
            </div>
        );
    }

    return (
        <>
            {showStagingDiagnostic ?
                <DrawerLayoutRuntimeStagingDiagnostic
                    layoutSource={layoutBody.layoutSource}
                    stats={renderStats}
                    surface={surface}
                    lastError={layoutBody.lastError ?? layoutBody.phase}
                    evidence={evidence}
                />
            :   null}
            {fallbackNode}
        </>
    );
}
