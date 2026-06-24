"use client";

import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import LayoutRuntimeSectionFlowView from "@/components/layout/LayoutRuntimeSectionFlowView";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import {
    partitionPersonOverviewBodySections,
    personOverviewCompositionHints,
    sliceLayoutDocSections,
} from "@/lib/layout/runtime/personOverviewComposition";
import { resolvePersonOverviewRightRailSections } from "@/lib/layout/runtime/resolvePersonOverviewRightRailSections";
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
        <div className={className} data-person-overview-slot={slotKey}>
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

/** Person drawer relationship workspace — layout-owned sections in dashboard slots. */
export default function PersonOverviewRuntimeComposition({
    doc,
    record,
    entityId,
    canMutate = false,
    onAdornmentAction,
}: Props) {
    const slots = partitionPersonOverviewBodySections(doc);
    const hints = personOverviewCompositionHints({ honorLayoutDocBlocks: true });
    const rightRailSections = resolvePersonOverviewRightRailSections(slots, record);
    const showContact =
        slots.contact
        && shouldRenderLayoutRuntimeSection(slots.contact, record, { compositionShell: true });
    const { slotStandalone: contactStandalone, flowSections: belowShellFlow } =
        mergeCompositionSlotIntoFlowWhenRowGrouped(
            doc,
            showContact ? slots.contact : null,
            slots.overflow,
        );

    return (
        <LayoutRuntimeCompositionProvider value={hints}>
            <div
                className={DRAWER_OVERVIEW_CANVAS_CLASS}
                data-person-overview-composition="true"
                data-layout-runtime-composition-profile="person-shell"
                data-debug-drawer-path="PersonOverviewRuntimeComposition"
            >
                <div className={DRAWER_OVERVIEW_SHELL_GRID_CLASS}>
                    {slots.household ?
                        <CompositionSlot
                            slotKey="household_relationships"
                            sectionKeys={[slots.household.key]}
                            doc={doc}
                            record={record}
                            entityId={entityId}
                            canMutate={canMutate}
                            onAdornmentAction={onAdornmentAction}
                            className={DRAWER_OVERVIEW_LEFT_COLUMN_CLASS}
                        />
                    :   null}

                    {slots.children ?
                        <CompositionSlot
                            slotKey="connected_children"
                            sectionKeys={[slots.children.key]}
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
                                stackClassName="space-y-2"
                            />
                        </div>
                    :   null}
                </div>

                {contactStandalone ?
                    <CompositionSlot
                        slotKey="contact_information"
                        sectionKeys={[contactStandalone.key]}
                        doc={doc}
                        record={record}
                        entityId={entityId}
                        canMutate={canMutate}
                        onAdornmentAction={onAdornmentAction}
                    />
                :   null}

                {belowShellFlow.length > 0 ?
                    <div data-person-overview-overflow="true">
                        <PublishedSectionFlow
                            sections={belowShellFlow}
                            doc={doc}
                            record={record}
                            entityId={entityId}
                            canMutate={canMutate}
                            onAdornmentAction={onAdornmentAction}
                            stackClassName="space-y-3"
                        />
                    </div>
                :   null}
            </div>
        </LayoutRuntimeCompositionProvider>
    );
}
