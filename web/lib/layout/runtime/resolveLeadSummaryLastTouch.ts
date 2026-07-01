/**
 * Lead summary strip — Last Touch card (layout widget key: tour_summary).
 *
 * Shows recent note or communication touch — never duplicates Tasks card content.
 */

import { formatLayoutRuntimeOperatorDate } from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LeadSummaryLastTouchKind = "note" | "communication" | "activity" | "empty";

export type LeadSummaryLastTouchResolution = {
    kind: LeadSummaryLastTouchKind;
    title: string;
    primaryLine: string | null;
    secondaryLine: string | null;
    emptyHint: string | null;
};

function overviewRecord(record: ProofRuntimeRecord): Record<string, unknown> {
    const raw = record._overview_data;
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : record;
}

function pickLine(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

function truncateLine(text: string, max = 120): string {
    const trimmed = text.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 1).trim()}…`;
}

function resolveNoteTouch(record: ProofRuntimeRecord): LeadSummaryLastTouchResolution | null {
    const overview = overviewRecord(record);
    const followUp = pickLine(record.follow_up_notes, overview.follow_up_notes);
    if (followUp) {
        return {
            kind: "note",
            title: "Last Touch",
            primaryLine: truncateLine(followUp),
            secondaryLine: "Most recent note",
            emptyHint: null,
        };
    }

    const rawNotes = record.notes ?? overview.notes;
    if (Array.isArray(rawNotes) && rawNotes.length > 0) {
        const note = rawNotes[0] as Record<string, unknown>;
        const body = pickLine(note.body, note.text, note.content, note.label, note.title);
        if (body) {
            return {
                kind: "note",
                title: "Last Touch",
                primaryLine: truncateLine(body),
                secondaryLine: pickLine(note.title, note.label) ?? "Most recent note",
                emptyHint: null,
            };
        }
    }

    return null;
}

function resolveCommunicationTouch(record: ProofRuntimeRecord): LeadSummaryLastTouchResolution | null {
    const overview = overviewRecord(record);
    const rawComm = record.recent_communication ?? overview.recent_communication;
    if (Array.isArray(rawComm) && rawComm.length > 0) {
        const item = rawComm[0] as Record<string, unknown>;
        const primary = pickLine(item.body, item.subject, item.label, item.title);
        const whenRaw = pickLine(item.at, item.when, item.sent_at, item.created_at);
        const when = whenRaw ? formatLayoutRuntimeOperatorDate(whenRaw) || whenRaw : null;
        if (primary) {
            return {
                kind: "communication",
                title: "Last Touch",
                primaryLine: truncateLine(primary),
                secondaryLine: when ? `Last communication · ${when}` : "Last communication",
                emptyHint: null,
            };
        }
    }

    return null;
}

function resolveActivityTouch(record: ProofRuntimeRecord): LeadSummaryLastTouchResolution | null {
    const overview = overviewRecord(record);
    const summary = pickLine(
        record.last_activity_summary,
        overview.last_activity_summary,
        record._last_activity,
    );
    const atRaw = pickLine(record.last_activity_at, overview.last_activity_at);
    const at = atRaw ? formatLayoutRuntimeOperatorDate(atRaw) || atRaw : null;
    if (summary || at) {
        return {
            kind: "activity",
            title: "Last Touch",
            primaryLine: summary ? truncateLine(summary) : "Recent activity",
            secondaryLine: at ? `Last touch · ${at}` : null,
            emptyHint: null,
        };
    }
    return null;
}

/** Resolve Last Touch card — note → communication → activity; never open tasks. */
export function resolveLeadSummaryLastTouch(record: ProofRuntimeRecord): LeadSummaryLastTouchResolution {
    return (
        resolveNoteTouch(record)
        ?? resolveCommunicationTouch(record)
        ?? resolveActivityTouch(record)
        ?? {
            kind: "empty",
            title: "Last Touch",
            primaryLine: "No recent notes or events",
            secondaryLine: null,
            emptyHint: "Log a note or send a message",
        }
    );
}
