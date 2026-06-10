"use client";

import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";
import {
    buildLeadEnrollmentCardMetaPresentation,
} from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
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
};

function SegmentSeparator() {
    return <span className="px-0.5 text-alloy-midnight/22" aria-hidden>·</span>;
}

/** Structured enrollment card metadata for two-line drawer presentation. */
export default function LeadEnrollmentCardMetaLines({ row, metaColumns }: Props) {
    const { birthLine, startLocationLine, segments } = buildLeadEnrollmentCardMetaPresentation(row, metaColumns);
    if (!birthLine && !startLocationLine && segments.length === 0) return null;

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
