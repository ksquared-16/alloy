"use client";

import { useMemo } from "react";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import LayoutRuntimeSectionFlowView from "@/components/layout/LayoutRuntimeSectionFlowView";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import { isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient } from "@/lib/layout/featureFlag";
import { partitionOpportunityDrawerSectionsByZone } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import {
    leadOverviewCompositionHints,
    partitionLeadOverviewBodySections,
    sliceLayoutDocSections,
} from "@/lib/layout/runtime/leadOverviewComposition";
import { buildOpportunityDrawerRuntimeSectionVisibilityContext } from "@/lib/layout/runtime/opportunityDrawerEntityLayoutVisibility";
import { sortLayoutSectionsByDocPosition } from "@/lib/layout/runtime/orderLayoutSectionsByDocPosition";
import { resolveLeadOverviewRightRailSections } from "@/lib/layout/runtime/resolveLeadOverviewRightRailSections";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import {
    DRAWER_OVERVIEW_CANVAS_CLASS,
    DRAWER_OVERVIEW_COMPOSITION_SLOT_CLASS,
    DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS,
    DRAWER_OVERVIEW_LEFT_COLUMN_CLASS,
    DRAWER_OVERVIEW_MAIN_COLUMN_CLASS,
    DRAWER_OVERVIEW_MAIN_ZONE_FLOW_CLASS,
    DRAWER_OVERVIEW_RIGHT_RAIL_CLASS,
    DRAWER_OVERVIEW_SHELL_GRID_CLASS,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { LAYOUT_RUNTIME_SECTION_STACK_CLASS } from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    entityId: string;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
};

function CompositionSlot({
    slotKey,
    sectionKeys,
    doc,
    record,
    entityId,
    canMutate,
    onAdornmentAction,
    className,
}: {
    slotKey: string;
    sectionKeys: string[];
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    entityId: string;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
    className?: string;
}) {
    const slice = sliceLayoutDocSections(doc, sectionKeys);
    if (!slice.sections.length) return null;

    return (
        <div className={`${DRAWER_OVERVIEW_COMPOSITION_SLOT_CLASS} ${className ?? ""}`.trim()} data-lead-overview-slot={slotKey}>
            <LayoutRuntimeDrawerBodyView
                doc={slice}
                record={record}
                entityId={entityId}
                canMutate={canMutate}
                onAdornmentAction={onAdornmentAction}
            />
        </div>
    );
}

/**
 * Lead drawer overview composition — dashboard shell for layout-owned sections.
 *
 * Each slot delegates to LayoutRuntimeDrawerBodyView with a sliced LayoutDoc.
 * Unknown sections render in the overflow fallback below the grid.
 */
export default function LeadOverviewRuntimeComposition({
    doc,
    record,
    entityId,
    canMutate = false,
    onAdornmentAction,
}: Props) {
    const slots = partitionLeadOverviewBodySections(doc);
    const visualConfigEnabled = isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient();
    const hints = leadOverviewCompositionHints({
        honorLayoutDocBlocks: true,
    });
    const visibilityCtx = useMemo(
        () =>
            buildOpportunityDrawerRuntimeSectionVisibilityContext(
                { compositionShell: true },
                { adoptionEnabled: isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient() },
            ),
        [],
    );
    const rightRailSections = resolveLeadOverviewRightRailSections(slots, record, visibilityCtx, doc);
    const zones = useMemo(() => partitionOpportunityDrawerSectionsByZone(doc), [doc]);
    const showHousehold =
        slots.household && shouldRenderLayoutRuntimeSection(slots.household, record, visibilityCtx);
    const showEnrollment =
        slots.enrollment && shouldRenderLayoutRuntimeSection(slots.enrollment, record, visibilityCtx);
    const showLeadSource =
        slots.leadSource && shouldRenderLayoutRuntimeSection(slots.leadSource, record, visibilityCtx);

    return (
        <LayoutRuntimeCompositionProvider value={hints}>
            <div className={DRAWER_OVERVIEW_CANVAS_CLASS} data-lead-overview-composition="true" data-debug-drawer-path="LeadOverviewRuntimeComposition">
                {/* Shell grid: household 4 / enrollment 5 / right rail 3 — see LEAD_OVERVIEW_SHELL_GRID */}
                <div className={DRAWER_OVERVIEW_SHELL_GRID_CLASS}>
                    {visualConfigEnabled && zones.main.length > 0 ?
                        <div className={DRAWER_OVERVIEW_MAIN_ZONE_FLOW_CLASS} data-lead-overview-slot="main_zone">
                            <LayoutRuntimeSectionFlowView
                                doc={doc}
                                sections={zones.main}
                                record={record}
                                entityId={entityId}
                                canMutate={canMutate}
                                onAdornmentAction={onAdornmentAction}
                                rowClassName="min-w-0 items-stretch"
                                rowCellClassName="min-w-0 flex h-full min-h-0 flex-col"
                            />
                        </div>
                    :   <>
                            {showHousehold && slots.household ?
                                <CompositionSlot
                                    slotKey="household_contact"
                                    sectionKeys={[slots.household.key]}
                                    doc={doc}
                                    record={record}
                                    entityId={entityId}
                                    canMutate={canMutate}
                                    onAdornmentAction={onAdornmentAction}
                                    className={DRAWER_OVERVIEW_LEFT_COLUMN_CLASS}
                                />
                            :   null}

                            {showEnrollment && slots.enrollment ?
                                <CompositionSlot
                                    slotKey="children_enrollment"
                                    sectionKeys={[slots.enrollment.key]}
                                    doc={doc}
                                    record={record}
                                    entityId={entityId}
                                    canMutate={canMutate}
                                    onAdornmentAction={onAdornmentAction}
                                    className={DRAWER_OVERVIEW_MAIN_COLUMN_CLASS}
                                />
                            :   null}
                        </>
                    }

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
                            />
                        </div>
                    :   null}
                </div>

                {showLeadSource && slots.leadSource ?
                    <div className={`${DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS} items-stretch`}>
                        <CompositionSlot
                            slotKey="lead_source"
                            sectionKeys={[slots.leadSource.key]}
                            doc={doc}
                            record={record}
                            entityId={entityId}
                            canMutate={canMutate}
                            onAdornmentAction={onAdornmentAction}
                            className="flex h-full min-h-0 flex-col"
                        />
                    </div>
                :   null}

                {slots.overflow.length > 0 ?
                    <div data-lead-overview-slot="overflow" className={LAYOUT_RUNTIME_SECTION_STACK_CLASS}>
                        <LayoutRuntimeSectionFlowView
                            doc={doc}
                            sections={
                                visibilityCtx.opportunityEntityLayoutsVisualConfig ?
                                    sortLayoutSectionsByDocPosition(doc, slots.overflow)
                                :   slots.overflow
                            }
                            record={record}
                            entityId={entityId}
                            canMutate={canMutate}
                            onAdornmentAction={onAdornmentAction}
                        />
                    </div>
                :   null}
            </div>
        </LayoutRuntimeCompositionProvider>
    );
}
