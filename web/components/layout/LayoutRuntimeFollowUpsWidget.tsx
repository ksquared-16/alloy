"use client";

import LayoutRuntimeTasksWidget from "@/components/layout/LayoutRuntimeTasksWidget";
import { mapLayoutRuntimeTasksFromVm } from "@/lib/layout/runtime/mapLayoutRuntimeTasksFromVm";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    record: ProofRuntimeRecord;
    title?: string;
    compact?: boolean;
    chromeless?: boolean;
};

/** Residual manual / Task Assist tasks — stage work filtered out upstream. */
export default function LayoutRuntimeFollowUpsWidget({
    record,
    title = "Follow-ups",
    compact = false,
    chromeless = false,
}: Props) {
    const followUps = mapLayoutRuntimeTasksFromVm(record as Record<string, unknown>);
    if (!followUps.length) return null;

    return (
        <LayoutRuntimeTasksWidget
            record={record}
            title={title}
            compact={compact}
            chromeless={chromeless}
            emptyMessage="No follow-ups"
        />
    );
}
