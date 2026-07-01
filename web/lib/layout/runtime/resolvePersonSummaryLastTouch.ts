/**
 * Person summary strip — Last Touch card (layout widget key: last_touch).
 */

import { formatLayoutRuntimeOperatorDate } from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type PersonSummaryLastTouchKind = "note" | "communication" | "activity" | "empty";

export type PersonSummaryLastTouchResolution = {
    kind: PersonSummaryLastTouchKind;
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

function resolveNoteTouch(record: ProofRuntimeRecord): PersonSummaryLastTouchResolution | null {
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

function resolveCommunicationTouch(record: ProofRuntimeRecord): PersonSummaryLastTouchResolution | null {
    const overview = overviewRecord(record);
    const rawComm = record.recent_communication ?? overview.recent_communication;
    if (!Array.isArray(rawComm) || rawComm.length === 0) return null;
    const item = rawComm[0] as Record<string, unknown>;
    const primary = pickLine(item.body, item.subject, item.label, item.title);
    if (!primary) return null;
    const at = pickLine(item.at, item.when, item.sent_at, item.created_at);
    return {
        kind: "communication",
        title: "Last Touch",
        primaryLine: truncateLine(primary),
        secondaryLine: at ? formatLayoutRuntimeOperatorDate(at) || at : "Recent communication",
        emptyHint: null,
    };
}

function resolveActivityTouch(record: ProofRuntimeRecord): PersonSummaryLastTouchResolution | null {
    const overview = overviewRecord(record);
    const summary = pickLine(record.last_activity_summary, overview.last_activity_summary, record._last_activity);
    const at = pickLine(record.last_activity_at, overview.last_activity_at);
    if (!summary && !at) return null;
    return {
        kind: "activity",
        title: "Last Touch",
        primaryLine: summary ? truncateLine(summary) : null,
        secondaryLine: at ? formatLayoutRuntimeOperatorDate(at) || at : "Recent activity",
        emptyHint: null,
    };
}

/** Resolve person last-touch summary — note → comm → activity; never tasks. */
export function resolvePersonSummaryLastTouch(record: ProofRuntimeRecord): PersonSummaryLastTouchResolution {
    return (
        resolveNoteTouch(record)
        ?? resolveCommunicationTouch(record)
        ?? resolveActivityTouch(record)
        ?? {
            kind: "empty",
            title: "Last Touch",
            primaryLine: null,
            secondaryLine: null,
            emptyHint: "No recent note or touch. Log a note or send a message.",
        }
    );
}
