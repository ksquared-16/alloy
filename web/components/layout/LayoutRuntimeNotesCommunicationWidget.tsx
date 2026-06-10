"use client";

import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import { formatLayoutRuntimeOperatorDate } from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_LABEL,
    PRESENTATION_SUPPORTING,
} from "@/lib/presentation/presentationTypography";

function pickLine(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

function truncate(text: string, max = 120): string {
    const trimmed = text.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 1).trim()}…`;
}

/** True when the notes widget would render content. */
export function layoutRuntimeNotesWidgetHasContent(record: ProofRuntimeRecord): boolean {
    const overview =
        record._overview_data && typeof record._overview_data === "object"
            ? (record._overview_data as Record<string, unknown>)
            : record;
    if (pickLine(record.follow_up_notes, overview.follow_up_notes)) return true;
    const rawNotes = record.notes ?? overview.notes;
    if (Array.isArray(rawNotes) && rawNotes.length > 0) return true;
    return false;
}

/** True when the recent communication widget would render content. */
export function layoutRuntimeCommunicationWidgetHasContent(record: ProofRuntimeRecord): boolean {
    const overview =
        record._overview_data && typeof record._overview_data === "object"
            ? (record._overview_data as Record<string, unknown>)
            : record;
    const rawComm = record.recent_communication ?? overview.recent_communication;
    return Array.isArray(rawComm) && rawComm.length > 0;
}

type Props = {
    record: ProofRuntimeRecord;
    widgetKey: "notes" | "recent_communication";
    showEmptyState?: boolean;
};

/** Layout-owned notes / communication widgets — premium empty state when configured. */
export default function LayoutRuntimeNotesCommunicationWidget({ record, widgetKey, showEmptyState = false }: Props) {
    const overview =
        record._overview_data && typeof record._overview_data === "object"
            ? (record._overview_data as Record<string, unknown>)
            : record;

    if (widgetKey === "notes") {
        const followUp = pickLine(record.follow_up_notes, overview.follow_up_notes);
        const rawNotes = record.notes ?? overview.notes;
        const noteLines: { title: string; body: string; at: string | null }[] = [];

        if (followUp) {
            noteLines.push({ title: "Follow-up note", body: truncate(followUp), at: null });
        } else if (Array.isArray(rawNotes)) {
            for (const raw of rawNotes.slice(0, 3)) {
                if (!raw || typeof raw !== "object") continue;
                const note = raw as Record<string, unknown>;
                const body = pickLine(note.body, note.text, note.content, note.label, note.title);
                if (!body) continue;
                noteLines.push({
                    title: pickLine(note.title, note.label) ?? "Note",
                    body: truncate(body),
                    at: formatLayoutRuntimeOperatorDate(pickLine(note.created_at, note.at) ?? "") || null,
                });
            }
        }

        if (noteLines.length === 0) {
            if (!showEmptyState) return null;
            return (
                <DrawerOverviewEmptyState
                    message="No notes yet"
                    hint="Follow-up notes and internal context will appear here."
                    compact
                />
            );
        }

        return (
            <ul className="flex flex-col gap-2" data-layout-runtime-notes-widget="true">
                {noteLines.map((line, index) => (
                    <li key={index} className="rounded-md border border-alloy-stone/10 bg-white px-2.5 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className={PRESENTATION_LABEL}>
                                {line.title}
                            </span>
                            {line.at ?
                                <span className={`shrink-0 ${PRESENTATION_SUPPORTING}`}>{line.at}</span>
                            :   null}
                        </div>
                        <p className="mt-0.5 line-clamp-3 text-[11px] font-medium leading-snug text-alloy-midnight/82">{line.body}</p>
                    </li>
                ))}
            </ul>
        );
    }

    const rawComm = record.recent_communication ?? overview.recent_communication;
    if (!Array.isArray(rawComm) || rawComm.length === 0) {
        if (!showEmptyState) return null;
        return (
            <DrawerOverviewEmptyState
                message="No recent communication"
                hint="Messages and outreach will appear here."
                compact
            />
        );
    }

    return (
        <ul className="flex flex-col gap-2" data-layout-runtime-communication-widget="true">
            {rawComm.slice(0, 3).map((raw, index) => {
                if (!raw || typeof raw !== "object") return null;
                const item = raw as Record<string, unknown>;
                const primary = pickLine(item.body, item.subject, item.label, item.title);
                if (!primary) return null;
                const at =
                    formatLayoutRuntimeOperatorDate(
                        pickLine(item.at, item.when, item.sent_at, item.created_at) ?? "",
                    ) || null;
                return (
                    <li key={index} className="rounded-md border border-alloy-stone/10 bg-white px-2.5 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                {pickLine(item.channel, item.type) ?? "Communication"}
                            </span>
                            {at ?
                                <span className="shrink-0 text-[10px] text-alloy-midnight/40">{at}</span>
                            :   null}
                        </div>
                        <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-alloy-midnight/75">
                            {truncate(primary)}
                        </p>
                    </li>
                );
            })}
        </ul>
    );
}
