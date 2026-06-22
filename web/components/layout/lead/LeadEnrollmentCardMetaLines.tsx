"use client";

import LayoutRuntimeInlineEditFieldControl from "@/components/layout/LayoutRuntimeInlineEditFieldControl";
import { useLayoutRuntimeDrawerEdit } from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";
import {
    buildLeadEnrollmentCardMetaPresentation,
    formatLayoutRuntimeRepeaterColumnDisplay,
} from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { layoutRuntimeCollectionColumnIsInlineEditable } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import { layoutRuntimeEnrollmentPlacementDependentValueReader } from "@/lib/layout/runtime/resolveLayoutRuntimeEnrollmentPlacementContext";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_LABEL_INLINE,
    PRESENTATION_SUPPORTING,
    PRESENTATION_VALUE_PLACEHOLDER,
} from "@/lib/presentation/presentationTypography";

type Props = {
    row: ProofRuntimeRecord;
    metaColumns: LayoutCollectionColumn[];
    editing?: boolean;
    rowKey?: string;
    anchorRecord?: ProofRuntimeRecord;
};

function SegmentSeparator() {
    return <span className="px-0.5 text-alloy-midnight/22" aria-hidden>·</span>;
}

function MetaInlineField({
    row,
    col,
    rowKey,
    anchorRecord,
}: {
    row: ProofRuntimeRecord;
    col: LayoutCollectionColumn;
    rowKey: string;
    anchorRecord?: ProofRuntimeRecord;
}) {
    const edit = useLayoutRuntimeDrawerEdit();
    if (!edit) return null;
    return (
        <LayoutRuntimeInlineEditFieldControl
            refKey={col.refKey}
            value={edit.getFieldValue(
                col.refKey,
                formatLayoutRuntimeRepeaterColumnDisplay(row, col, { anchorRecord }),
                rowKey,
            )}
            rowKey={rowKey}
            onChange={(v) => edit.setFieldValue(col.refKey, v, rowKey)}
            getDependentValue={layoutRuntimeEnrollmentPlacementDependentValueReader(
                row,
                anchorRecord ?? row,
                edit.getFieldValue,
                rowKey,
            )}
        />
    );
}

function columnMatchesRefKey(refKey: string, needles: string[]): boolean {
    const normalized = refKey.toLowerCase();
    return needles.some((needle) => normalized.includes(needle));
}

/** Structured enrollment card metadata for two-line drawer presentation. */
export default function LeadEnrollmentCardMetaLines({
    row,
    metaColumns,
    editing = false,
    rowKey,
    anchorRecord,
}: Props) {
    const { birthLine, startLocationLine, segments } = buildLeadEnrollmentCardMetaPresentation(row, metaColumns);
    const dobColumn = metaColumns.find((col) => columnMatchesRefKey(col.refKey, ["dob", "dob_age", "date_of_birth"]));
    const startColumn = metaColumns.find((col) =>
        columnMatchesRefKey(col.refKey, ["desired_start", "start_date"]),
    );
    const locationColumn = metaColumns.find((col) => columnMatchesRefKey(col.refKey, ["location"]));
    const detailColumns = metaColumns.filter(
        (col) => col !== dobColumn && col !== startColumn && col !== locationColumn,
    );

    const canEditColumn = (col: LayoutCollectionColumn) =>
        editing
        && Boolean(rowKey)
        && layoutRuntimeCollectionColumnIsInlineEditable(col, "production");

    if (!editing && !birthLine && !startLocationLine && segments.length === 0) return null;

    if (editing && rowKey) {
        const editBirthLine =
            dobColumn && canEditColumn(dobColumn) ?
                <span className={`inline-flex items-baseline gap-1 ${PRESENTATION_LABEL_INLINE}`}>
                    <span>{dobColumn.label ?? "DOB"}</span>
                    <MetaInlineField row={row} col={dobColumn} rowKey={rowKey} anchorRecord={anchorRecord} />
                </span>
            : birthLine ?
                <span className={PRESENTATION_SUPPORTING}>{birthLine}</span>
            :   null;

        const startDisplay =
            startColumn ?
                canEditColumn(startColumn) ?
                    <span className={`inline-flex items-baseline gap-1 ${PRESENTATION_LABEL_INLINE}`}>
                        <span>{startColumn.label ?? "Start Date"}</span>
                        <MetaInlineField row={row} col={startColumn} rowKey={rowKey} anchorRecord={anchorRecord} />
                    </span>
                :   formatLayoutRuntimeRepeaterColumnDisplay(row, startColumn, { anchorRecord })
            :   null;
        const locationDisplay =
            locationColumn ?
                canEditColumn(locationColumn) ?
                    <span className={`inline-flex items-baseline gap-1 ${PRESENTATION_LABEL_INLINE}`}>
                        <span>{locationColumn.label ?? "School"}</span>
                        <MetaInlineField row={row} col={locationColumn} rowKey={rowKey} anchorRecord={anchorRecord} />
                    </span>
                :   formatLayoutRuntimeRepeaterColumnDisplay(row, locationColumn, { anchorRecord })
            :   null;
        const startLocationParts = [startDisplay, locationDisplay].filter(
            (part) => part && part !== "—",
        );
        const editStartLocationLine =
            startLocationParts.length > 0 ?
                <span className={`inline-flex flex-wrap items-center gap-x-1 ${PRESENTATION_SUPPORTING}`}>
                    {startLocationParts.map((part, index) => (
                        <span key={index} className="inline-flex items-center">
                            {index > 0 ? <SegmentSeparator /> : null}
                            {part}
                        </span>
                    ))}
                </span>
            :   null;

        return (
            <div className="mt-1.5 space-y-0.5" data-lead-enrollment-card-meta-lines="true" data-enrollment-meta-editing="true">
                {editBirthLine ?
                    <p className={PRESENTATION_SUPPORTING} data-lead-enrollment-card-birth-line="true">
                        {editBirthLine}
                    </p>
                :   null}
                {editStartLocationLine ?
                    <p className={PRESENTATION_SUPPORTING} data-lead-enrollment-card-start-location-line="true">
                        {editStartLocationLine}
                    </p>
                :   null}
                {detailColumns.length > 0 ?
                    <div
                        className="flex flex-wrap items-center gap-y-0.5 leading-snug"
                        data-lead-enrollment-card-detail-line="true"
                    >
                        {detailColumns.map((col, index) => (
                            <span key={col.refKey} className="inline-flex max-w-full items-center gap-1">
                                {index > 0 ? <SegmentSeparator /> : null}
                                <span className={PRESENTATION_LABEL_INLINE}>{col.label}</span>
                                {canEditColumn(col) ?
                                    <MetaInlineField row={row} col={col} rowKey={rowKey} anchorRecord={anchorRecord} />
                                :   <span className={PRESENTATION_DATA_VALUE_COMPACT}>
                                        {formatLayoutRuntimeRepeaterColumnDisplay(row, col, { anchorRecord })}
                                    </span>
                                }
                            </span>
                        ))}
                    </div>
                :   null}
            </div>
        );
    }

    return (
        <div className="mt-1.5 space-y-0.5" data-lead-enrollment-card-meta-lines="true">
            {birthLine ?
                <p className={PRESENTATION_SUPPORTING} data-lead-enrollment-card-birth-line="true">
                    {birthLine}
                </p>
            :   null}
            {startLocationLine ?
                <p className={PRESENTATION_SUPPORTING} data-lead-enrollment-card-start-location-line="true">
                    {startLocationLine}
                </p>
            :   null}
            {segments.length > 0 ?
                <div
                    className="flex flex-wrap items-center gap-y-0.5 leading-snug"
                    data-lead-enrollment-card-detail-line="true"
                >
                    {segments.map((segment, index) => (
                        <span key={segment.refKey} className="inline-flex max-w-full items-center">
                            {index > 0 ? <SegmentSeparator /> : null}
                            {segment.isPlaceholder ?
                                <span className={`inline-flex items-baseline gap-1 ${PRESENTATION_LABEL_INLINE}`}>
                                    <span>{segment.label}</span>
                                    <span className={PRESENTATION_VALUE_PLACEHOLDER}>—</span>
                                </span>
                            :   segment.refKey.toLowerCase().includes("status") ?
                                <span className="inline-flex items-center rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/90">
                                    {segment.display}
                                </span>
                            :   <span className={`inline-flex items-baseline gap-1 ${PRESENTATION_DATA_VALUE_COMPACT}`}>
                                    {segment.prefixLabel ?
                                        <span className={PRESENTATION_LABEL_INLINE}>{segment.prefixLabel}</span>
                                    :   null}
                                    <span>{segment.display}</span>
                                </span>
                            }
                        </span>
                    ))}
                </div>
            :   null}
        </div>
    );
}
