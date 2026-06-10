"use client";

import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import {
    leadOverviewCompositionHints,
    partitionLeadOverviewBodySections,
    sliceLayoutDocSections,
} from "@/lib/layout/runtime/leadOverviewComposition";
import { resolveLeadOverviewRightRailSections } from "@/lib/layout/runtime/resolveLeadOverviewRightRailSections";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import {
    DRAWER_OVERVIEW_CANVAS_CLASS,
    DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS,
    DRAWER_OVERVIEW_LEFT_COLUMN_CLASS,
    DRAWER_OVERVIEW_MAIN_COLUMN_CLASS,
    DRAWER_OVERVIEW_RIGHT_RAIL_CLASS,
    DRAWER_OVERVIEW_SHELL_GRID_CLASS,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
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
        <div className={className} data-lead-overview-slot={slotKey}>
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

function RightRailSlot({
    section,
    doc,
    record,
    entityId,
    canMutate,
    onAdornmentAction,
}: {
    section: LayoutSection;
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    entityId: string;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
}) {
    return (
        <CompositionSlot
            slotKey={section.key}
            sectionKeys={[section.key]}
            doc={doc}
            record={record}
            entityId={entityId}
            canMutate={canMutate}
            onAdornmentAction={onAdornmentAction}
        />
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
    const hints = leadOverviewCompositionHints();
    const rightRailSections = resolveLeadOverviewRightRailSections(slots, record);
    const showLeadSource =
        slots.leadSource
        && shouldRenderLayoutRuntimeSection(slots.leadSource, record, { compositionShell: true });

    return (
        <LayoutRuntimeCompositionProvider value={hints}>
            <div className={DRAWER_OVERVIEW_CANVAS_CLASS} data-lead-overview-composition="true">
                {/* Shell grid: household 3 / enrollment 7 / right rail 2 — see LEAD_OVERVIEW_SHELL_GRID */}
                <div className={DRAWER_OVERVIEW_SHELL_GRID_CLASS}>
                    {slots.household ?
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

                    {slots.enrollment ?
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

                    {rightRailSections.length > 0 ?
                        <div
                            className={DRAWER_OVERVIEW_RIGHT_RAIL_CLASS}
                            data-lead-overview-slot="right_rail"
                            data-lead-overview-right-rail-section-count={String(rightRailSections.length)}
                        >
                            {rightRailSections.map((section) => (
                                <RightRailSlot
                                    key={section.key}
                                    section={section}
                                    doc={doc}
                                    record={record}
                                    entityId={entityId}
                                    canMutate={canMutate}
                                    onAdornmentAction={onAdornmentAction}
                                />
                            ))}
                        </div>
                    :   null}
                </div>

                {showLeadSource && slots.leadSource ?
                    <div className={DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS}>
                        <CompositionSlot
                            slotKey="lead_source"
                            sectionKeys={[slots.leadSource.key]}
                            doc={doc}
                            record={record}
                            entityId={entityId}
                            canMutate={canMutate}
                            onAdornmentAction={onAdornmentAction}
                        />
                    </div>
                :   null}

                {slots.overflow.length > 0 ?
                    <div data-lead-overview-slot="overflow" className="space-y-4">
                        <LayoutRuntimeDrawerBodyView
                            doc={{ ...doc, sections: slots.overflow }}
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
