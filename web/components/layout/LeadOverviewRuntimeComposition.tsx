"use client";

import { useMemo } from "react";
import LayoutRuntimeSectionFlowView from "@/components/layout/LayoutRuntimeSectionFlowView";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { partitionOpportunityDrawerSectionsByZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import { leadOverviewCompositionHints } from "@/lib/layout/runtime/leadOverviewComposition";
import { buildOpportunityDrawerRuntimeSectionVisibilityContext } from "@/lib/layout/runtime/opportunityDrawerEntityLayoutVisibility";
import { sortLayoutSectionsByDocPosition } from "@/lib/layout/runtime/orderLayoutSectionsByDocPosition";
import { readLayoutSectionPresentationMetadata } from "@/lib/layout/runtime/layoutSectionPresentationMetadata";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import {
    DRAWER_OVERVIEW_CANVAS_CLASS,
    DRAWER_OVERVIEW_MAIN_ZONE_FLOW_CLASS,
    DRAWER_OVERVIEW_RIGHT_RAIL_CLASS,
    DRAWER_OVERVIEW_SHELL_GRID_CLASS,
    DRAWER_OVERVIEW_SUMMARY_STRIP_HOST_CLASS,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import {
    LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS,
    LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS,
    LAYOUT_RUNTIME_SECTION_STACK_CLASS,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    entityId: string;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
};

/**
 * Lead drawer overview — published runtime matches Builder section flow (not slot columns).
 *
 * Main-zone sections share one `LayoutEditorSectionFlowView` primitive so row groups,
 * stacked halves, and peer stretch behave like `/admin/settings/layouts` preview.
 */
export default function LeadOverviewRuntimeComposition({
    doc,
    record,
    entityId,
    canMutate = false,
    onAdornmentAction,
}: Props) {
    const hints = leadOverviewCompositionHints({
        honorLayoutDocBlocks: true,
    });
    const visibilityCtx = useMemo(
        () => buildOpportunityDrawerRuntimeSectionVisibilityContext({ compositionShell: true }),
        [],
    );
    const zones = useMemo(() => partitionOpportunityDrawerSectionsByZone(doc), [doc]);
    const mainSections = useMemo(
        () => sortLayoutSectionsByDocPosition(doc, zones.main),
        [doc, zones.main],
    );
    const rightRailSections = useMemo(
        () =>
            sortLayoutSectionsByDocPosition(
                doc,
                zones.right_rail.filter((section) =>
                    shouldRenderLayoutRuntimeSection(section, record, visibilityCtx),
                ),
            ).sort((a, b) => {
                const pa = readLayoutSectionPresentationMetadata(a).priority;
                const pb = readLayoutSectionPresentationMetadata(b).priority;
                if (pa !== pb) return pa - pb;
                return a.key.localeCompare(b.key);
            }),
        [doc, zones.right_rail, record, visibilityCtx],
    );

    return (
        <LayoutRuntimeCompositionProvider value={hints}>
            <div
                className={DRAWER_OVERVIEW_CANVAS_CLASS}
                data-lead-overview-composition="true"
                data-layout-runtime-composition-profile="lead-section-flow"
                data-debug-drawer-path="LeadOverviewRuntimeComposition"
            >
                {zones.summary_strip.length > 0 ?
                    <div
                        data-lead-overview-slot="summary_strip"
                        className={DRAWER_OVERVIEW_SUMMARY_STRIP_HOST_CLASS}
                    >
                        <LayoutRuntimeSectionFlowView
                            doc={doc}
                            sections={zones.summary_strip}
                            record={record}
                            entityId={entityId}
                            canMutate={canMutate}
                            onAdornmentAction={onAdornmentAction}
                            stackClassName="min-w-0"
                            rowClassName="min-w-0 w-full"
                            rowCellClassName={LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS}
                        />
                    </div>
                :   null}

                {mainSections.length > 0 || rightRailSections.length > 0 ?
                    <div className={DRAWER_OVERVIEW_SHELL_GRID_CLASS}>
                        {mainSections.length > 0 ?
                            <div
                                className={DRAWER_OVERVIEW_MAIN_ZONE_FLOW_CLASS}
                                data-lead-overview-slot="main_zone"
                                data-lead-overview-main-zone-flow="true"
                            >
                                <LayoutRuntimeSectionFlowView
                                    doc={doc}
                                    sections={mainSections}
                                    record={record}
                                    entityId={entityId}
                                    canMutate={canMutate}
                                    onAdornmentAction={onAdornmentAction}
                                    stackClassName={LAYOUT_RUNTIME_SECTION_STACK_CLASS}
                                    rowClassName={LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS}
                                    rowCellClassName={LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS}
                                />
                            </div>
                        :   null}

                        {rightRailSections.length > 0 ?
                            <div
                                className={DRAWER_OVERVIEW_RIGHT_RAIL_CLASS}
                                data-lead-overview-slot="right_rail"
                                data-lead-overview-right-rail-section-count={String(rightRailSections.length)}
                            >
                                <LayoutRuntimeSectionFlowView
                                    doc={doc}
                                    sections={rightRailSections}
                                    record={record}
                                    entityId={entityId}
                                    canMutate={canMutate}
                                    onAdornmentAction={onAdornmentAction}
                                    stackClassName={LAYOUT_RUNTIME_SECTION_STACK_CLASS}
                                    rowClassName={LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS}
                                    rowCellClassName={LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS}
                                />
                            </div>
                        :   null}
                    </div>
                :   null}
            </div>
        </LayoutRuntimeCompositionProvider>
    );
}
