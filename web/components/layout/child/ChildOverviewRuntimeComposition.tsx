"use client";

import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
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

    return (
        <LayoutRuntimeCompositionProvider value={hints}>
            <div
                className={DRAWER_OVERVIEW_CANVAS_CLASS}
                data-child-overview-composition="true"
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

                {showSchedule ?
                    <CompositionSlot
                        slotKey="schedule_attendance"
                        sectionKeys={[slots.schedule!.key]}
                        doc={doc}
                        record={record}
                        entityId={entityId}
                        canMutate={canMutate}
                        onAdornmentAction={onAdornmentAction}
                    />
                :   null}

                {slots.overflow.length > 0 ?
                    <div className="space-y-3" data-child-overview-overflow="true">
                        {slots.overflow.map((section) => (
                            <CompositionSlot
                                key={section.key}
                                slotKey={section.key}
                                sectionKeys={[section.key]}
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
        </LayoutRuntimeCompositionProvider>
    );
}
