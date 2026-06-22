/**
 * Lead activity preview — graceful timeline from VM/layout-record fields only.
 *
 * Does not invent events. Sources: notes, communication, tasks, activity signal,
 * created/updated metadata.
 */

import type { InquirySummaryTaskPreviewRow } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { formatActivityTimestamp } from "@/lib/presentation/presentationDateFormat";
import { formatLayoutRuntimeStatusLabel } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LeadActivityPreviewKind = "note" | "communication" | "task" | "activity" | "created" | "updated";

export type LeadActivityPreviewEntry = {
    kind: LeadActivityPreviewKind;
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
    return formatActivityTimestamp(text) || text;
}

function readOpenTasks(record: ProofRuntimeRecord): InquirySummaryTaskPreviewRow[] {
    const overview = overviewRecord(record);
    const payload = record._inquiry_summary_tasks ?? overview._inquiry_summary_tasks;
    if (!payload || typeof payload !== "object") return [];
    const open = (payload as { open_tasks?: unknown }).open_tasks;
    return Array.isArray(open) ? (open as InquirySummaryTaskPreviewRow[]) : [];
}

function formatLifecyclePreviewDetail(text: string): string {
    const prefix = "Family status: ";
    if (!text.startsWith(prefix)) {
        return formatLayoutRuntimeStatusLabel(text, {
            refKey: "inquiry_child.outcome_status_key",
            renderHint: "status",
        }) ?? text;
    }
    const tail = text.slice(prefix.length).trim();
    const resolved = formatLayoutRuntimeStatusLabel(tail, {
        refKey: "inquiry_child.outcome_status_key",
        renderHint: "status",
    });
    return resolved && resolved !== tail ? `${prefix}${resolved}` : text;
}

function formatStatusPreviewDetail(text: string): string {
    return (
        formatLayoutRuntimeStatusLabel(text, {
            refKey: "opportunity.status_key",
            renderHint: "status",
        }) ?? text
    );
}

function pushUnique(entries: LeadActivityPreviewEntry[], entry: LeadActivityPreviewEntry): void {
    if (entries.length >= MAX_ENTRIES) return;
    const key = `${entry.kind}:${entry.label}:${entry.detail ?? ""}`;
    if (entries.some((e) => `${e.kind}:${e.label}:${e.detail ?? ""}` === key)) return;
    entries.push(entry);
}

/** Build activity preview entries from available record fields (newest-first heuristic). */
export function resolveLeadActivityPreview(record: ProofRuntimeRecord): LeadActivityPreviewEntry[] {
    const overview = overviewRecord(record);
    const entries: LeadActivityPreviewEntry[] = [];

    const followUp = pickLine(record.follow_up_notes, overview.follow_up_notes);
    if (followUp) {
        pushUnique(entries, {
            kind: "note",
            label: "Note",
            detail: truncate(followUp),
            at: null,
        });
    }

    const rawNotes = record.notes ?? overview.notes;
    if (Array.isArray(rawNotes) && rawNotes.length > 0 && !followUp) {
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

    const activitySignal =
        record._activity_signal && typeof record._activity_signal === "object"
            ? (record._activity_signal as Record<string, unknown>)
            : null;
    const activitySummary = pickLine(
        record.last_activity_summary,
        overview.last_activity_summary,
        activitySignal?.last_activity_summary,
    );
    const activityAt = pickLine(
        record.last_activity_at,
        overview.last_activity_at,
        activitySignal?.last_activity_at,
    );
    if (activitySummary || activityAt) {
        pushUnique(entries, {
            kind: "activity",
            label: "Last activity",
            detail: activitySummary ? truncate(activitySummary) : null,
            at: formatAt(activityAt),
        });
    }

    const lifecycleRaw = record._child_lifecycle_summary ?? overview._child_lifecycle_summary;
    const lifecycleDisplay = pickLine(
        record._child_lifecycle_summary_display,
        overview._child_lifecycle_summary_display,
        lifecycleRaw && typeof lifecycleRaw === "object"
            ? (lifecycleRaw as Record<string, unknown>).display_summary
            : null,
        lifecycleRaw && typeof lifecycleRaw === "object"
            ? (lifecycleRaw as Record<string, unknown>).headline_label
            : null,
    );
    if (lifecycleDisplay) {
        pushUnique(entries, {
            kind: "activity",
            label: "Lifecycle",
            detail: truncate(formatLifecyclePreviewDetail(lifecycleDisplay)),
            at: null,
        });
    }

    const statusLabelRaw = pickLine(record._status_display, overview._status_display, record["opportunity.status_label"]);
    const statusAt = pickLine(record.updated_at, overview.updated_at);
    if (statusLabelRaw && statusAt) {
        pushUnique(entries, {
            kind: "activity",
            label: "Status",
            detail: truncate(formatStatusPreviewDetail(statusLabelRaw)),
            at: formatAt(statusAt),
        });
    }

    const createdRaw = pickLine(record.created_at, overview.created_at, record["opportunity.created_at"]);
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
