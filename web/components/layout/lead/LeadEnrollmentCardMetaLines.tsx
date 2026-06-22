"use client";

import type { ReactNode } from "react";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import LeadEnrollmentRepeaterFieldCell from "@/components/layout/lead/LeadEnrollmentRepeaterFieldCell";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { PRESENTATION_SUPPORTING } from "@/lib/presentation/presentationTypography";

type Props = {
    item: LayoutItem;
    row: ProofRuntimeRecord;
    metaColumns: LayoutCollectionColumn[];
    rowKey: string;
    anchorRecord: ProofRuntimeRecord;
    isEditing: boolean;
    allowChildDrawer?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
};

function SegmentSeparator() {
    return <span className="px-0.5 text-alloy-midnight/22" aria-hidden>·</span>;
}

function columnMatchesRefKey(refKey: string, needles: string[]): boolean {
    const normalized = refKey.toLowerCase();
    return needles.some((needle) => normalized.includes(needle));
}

function InlineFieldRow({ children, testId }: { children: ReactNode; testId?: string }) {
    if (!children) return null;
    return (
        <p
            className={`${PRESENTATION_SUPPORTING} flex flex-wrap items-baseline gap-x-1 gap-y-0.5`}
            data-lead-enrollment-meta-row={testId}
        >
            {children}
        </p>
    );
}

/** Structured enrollment card metadata — same inline layout in display and edit. */
export default function LeadEnrollmentCardMetaLines({
    item,
    row,
    metaColumns,
    rowKey,
    anchorRecord,
    isEditing,
    allowChildDrawer = true,
    onAdornmentAction,
}: Props) {
    const dobColumn = metaColumns.find((col) => columnMatchesRefKey(col.refKey, ["dob", "dob_age", "date_of_birth"]));
    const startColumn = metaColumns.find((col) =>
        columnMatchesRefKey(col.refKey, ["desired_start", "start_date"]),
    );
    const locationColumn = metaColumns.find((col) => columnMatchesRefKey(col.refKey, ["location"]));
    const detailColumns = metaColumns.filter(
        (col) => col !== dobColumn && col !== startColumn && col !== locationColumn,
    );

    const cellProps = {
        item,
        row,
        rowKey,
        anchorRecord,
        isEditing,
        allowChildDrawer,
        onAdornmentAction,
    };

    const dobRow =
        dobColumn ?
            <LeadEnrollmentRepeaterFieldCell key={dobColumn.refKey} col={dobColumn} {...cellProps} />
        :   null;

    const startLocationRow = (
        <>
            {startColumn ?
                <LeadEnrollmentRepeaterFieldCell key={startColumn.refKey} col={startColumn} {...cellProps} />
            :   null}
            {startColumn && locationColumn ?
                <SegmentSeparator />
            :   null}
            {locationColumn ?
                <LeadEnrollmentRepeaterFieldCell key={locationColumn.refKey} col={locationColumn} {...cellProps} />
            :   null}
        </>
    );

    const detailRow =
        detailColumns.length > 0 ?
            detailColumns.map((col, index) => (
                <span key={col.refKey} className="inline-flex items-baseline">
                    {index > 0 ? <SegmentSeparator /> : null}
                    <LeadEnrollmentRepeaterFieldCell col={col} {...cellProps} />
                </span>
            ))
        :   null;

    if (!dobRow && !startColumn && !locationColumn && detailColumns.length === 0) return null;

    return (
        <div
            className="mt-1.5 space-y-0.5"
            data-lead-enrollment-card-meta-lines="true"
            data-enrollment-meta-editing={isEditing ? "true" : "false"}
        >
            {dobRow ?
                <InlineFieldRow testId="dob">{dobRow}</InlineFieldRow>
            :   null}
            {startColumn || locationColumn ?
                <InlineFieldRow testId="start-location">{startLocationRow}</InlineFieldRow>
            :   null}
            {detailColumns.length > 0 ?
                <InlineFieldRow testId="detail">{detailRow}</InlineFieldRow>
            :   null}
        </div>
    );
}
