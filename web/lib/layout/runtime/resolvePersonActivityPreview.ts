/**
 * Person activity preview — relationship workspace timeline from VM/layout-record fields.
 *
 * Person-specific resolver (not Lead). Sources: notes, communication, tasks,
 * activity signal, created/updated metadata. Does not invent events.
 */

import type { InquirySummaryTaskPreviewRow } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { formatLayoutRuntimeOperatorDate } from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type PersonActivityPreviewKind = "note" | "communication" | "task" | "activity" | "created" | "updated";

export type PersonActivityPreviewEntry = {
    kind: PersonActivityPreviewKind;
    label: string;
    detail: string | null;
    at: string | null;
};

const MAX_ENTRIES = 5;

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

function truncate(text: string, max = 100): string {
    const trimmed = text.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 1).trim()}…`;
}

function formatAt(raw: unknown): string | null {
    const text = pickLine(raw);
    if (!text) return null;
    return formatLayoutRuntimeOperatorDate(text) || text;
}

function readOpenTasks(record: ProofRuntimeRecord): InquirySummaryTaskPreviewRow[] {
    const overview = overviewRecord(record);
    const payload = record._inquiry_summary_tasks ?? overview._inquiry_summary_tasks ?? record._tasks_preview;
    if (!payload || typeof payload !== "object") return [];
    const open = (payload as { open_tasks?: unknown }).open_tasks;
    return Array.isArray(open) ? (open as InquirySummaryTaskPreviewRow[]) : [];
}

function pushUnique(entries: PersonActivityPreviewEntry[], entry: PersonActivityPreviewEntry): void {
    if (entries.length >= MAX_ENTRIES) return;
    const key = `${entry.kind}:${entry.label}:${entry.detail ?? ""}`;
    if (entries.some((e) => `${e.kind}:${e.label}:${e.detail ?? ""}` === key)) return;
    entries.push(entry);
}

/** Build person activity preview entries from available record fields. */
export function resolvePersonActivityPreview(record: ProofRuntimeRecord): PersonActivityPreviewEntry[] {
    const overview = overviewRecord(record);
    const entries: PersonActivityPreviewEntry[] = [];

    const rawNotes = record.notes ?? overview.notes ?? record.follow_up_notes ?? overview.follow_up_notes;
    if (Array.isArray(rawNotes) && rawNotes.length > 0) {
        const note = rawNotes[0] as Record<string, unknown>;
        const body = pickLine(note.body, note.text, note.content, note.label, note.title);
        if (body) {
            pushUnique(entries, {
                kind: "note",
                label: pickLine(note.title, note.label) ?? "Note",
                detail: truncate(body),
                at: formatAt(note.created_at ?? note.at),
            });
        }
    } else {
        const noteLine = pickLine(record.follow_up_notes, overview.follow_up_notes);
        if (noteLine) {
            pushUnique(entries, {
                kind: "note",
                label: "Note",
                detail: truncate(noteLine),
                at: null,
            });
        }
    }

    const rawComm = record.recent_communication ?? overview.recent_communication;
    if (Array.isArray(rawComm) && rawComm.length > 0) {
        const item = rawComm[0] as Record<string, unknown>;
        const primary = pickLine(item.body, item.subject, item.label, item.title);
        if (primary) {
            pushUnique(entries, {
                kind: "communication",
                label: pickLine(item.channel, item.type) ?? "Communication",
                detail: truncate(primary),
                at: formatAt(item.at ?? item.when ?? item.sent_at ?? item.created_at),
            });
        }
    }

    const openTasks = readOpenTasks(record);
    if (openTasks.length > 0) {
        const task = openTasks[0]!;
        pushUnique(entries, {
            kind: "task",
            label: "Open task",
            detail: truncate(task.title ?? "Task"),
            at: formatAt(task.due_at),
        });
    }

    const activitySummary = pickLine(
        record.last_activity_summary,
        overview.last_activity_summary,
        record._last_activity,
    );
    const activityAt = pickLine(record.last_activity_at, overview.last_activity_at);
    if (activitySummary || activityAt) {
        pushUnique(entries, {
            kind: "activity",
            label: "Last activity",
            detail: activitySummary ? truncate(activitySummary) : null,
            at: formatAt(activityAt),
        });
    }

    const createdRaw = pickLine(record.created_at, overview.created_at);
    if (createdRaw) {
        pushUnique(entries, {
            kind: "created",
            label: "Created",
            detail: null,
            at: formatAt(createdRaw),
        });
    }

    const updatedRaw = pickLine(record.updated_at, overview.updated_at);
    if (updatedRaw && updatedRaw !== createdRaw) {
        pushUnique(entries, {
            kind: "updated",
            label: "Updated",
            detail: null,
            at: formatAt(updatedRaw),
        });
    }

    return entries.slice(0, MAX_ENTRIES);
}
