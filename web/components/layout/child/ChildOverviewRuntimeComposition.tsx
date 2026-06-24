"use client";

import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import LayoutRuntimeSectionFlowView from "@/components/layout/LayoutRuntimeSectionFlowView";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import {
    childOverviewCompositionHints,
    partitionChildOverviewBodySections,
    sliceLayoutDocSections,
} from "@/lib/layout/runtime/childOverviewComposition";
import { resolveChildOverviewRightRailSections } from "@/lib/layout/runtime/resolveChildOverviewRightRailSections";
import { shouldRenderLayoutRuntimeSection } from "@/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility";
import {
    DRAWER_OVERVIEW_CANVAS_CLASS,
    DRAWER_OVERVIEW_LEFT_COLUMN_CLASS,
    DRAWER_OVERVIEW_MAIN_COLUMN_CLASS,
    DRAWER_OVERVIEW_RIGHT_RAIL_CLASS,
    DRAWER_OVERVIEW_SHELL_GRID_CLASS,
    mergeCompositionSlotIntoFlowWhenRowGrouped,
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
        <div className={className} data-child-overview-slot={slotKey}>
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

/** Published runtime section flow — honors layoutEditorSectionRowGroup metadata. */
function PublishedSectionFlow({
    sections,
    doc,
    record,
    entityId,
    canMutate,
    onAdornmentAction,
    stackClassName,
}: {
    sections: LayoutSection[];
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    entityId: string;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
    stackClassName?: string;
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
            rowClassName={LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS}
            rowCellClassName={LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS}
        />
    );
}

/** Child drawer enrollment/care workspace — layout-owned sections in dashboard slots. */
export default function ChildOverviewRuntimeComposition({
    doc,
    record,
    entityId,
    canMutate = false,
    onAdornmentAction,
}: Props) {
    const slots = partitionChildOverviewBodySections(doc);
    const hints = childOverviewCompositionHints();
    const rightRailSections = resolveChildOverviewRightRailSections(slots, record);
    const showSchedule =
        slots.schedule
        && shouldRenderLayoutRuntimeSection(slots.schedule, record, { compositionShell: true });
    const { slotStandalone: scheduleStandalone, flowSections: belowShellFlow } =
        mergeCompositionSlotIntoFlowWhenRowGrouped(
            doc,
            showSchedule ? slots.schedule : null,
            slots.overflow,
        );

    return (
        <LayoutRuntimeCompositionProvider value={hints}>
            <div
                className={DRAWER_OVERVIEW_CANVAS_CLASS}
                data-child-overview-composition="true"
                data-debug-drawer-path="ChildOverviewRuntimeComposition"
            >
                <div className={DRAWER_OVERVIEW_SHELL_GRID_CLASS}>
                    {slots.family ?
                        <CompositionSlot
                            slotKey="family_relationships"
                            sectionKeys={[slots.family.key]}
                            doc={doc}
                            record={record}
                            entityId={entityId}
                            canMutate={canMutate}
                            onAdornmentAction={onAdornmentAction}
                            className={DRAWER_OVERVIEW_LEFT_COLUMN_CLASS}
                        />
                    :   null}

                    {slots.program ?
                        <CompositionSlot
                            slotKey="program_enrollment"
                            sectionKeys={[slots.program.key]}
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
                            data-child-overview-slot="right_rail"
                            data-child-overview-right-rail-section-count={String(rightRailSections.length)}
                        >
                            <PublishedSectionFlow
                                sections={rightRailSections}
                                doc={doc}
                                record={record}
                                entityId={entityId}
                                canMutate={canMutate}
                                onAdornmentAction={onAdornmentAction}
                                stackClassName={LAYOUT_RUNTIME_SECTION_STACK_CLASS}
                            />
                        </div>
                    :   null}
                </div>

                {scheduleStandalone ?
                    <CompositionSlot
                        slotKey="schedule_attendance"
                        sectionKeys={[scheduleStandalone.key]}
                        doc={doc}
                        record={record}
                        entityId={entityId}
                        canMutate={canMutate}
                        onAdornmentAction={onAdornmentAction}
                    />
                :   null}

                {belowShellFlow.length > 0 ?
                    <div data-child-overview-overflow="true">
                        <PublishedSectionFlow
                            sections={belowShellFlow}
                            doc={doc}
                            record={record}
                            entityId={entityId}
                            canMutate={canMutate}
                            onAdornmentAction={onAdornmentAction}
                            stackClassName={LAYOUT_RUNTIME_SECTION_STACK_CLASS}
                        />
                    </div>
                :   null}
            </div>
        </LayoutRuntimeCompositionProvider>
    );
}
