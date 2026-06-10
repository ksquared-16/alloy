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

/** Structured enrollment metadata — birth line + labeled detail segments. */
export default function LeadEnrollmentCardMetaLines({ row, metaColumns }: Props) {
    const { birthLine, segments } = buildLeadEnrollmentCardMetaPresentation(row, metaColumns);
    if (!birthLine && segments.length === 0) return null;

    return (
        <div className="mt-1 space-y-1" data-lead-enrollment-card-meta-lines="true">
            {birthLine ?
                <p className={PRESENTATION_SUPPORTING}>{birthLine}</p>
            :   null}
            {segments.length > 0 ?
                <p className="flex flex-wrap items-center gap-y-0.5 leading-snug">
                    {segments.map((segment, index) => (
                        <span key={segment.refKey} className="inline-flex max-w-full items-center">
                            {index > 0 ? <SegmentSeparator /> : null}
                            {segment.isPlaceholder ?
                                <span className={`inline-flex items-baseline gap-1 ${PRESENTATION_LABEL_INLINE}`}>
                                    <span>{segment.label}</span>
                                    <span className={PRESENTATION_VALUE_PLACEHOLDER}>—</span>
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
                </p>
            :   null}
        </div>
    );
}
