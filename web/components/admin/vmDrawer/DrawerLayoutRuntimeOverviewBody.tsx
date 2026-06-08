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

    if (layoutBody.bodyReady && layoutBody.doc && layoutBody.record && !useEmptyBodyFallback) {
        const noRenderedItems = evidence.renderedItemCount === 0 && evidence.itemEvidence.length > 0;
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
                    data-layout-runtime-key={layoutBody.layoutKey ?? ""}
                    data-layout-runtime-record-id={layoutBody.layoutRecordId ?? ""}
                    data-layout-runtime-version={layoutBody.layoutVersion ?? ""}
                    data-layout-runtime-readonly="true"
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
                        evidence={evidence}
                    />
                :   null}
                {vmFallback}
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
            {vmFallback}
        </>
    );
}
