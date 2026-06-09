/**
 * Lead overview section content predicates — VM/layout-record derived, not hardcoded labels.
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { resolveLeadActivityPreview } from "@/lib/layout/runtime/resolveLeadActivityPreview";

function trimOrEmpty(value: unknown): string {
    if (value == null) return "";
    return String(value).trim();
}

function fieldHasValue(record: ProofRuntimeRecord, ...keys: string[]): boolean {
    for (const key of keys) {
        const text = trimOrEmpty(record[key]);
        if (text && text !== "—") return true;
    }
    return false;
}

/** Notes / recent communication section has operator-visible content. */
export function leadNotesCommunicationSectionHasVisibleContent(record: ProofRuntimeRecord): boolean {
    const comm = record.recent_communication;
    if (Array.isArray(comm) && comm.length > 0) return true;

    const notes = record.follow_up_notes ?? record.notes;
    if (Array.isArray(notes) && notes.length > 0) return true;
    if (typeof notes === "string" && notes.trim().length > 0) return true;

    const reminders = record.reminders;
    if (Array.isArray(reminders) && reminders.length > 0) return true;

    return false;
}

/** Activity section has preview entries from real record fields. */
export function leadActivitySectionHasVisibleContent(record: ProofRuntimeRecord): boolean {
    return resolveLeadActivityPreview(record).length > 0;
}

/** Lead source section has at least one configured source field populated. */
export function leadLeadSourceSectionHasVisibleContent(record: ProofRuntimeRecord): boolean {
    return (
        fieldHasValue(record, "opportunity.source", "source")
        || fieldHasValue(record, "opportunity.channel", "channel")
        || fieldHasValue(record, "opportunity.campaign", "campaign")
    );
}
