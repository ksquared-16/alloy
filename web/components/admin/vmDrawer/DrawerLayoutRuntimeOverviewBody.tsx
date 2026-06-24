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
import LeadOverviewRuntimeComposition from "@/components/layout/LeadOverviewRuntimeComposition";
import PersonOverviewRuntimeComposition from "@/components/layout/person/PersonOverviewRuntimeComposition";
import ChildOverviewRuntimeComposition from "@/components/layout/child/ChildOverviewRuntimeComposition";
import LayoutRuntimeDrawerEditProvider from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import LayoutRuntimeErrorPanel from "@/components/layout/LayoutRuntimeErrorPanel";
import {
    layoutRuntimeCompositionHintsProfile,
    resolveDrawerLayoutRuntimeCompositionHints,
} from "@/lib/layout/runtime/resolveDrawerLayoutRuntimeCompositionHints";
import {
    isLayoutRuntimeHardCutoverActiveClient,
} from "@/lib/layout/featureFlag";
import { computeLayoutRuntimeBodyRenderStats } from "@/lib/layout/runtime/layoutRuntimeBodyRenderStats";
import {
    buildLayoutRuntimeDrawerEvidence,
    logLayoutRuntimeDrawerEvidence,
} from "@/lib/layout/runtime/layoutRuntimeEvidence";
import { summarizeLayoutDocCompositionDiagnostics } from "@/lib/layout/layoutEditorSectionCompositionDiagnostics";
import { shouldLogLayoutRuntimeEvidence } from "@/lib/layout/runtime/layoutRuntimeEvidenceClient";
import type { LayoutRuntimeDrawerSurface } from "@/lib/layout/runtime/logLayoutRuntimeBodyRenderFailure";
import type { UseDrawerLayoutRuntimeBodyResult } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { shouldUseLeadOverviewComposition } from "@/lib/layout/runtime/leadOverviewComposition";
import { shouldUsePersonOverviewComposition } from "@/lib/layout/runtime/personOverviewComposition";
import { shouldUseChildOverviewComposition } from "@/lib/layout/runtime/childOverviewComposition";

type Props = {
    layoutBody: UseDrawerLayoutRuntimeBodyResult;
    vmFallback: ReactNode;
    entityId: string;
    surface: LayoutRuntimeDrawerSurface;
    dataAttribute?: string;
    canMutate?: boolean;
    onAdornmentAction?: import("@/components/layout/LayoutRuntimePlanView").AdornmentActionHandler;
    /** When set, renders this doc instead of layoutBody.doc (shell zone body partition). */
    layoutDocOverride?: LayoutDoc | null;
    onLayoutRuntimeSaved?: () => void | Promise<void>;
};

function shouldShowStagingDiagnostic(): boolean {
    return process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG === "1";
}

function drawerEditEntityTypeForSurface(
    surface: LayoutRuntimeDrawerSurface,
): import("@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch").DrawerLayoutRuntimeBodyRecordPatchDetail["entityType"] {
    if (surface === "person_drawer_overview") return "persons";
    if (surface === "child_drawer_overview") return "child";
    return "opportunities";
}

export default function DrawerLayoutRuntimeOverviewBody({
    layoutBody,
    vmFallback,
    entityId,
    surface,
    onAdornmentAction,
    canMutate = false,
    layoutDocOverride,
    onLayoutRuntimeSaved,
}: Props) {
    const effectiveDoc = layoutDocOverride ?? layoutBody.doc;

    const renderStats = useMemo(
        () => computeLayoutRuntimeBodyRenderStats(effectiveDoc, layoutBody.record),
        [effectiveDoc, layoutBody.record],
    );

    const evidence = useMemo(
        () =>
            buildLayoutRuntimeDrawerEvidence({
                opportunityId: entityId,
                doc: effectiveDoc,
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
        [entityId, effectiveDoc, layoutBody],
    );

    const sectionDiagnostics = useMemo(
        () =>
            effectiveDoc ?
                summarizeLayoutDocCompositionDiagnostics(effectiveDoc, {
                    layoutRecordId: layoutBody.layoutRecordId,
                    layoutVersion: layoutBody.layoutVersion,
                    surface: "live_drawer_runtime",
                    honorLayoutDocBlocks: true,
                })
            :   [],
        [effectiveDoc, layoutBody.layoutRecordId, layoutBody.layoutVersion],
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

    if (layoutBody.bodyReady && effectiveDoc && layoutBody.record && !useEmptyBodyFallback) {
        const noRenderedItems = evidence.renderedItemCount === 0 && evidence.itemEvidence.length > 0;
        const useLeadComposition =
            surface === "opportunity_drawer_overview" && shouldUseLeadOverviewComposition(effectiveDoc);
        const usePersonComposition =
            surface === "person_drawer_overview" && shouldUsePersonOverviewComposition(effectiveDoc);
        const useChildComposition =
            surface === "child_drawer_overview" && shouldUseChildOverviewComposition(effectiveDoc);
        const fallbackCompositionHints = resolveDrawerLayoutRuntimeCompositionHints({
            surface,
            doc: effectiveDoc,
            honorLayoutDocBlocks: true,
        });
        const compositionProfile = layoutRuntimeCompositionHintsProfile(fallbackCompositionHints);
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
                    data-debug-drawer-path="DrawerLayoutRuntimeOverviewBody:bodyReady"
                    data-debug-drawer-composition={
                        useLeadComposition ? "LeadOverviewRuntimeComposition"
                        : usePersonComposition ? "PersonOverviewRuntimeComposition"
                        : useChildComposition ? "ChildOverviewRuntimeComposition"
                        : "LayoutRuntimeDrawerBodyView"
                    }
                    data-layout-runtime-surface={surface}
                    data-layout-runtime-source={layoutBody.layoutSource ?? ""}
                    data-layout-runtime-key={layoutBody.layoutKey ?? ""}
                    data-layout-runtime-record-id={layoutBody.layoutRecordId ?? ""}
                    data-layout-runtime-version={layoutBody.layoutVersion ?? ""}
                    data-drawer-layout-runtime-renderable-count={renderStats.renderableItemCount}
                    {...(layoutDocOverride != null ? { "data-drawer-layout-runtime-shell-zone": "body" } : {})}
                >
                    {showStagingDiagnostic ?
                        <DrawerLayoutRuntimeStagingDiagnostic
                            layoutSource={layoutBody.layoutSource}
                            stats={renderStats}
                            surface={surface}
                            lastError={layoutBody.lastError ?? (noRenderedItems ? "zero_rendered_items" : null)}
                            evidence={evidence}
                            sectionDiagnostics={sectionDiagnostics}
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
                    <LayoutRuntimeDrawerEditProvider
                        record={layoutBody.record}
                        entityType={drawerEditEntityTypeForSurface(surface)}
                        onSaved={onLayoutRuntimeSaved}
                    >
                        {useLeadComposition ?
                            <LeadOverviewRuntimeComposition
                                doc={effectiveDoc}
                                record={layoutBody.record}
                                entityId={entityId}
                                canMutate={canMutate}
                                onAdornmentAction={onAdornmentAction}
                            />
                        : usePersonComposition ?
                            <PersonOverviewRuntimeComposition
                                doc={effectiveDoc}
                                record={layoutBody.record}
                                entityId={entityId}
                                canMutate={canMutate}
                                onAdornmentAction={onAdornmentAction}
                            />
                        : useChildComposition ?
                            <ChildOverviewRuntimeComposition
                                doc={effectiveDoc}
                                record={layoutBody.record}
                                entityId={entityId}
                                canMutate={canMutate}
                                onAdornmentAction={onAdornmentAction}
                            />
                        :   <LayoutRuntimeCompositionProvider value={fallbackCompositionHints}>
                                <div data-layout-runtime-composition-profile={compositionProfile}>
                                    <LayoutRuntimeDrawerBodyView
                                        doc={effectiveDoc}
                                        record={layoutBody.record}
                                        entityId={entityId}
                                        canMutate={canMutate}
                                        onAdornmentAction={onAdornmentAction}
                                    />
                                </div>
                            </LayoutRuntimeCompositionProvider>
                        }
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
            <div
                className="space-y-4"
                data-drawer-layout-runtime-empty-fallback="true"
                data-debug-drawer-path="DrawerLayoutRuntimeOverviewBody:emptyFallback"
                data-debug-drawer-hard-cutover={hardCutover ? "1" : "0"}
            >
                {showStagingDiagnostic ?
                    <DrawerLayoutRuntimeStagingDiagnostic
                        layoutSource={layoutBody.layoutSource}
                        stats={renderStats}
                        surface={surface}
                        lastError={layoutBody.lastError ?? renderStats.fallbackReason}
                        evidence={evidence}
                        sectionDiagnostics={sectionDiagnostics}
                    />
                :   null}
                {fallbackNode}
            </div>
        );
    }

    return (
        <div
            data-debug-drawer-path="DrawerLayoutRuntimeOverviewBody:fallback"
            data-debug-drawer-phase={layoutBody.phase}
            data-debug-drawer-hard-cutover={hardCutover ? "1" : "0"}
        >
            {showStagingDiagnostic ?
                <DrawerLayoutRuntimeStagingDiagnostic
                    layoutSource={layoutBody.layoutSource}
                    stats={renderStats}
                    surface={surface}
                    lastError={layoutBody.lastError ?? layoutBody.phase}
                    evidence={evidence}
                    sectionDiagnostics={sectionDiagnostics}
                />
            :   null}
            {fallbackNode}
        </div>
    );
}
