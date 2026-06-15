"use client";

import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
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

/** Person drawer relationship workspace — layout-owned sections in dashboard slots. */
export default function PersonOverviewRuntimeComposition({
    doc,
    record,
    entityId,
    canMutate = false,
    onAdornmentAction,
}: Props) {
    const slots = partitionPersonOverviewBodySections(doc);
    const hints = personOverviewCompositionHints();
    const rightRailSections = resolvePersonOverviewRightRailSections(slots, record);
    const showContact =
        slots.contact
        && shouldRenderLayoutRuntimeSection(slots.contact, record, { compositionShell: true });

    return (
        <LayoutRuntimeCompositionProvider value={hints}>
            <div
                className={DRAWER_OVERVIEW_CANVAS_CLASS}
                data-person-overview-composition="true"
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

                {showContact ?
                    <CompositionSlot
                        slotKey="contact_information"
                        sectionKeys={[slots.contact!.key]}
                        doc={doc}
                        record={record}
                        entityId={entityId}
                        canMutate={canMutate}
                        onAdornmentAction={onAdornmentAction}
                    />
                :   null}

                {slots.overflow.length > 0 ?
                    <div className="space-y-3" data-person-overview-overflow="true">
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
