"use client";

import { useMemo } from "react";
import LayoutRuntimeSectionFlowView from "@/components/layout/LayoutRuntimeSectionFlowView";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { partitionDrawerSectionsByZone } from "@/lib/layout/drawerLayoutEditorModel";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import { personOverviewCompositionHints } from "@/lib/layout/runtime/personOverviewComposition";
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

/** Published runtime section flow — honors layoutEditorSectionRowGroup metadata. */
function PublishedSectionFlow({
    sections,
    doc,
    record,
    entityId,
    canMutate,
    onAdornmentAction,
    stackClassName,
    rowClassName,
    rowCellClassName,
}: {
    sections: LayoutSection[];
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    entityId: string;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
    stackClassName?: string;
    rowClassName?: string;
    rowCellClassName?: string;
}) {
    if (sections.length === 0) return null;
    return (
        <LayoutRuntimeSectionFlowView
            doc={doc}
            sections={sections}
            record={record}
            entityId={entityId}
            canMutate={canMutate}
            onAdornmentAction={onAdornmentAction}
            stackClassName={stackClassName}
            rowClassName={rowClassName}
            rowCellClassName={rowCellClassName}
        />
    );
}

function sortRightRailSections(sections: LayoutSection[]): LayoutSection[] {
    return [...sections].sort((a, b) => {
        const pa = readLayoutSectionPresentationMetadata(a).priority;
        const pb = readLayoutSectionPresentationMetadata(b).priority;
        if (pa !== pb) return pa - pb;
        return a.key.localeCompare(b.key);
    });
}

/**
 * Person drawer — published runtime matches Builder section flow (not slot columns).
 *
 * Main-zone sections share one `LayoutEditorSectionFlowView` primitive so row groups,
 * stacked halves, and peer stretch behave like `/admin/settings/layouts` preview.
 */
export default function PersonOverviewRuntimeComposition({
    doc,
    record,
    entityId,
    canMutate = false,
    onAdornmentAction,
}: Props) {
    const hints = personOverviewCompositionHints({ honorLayoutDocBlocks: true });
    const zones = useMemo(() => partitionDrawerSectionsByZone(doc, "person_drawer"), [doc]);
    const rightRailSections = useMemo(
        () =>
            sortRightRailSections(
                zones.right_rail.filter((section) =>
                    shouldRenderLayoutRuntimeSection(section, record, { compositionShell: true }),
                ),
            ),
        [zones.right_rail, record],
    );

    return (
        <LayoutRuntimeCompositionProvider value={hints}>
            <div
                className={DRAWER_OVERVIEW_CANVAS_CLASS}
                data-person-overview-composition="true"
                data-layout-runtime-composition-profile="person-section-flow"
                data-debug-drawer-path="PersonOverviewRuntimeComposition"
            >
                {zones.summary_strip.length > 0 ?
                    <div
                        data-person-overview-slot="summary_strip"
                        className={DRAWER_OVERVIEW_SUMMARY_STRIP_HOST_CLASS}
                    >
                        <PublishedSectionFlow
                            sections={zones.summary_strip}
                            doc={doc}
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

                {zones.main.length > 0 || rightRailSections.length > 0 ?
                    <div className={DRAWER_OVERVIEW_SHELL_GRID_CLASS}>
                        {zones.main.length > 0 ?
                            <div
                                className={DRAWER_OVERVIEW_MAIN_ZONE_FLOW_CLASS}
                                data-person-overview-slot="main_zone"
                                data-person-overview-main-zone-flow="true"
                            >
                                <PublishedSectionFlow
                                    sections={zones.main}
                                    doc={doc}
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
                                data-person-overview-slot="right_rail"
                                data-person-overview-right-rail-section-count={String(rightRailSections.length)}
                            >
                                <PublishedSectionFlow
                                    sections={rightRailSections}
                                    doc={doc}
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
