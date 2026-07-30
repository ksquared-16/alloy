"use client";

/**
 * POS-FP3/FP-W/FP6 — operational Processing queue (controlled).
 *
 * LEFT column of the converged Processing modal and the standalone page. Consumes
 * the FP2-backed `/api/admin/processing/queue` endpoint. FP6 upgrades the flat list
 * to a Communications-V2-style operational queue: grouped by state, rich rows
 * (source title + on-ramp kind + age + status), Pine selection accent, and
 * intentional empty / loading / error states. Read-only; selection is controlled.
 */

import { useEffect, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import type { ProcessingCaseQueueRow, ProcessingCaseStatus } from "@/lib/pos/processingCase/readModel/types";
import RecommendationBadge from "@/app/adminV2/pos/RecommendationBadge";
import ProcessingConfirmDialog from "@/app/adminV2/pos/ProcessingConfirmDialog";
import ProcessingRenameDocumentDialog from "@/app/adminV2/pos/ProcessingRenameDocumentDialog";
import { useProcessingQueueWarm } from "@/lib/pos/useProcessingQueueWarm";
import { prefetchProcessingCase, prefetchProcessingCases } from "@/lib/pos/processingCasePrefetch";
import { useProcessingFolders } from "@/lib/pos/useProcessingFolders";
import { caseMatchesCategoryFolder } from "@/lib/pos/processingFolderConfig";
import { ProcessingFolderIcon } from "@/lib/pos/processingFolderIcons";
import { PROCESSING_EMPTY, PROCESSING_QUEUE_METADATA, PROCESSING_QUEUE_ROW_TITLE } from "@/lib/pos/processingPresentationTokens";
import {
    QUEUE_ROW_CARD_IDLE_BORDER_CLASS,
    QUEUE_ROW_CARD_SELECTED_BORDER_CLASS,
    QUEUE_ROW_CARD_SHELL_CLASS,
} from "@/lib/presentation/runtime/queueRowCardShell";
import { WS_ICON_ATTENTION, WS_ICON_INTERACTIVE, WS_ICON_STRUCTURAL, WS_TEXT_MUTED, WS_TEXT_PRIMARY, WS_TEXT_SECONDARY } from "@/components/workspace/workspaceTokens";

/**
 * Display order: operator-actionable lanes first; completed/archived are secondary.
 *
 * Scope B (future, not built here): Incoming will gain an OUTER grouping dimension —
 * categories like Enrollment · Subsidy · Licensing · Imports, and deeper trees
 * (e.g. Subsidy → State → AZ → School 201). The current status lanes would nest under
 * the selected category. Keep this lane rendering category-agnostic so a grouped queue
 * can wrap it later; do NOT hardcode a fake category tree until the data model exists.
 */
/**
 * Work queue lanes — operator-actionable groupings for Processing Work mode.
 */
type WorkLaneKey = "needs_review" | "ready_generate" | "ready_publish" | "completed";

const WORK_LANES: { key: WorkLaneKey; label: string }[] = [
    { key: "needs_review", label: "Needs review" },
    { key: "ready_generate", label: "Ready to generate" },
    { key: "ready_publish", label: "Ready to publish" },
    { key: "completed", label: "Completed" },
];

function deriveWorkLane(row: ProcessingCaseQueueRow): WorkLaneKey {
    if (row.status === "completed" || row.status === "archived") return "completed";
    if (row.formDraftSummary?.generatedFormId) return "ready_publish";
    if (row.status === "ready") return "ready_generate";
    return "needs_review";
}

/** @deprecated legacy status lanes — kept for non-folder queue views */
const PRIMARY_LANES: { key: ProcessingCaseStatus; label: string }[] = [
    { key: "needs_review", label: "Needs review" },
    { key: "ready", label: "Ready to generate" },
    { key: "received", label: "Received" },
    { key: "processing", label: "Processing" },
];
const SECONDARY_LANES: { key: ProcessingCaseStatus; label: string }[] = [
    { key: "completed", label: "Completed" },
    { key: "archived", label: "Archived" },
];

/**
 * Scope C2 — Incoming folder/category rail.
 *
 * Folders are DERIVED from the on-ramp kind already on each loaded row — no new schema,
 * no fabricated categories, counts reflect loaded rows only. This is the UI foundation
 * for grouped processing: the folder is a filter layer that wraps the status lanes.
 *
 * The richer category tree the product wants (Enrollment · Subsidy · Licensing, and
 * deeper trees like Subsidy → State → AZ → School 201) is intentionally NOT hardcoded
 * here — when category metadata exists, swap `deriveFolder` for a category resolver and
 * this same rail/header renders the deeper hierarchy. `all` is always the queue root.
 */
type ProcessingFolderKey = string;

/** Lane accent for the eyebrow — quiet, semantic, no rainbow. */
const LANE_TONE: Record<string, string> = {
    needs_resolution: "text-alloy-midnight/55",
    needs_review: "text-alloy-midnight/55",
    ready: "text-alloy-bend-pine",
    received: "text-alloy-midnight/40",
    processing: "text-alloy-midnight/40",
    completed: "text-alloy-midnight/35",
    archived: "text-alloy-midnight/35",
};

// Queue rows use the SAME shell as every other queue surface (work-unit queue, configuration rails),
// so a change to the house card treatment reaches Processing too instead of this rail drifting on
// its own flat divider list.
//
// No local border colour: the perimeter and elevation belong to `.alloy-os-queue-row-card`, which
// reuses the Focus Panel card tokens. Overriding it here is precisely how this surface would end up
// looking "slightly different" from /work-unit again. Only the padding is tightened, because this
// rail is far narrower than the work-unit queue panel.
const QUEUE_ROW_CLASS = `${QUEUE_ROW_CARD_SHELL_CLASS} !px-2 !py-1.5 transition-colors ${QUEUE_ROW_CARD_IDLE_BORDER_CLASS}`;
const QUEUE_ROW_SELECTED_CLASS = QUEUE_ROW_CARD_SELECTED_BORDER_CLASS;

function formatAge(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type QueueDisplayRow = ProcessingCaseQueueRow & { duplicateCount?: number };

function collapseDuplicateDocumentRows(rows: ProcessingCaseQueueRow[]): QueueDisplayRow[] {
    const seen = new Map<string, QueueDisplayRow>();
    const out: QueueDisplayRow[] = [];
    for (const row of rows) {
        if (row.primarySource?.kind !== "document") {
            out.push(row);
            continue;
        }
        const title = (row.sourceDisplay?.label ?? "").trim().toLowerCase();
        const key = title || row.id;
        const existing = seen.get(key);
        if (existing) {
            existing.duplicateCount = (existing.duplicateCount ?? 1) + 1;
            continue;
        }
        const next: QueueDisplayRow = { ...row, duplicateCount: 1 };
        seen.set(key, next);
        out.push(next);
    }
    return out;
}

export default function ProcessingQueueList({
    selectedCaseId,
    onSelectCase,
    onGoToSources,
    showFolders = false,
    panelMode = false,
    onCaseRemoved,
    headerAction,
}: {
    selectedCaseId: string | null;
    onSelectCase: (caseId: string) => void;
    /** When provided (POS workspace), the empty state switches to the Sources tab instead of linking out. */
    onGoToSources?: () => void;
    /** Processing Work mode: show the derived folder rail + folder-aware queue header. */
    showFolders?: boolean;
    /** Parent panel owns the "Queue" title — hide duplicate rail label. */
    panelMode?: boolean;
    onCaseRemoved?: (caseId: string) => void;
    /** Import or other primary work action rendered in the queue rail header. */
    headerAction?: ReactNode;
}) {
    const { data, loading, error, refresh } = useProcessingQueueWarm();
    const rows = data?.rows ?? [];
    // Warm the leading rows as soon as the queue paints, so opening the top item is instant even
    // without a hover (keyboard, deep link, or a straight click off the list).
    const warmRowIds = rows.slice(0, 6).map((r) => r.id).join(",");
    useEffect(() => {
        if (warmRowIds) prefetchProcessingCases(warmRowIds.split(","));
    }, [warmRowIds]);
    const counts = data?.counts ?? {};
    const recommendations = data?.recommendations ?? {};
    const { workFolders } = useProcessingFolders();
    const categoryFolders = workFolders.filter((f) => f.id !== "incoming" && f.id !== "completed");
    // Every folder starts collapsed — the operator chooses which section to open, so the rail
    // reads as a compact index rather than a pre-expanded wall of rows.
    const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        for (const folder of workFolders) {
            initial[folder.id] = false;
        }
        return initial;
    });
    const [menuRowId, setMenuRowId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<QueueDisplayRow | null>(null);
    const [confirmArchive, setConfirmArchive] = useState<QueueDisplayRow | null>(null);
    const [renameTarget, setRenameTarget] = useState<QueueDisplayRow | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteErr, setDeleteErr] = useState<string | null>(null);
    const load = refresh;

    const total = rows.length;

    if (loading) {
        return (
            <div className="space-y-1 p-2" aria-busy="true">
                {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-7 animate-pulse bg-alloy-stone/10" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="m-2 border border-alloy-stone/20 bg-alloy-stone/[0.03] p-2 text-[11px] text-alloy-midnight/60">
                <div className="font-medium text-alloy-midnight/75">Couldn&apos;t load the queue</div>
                <div className="mt-0.5 text-[10px]">{error}</div>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-2 border border-alloy-stone/25 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (total === 0) {
        return (
            <div className="m-2 border border-dashed border-alloy-stone/20 bg-alloy-stone/[0.02] p-4 text-center">
                <div className={`font-medium ${PROCESSING_EMPTY}`}>Empty queue</div>
                <p className={`mx-auto mt-1 max-w-[16rem] text-[10px] leading-relaxed ${WS_TEXT_MUTED}`}>
                    Import a form to begin review.
                </p>
                {onGoToSources ? (
                    <button
                        type="button"
                        onClick={onGoToSources}
                        className="mt-2 inline-flex items-center gap-1 border border-alloy-stone/25 px-2 py-0.5 text-[10px] font-medium text-alloy-bend-pine hover:bg-alloy-bend-pine/[0.06]"
                    >
                        Go to Documents
                    </button>
                ) : (
                    <p className={`mt-2 text-[10px] ${WS_TEXT_MUTED}`}>Import a PDF using the toolbar above.</p>
                )}
            </div>
        );
    }

    const visibleRows = collapseDuplicateDocumentRows(rows);
    const incomingRows = visibleRows.filter((r) => deriveWorkLane(r) !== "completed");
    const completedRows = visibleRows.filter((r) => deriveWorkLane(r) === "completed");

    const renderWorkLane = (lane: { key: WorkLaneKey; label: string }) => {
        const laneRows = incomingRows.filter((r) => deriveWorkLane(r) === lane.key);
        if (laneRows.length === 0) return null;
        const count = laneRows.length;
        return (
            <div key={lane.key}>
                <div className={`px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${WS_TEXT_MUTED}`}>
                    {lane.label} · {count}
                </div>
                <ul className="flex flex-col gap-1.5">{laneRows.map((row) => renderRow(row))}</ul>
            </div>
        );
    };

    const renderRow = (row: QueueDisplayRow) => {
        const selected = selectedCaseId === row.id;
        // Configurable title (person — purpose) instead of the repeated form name; the form name
        // stays visible below as source context.
        const title = row.caseTitle ?? row.sourceDisplay?.label ?? row.primarySource?.kind ?? "Untitled source";
        const sourceContext = row.caseTitle ? row.sourceDisplay?.label ?? null : null;
        const rec = recommendations[row.id] ?? null;
        const lane = deriveWorkLane(row);
        const laneLabel =
            lane === "needs_review"
                ? "Needs review"
                : lane === "ready_generate"
                  ? "Ready to generate"
                  : lane === "ready_publish"
                    ? "Ready to publish"
                    : "Completed";
        const laneTone =
            lane === "needs_review"
                ? "text-alloy-midnight/50"
                : lane === "ready_generate" || lane === "ready_publish"
                  ? "text-alloy-bend-pine"
                  : "text-alloy-midnight/35";
        const canDelete = canDeleteTestUpload(row);
        const canArchive = canArchiveImport(row);
        const canRename = row.primarySource?.kind === "document";
        const menuOpen = menuRowId === row.id;
        return (
            <li key={row.id} className="group relative">
                <button
                    type="button"
                    data-processing-case-id={row.id}
                    onClick={() => onSelectCase(row.id)}
                    // Warm detail + recommendation on intent, so the click paints from cache.
                    onMouseEnter={() => void prefetchProcessingCase(row.id)}
                    onFocus={() => void prefetchProcessingCase(row.id)}
                    aria-current={selected}
                    className={`${QUEUE_ROW_CLASS} ${selected ? QUEUE_ROW_SELECTED_CLASS : ""}`}
                >
                    <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                            <span className={`min-w-0 flex-1 truncate ${PROCESSING_QUEUE_ROW_TITLE}`}>{title}</span>
                            <span className={`shrink-0 tabular-nums ${PROCESSING_QUEUE_METADATA}`}>{formatAge(row.sourceDisplay?.receivedAt ?? row.createdAt)}</span>
                        </span>
                        <span className={`mt-0.5 flex items-center gap-1 truncate ${PROCESSING_QUEUE_METADATA} ${laneTone}`}>
                            <span>{laneLabel}</span>
                            {/* A badge every single row shares is not a signal — it is noise that
                                costs a line of scanning and tells the operator nothing about which
                                item to pick up. "Manual review" is currently the universal fallback,
                                so it is suppressed until the recommender can actually discriminate;
                                actions that DO say something still show. */}
                            {rec && rec.action !== "manual_review" ? (
                                <>
                                    <span aria-hidden className="text-alloy-midnight/15">·</span>
                                    <RecommendationBadge rec={rec} />
                                </>
                            ) : null}
                        </span>
                        {sourceContext ? (
                            <span className={`mt-0.5 block truncate ${PROCESSING_QUEUE_METADATA} text-alloy-midnight/40`}>
                                Submitted through {sourceContext}
                            </span>
                        ) : null}
                    </span>
                </button>
                {canDelete || canArchive || canRename ? (
                    <div className="absolute right-1 top-1">
                        <button
                            type="button"
                            aria-label="Row actions"
                            onClick={(e) => {
                                e.stopPropagation();
                                setMenuRowId(menuOpen ? null : row.id);
                            }}
                            className="rounded p-1 text-alloy-midnight/35 opacity-0 transition-opacity hover:bg-alloy-stone/10 hover:text-alloy-midnight/60 group-hover:opacity-100 data-[open=true]:opacity-100"
                            data-open={menuOpen || undefined}
                        >
                            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        {menuOpen ? (
                            <div className="absolute right-0 z-10 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-alloy-stone/15 bg-white py-1 shadow-lg">
                                {canRename ? (
                                    <button
                                        type="button"
                                        className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuRowId(null);
                                            setRenameTarget(row);
                                            setDeleteErr(null);
                                        }}
                                    >
                                        Rename
                                    </button>
                                ) : null}
                                {canArchive ? (
                                    <button
                                        type="button"
                                        className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuRowId(null);
                                            setConfirmArchive(row);
                                            setDeleteErr(null);
                                        }}
                                    >
                                        Archive import
                                    </button>
                                ) : null}
                                {canDelete ? (
                                    <button
                                        type="button"
                                        className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuRowId(null);
                                            setConfirmDelete(row);
                                            setDeleteErr(null);
                                        }}
                                    >
                                        Delete test upload
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </li>
        );
    };

    const renderLane = (lane: { key: ProcessingCaseStatus; label: string }) => {
        const laneRows = visibleRows.filter((r) => r.status === lane.key);
        if (laneRows.length === 0) return null;
        const count = showFolders ? laneRows.length : typeof counts[lane.key] === "number" ? counts[lane.key] : laneRows.length;
        return (
            <div key={lane.key}>
                <div className={`px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${LANE_TONE[lane.key] ?? "text-alloy-midnight/40"}`}>
                    {lane.label} · {count}
                </div>
                <ul className="flex flex-col gap-1.5">{laneRows.map((row) => renderRow(row))}</ul>
            </div>
        );
    };

    const toggleFolder = (key: ProcessingFolderKey) =>
        setOpenFolders((cur) => ({ ...cur, [key]: !cur[key] }));

    const renderFolderHeader = (key: ProcessingFolderKey, label: string, count: number, accent?: "pine" | "midnight" | "stone") => {
        const expanded = openFolders[key];
        const iconClass =
            key === "completed"
                ? WS_ICON_ATTENTION
                : key === "incoming" || accent === "pine"
                  ? WS_ICON_INTERACTIVE
                  : WS_ICON_STRUCTURAL;
        return (
        <button
            type="button"
            onClick={() => toggleFolder(key)}
            className={`flex w-full items-center justify-between px-2 py-1 text-left transition-colors hover:bg-alloy-stone/[0.04] ${
                expanded ? "bg-alloy-stone/[0.03]" : ""
            }`}
            data-processing-folder={key}
        >
            <span className="flex min-w-0 items-center gap-2">
                <ProcessingFolderIcon folderId={key} className={`h-3 w-3 shrink-0 ${iconClass}`} />
                <span className={`truncate text-[12.5px] font-semibold ${WS_TEXT_PRIMARY}`}>{label}</span>
            </span>
            <span className={`ml-2 shrink-0 px-1.5 text-[9px] font-semibold tabular-nums ${WS_TEXT_SECONDARY}`}>
                {count}
            </span>
        </button>
        );
    };

    async function handleDeleteTestUpload() {
        if (!confirmDelete?.primarySource || confirmDelete.primarySource.kind !== "document") return;
        setDeleting(true);
        setDeleteErr(null);
        try {
            const res = await fetch(`/api/admin/pos/documents/${confirmDelete.primarySource.id}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(body.error || `Delete failed (${res.status})`);
            setConfirmDelete(null);
            if (selectedCaseId === confirmDelete.id) onCaseRemoved?.(confirmDelete.id);
            refresh();
        } catch (e) {
            setDeleteErr(e instanceof Error ? e.message : "Delete failed");
        } finally {
            setDeleting(false);
        }
    }

    async function handleArchiveImport() {
        if (!confirmArchive) return;
        setDeleting(true);
        setDeleteErr(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${confirmArchive.id}/archive`, {
                method: "POST",
                credentials: "same-origin",
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(body.error || `Archive failed (${res.status})`);
            setConfirmArchive(null);
            if (selectedCaseId === confirmArchive.id) onCaseRemoved?.(confirmArchive.id);
            refresh();
        } catch (e) {
            setDeleteErr(e instanceof Error ? e.message : "Archive failed");
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div className="w-full">
            {showFolders ? (
                <div className="flex min-h-0 flex-col bg-white" data-processing-folder-tree="true">
                    <div className={`shrink-0 border-b border-alloy-stone/12 ${panelMode ? "px-1.5 py-1.5" : "space-y-1 px-2 py-2"}`}>
                        {panelMode ? null : (
                            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/35">Work queue</p>
                        )}
                        {headerAction}
                    </div>
                    {(() => {
                        const incoming = workFolders.find((f) => f.id === "incoming");
                        return renderFolderHeader("incoming", incoming?.label ?? "Incoming", incomingRows.length, incoming?.accent);
                    })()}
                    {openFolders.incoming ? (
                        <div className="border-b border-alloy-stone/10 py-0.5">
                            {WORK_LANES.filter((l) => l.key !== "completed").map(renderWorkLane)}
                            {incomingRows.length === 0 ? (
                                <p className="px-3 py-2 text-[10px] text-alloy-midnight/35">No incoming items — import a form to begin.</p>
                            ) : null}
                        </div>
                    ) : null}
                    {categoryFolders.map((folder) => {
                        const folderRows = visibleRows.filter(
                            (r) => deriveWorkLane(r) !== "completed" && caseMatchesCategoryFolder(r, folder.id)
                        );
                        const count = folderRows.length;
                        return (
                            <div key={folder.id}>
                                {renderFolderHeader(folder.id, folder.label, count, folder.accent)}
                                {openFolders[folder.id] ? (
                                    <div className="border-b border-alloy-stone/10 py-0.5">
                                        {folderRows.length > 0 ? (
                                            <ul className="flex flex-col gap-1.5">{folderRows.map((row) => renderRow(row))}</ul>
                                        ) : (
                                            <p className="px-3 py-1.5 text-[10px] text-alloy-midnight/35">No active items</p>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                    {(() => {
                        const completed = workFolders.find((f) => f.id === "completed");
                        return renderFolderHeader("completed", completed?.label ?? "Completed", completedRows.length, completed?.accent);
                    })()}
                    {openFolders.completed ? (
                        <div className="py-0.5">
                            {completedRows.length > 0 ? (
                                <ul className="flex flex-col gap-1.5">{completedRows.map((row) => renderRow(row))}</ul>
                            ) : (
                                <p className="px-3 py-1.5 text-[10px] text-alloy-midnight/35">No completed items</p>
                            )}
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className="py-1">
                {showFolders ? null : PRIMARY_LANES.map(renderLane)}
                {!showFolders && SECONDARY_LANES.some((l) => visibleRows.some((r) => r.status === l.key)) ? (
                    <div className="mt-0.5 border-t border-alloy-stone/10 pt-0.5">{SECONDARY_LANES.map(renderLane)}</div>
                ) : null}
            </div>
            <ProcessingConfirmDialog
                open={!!confirmArchive}
                onClose={() => {
                    if (!deleting) {
                        setConfirmArchive(null);
                        setDeleteErr(null);
                    }
                }}
                onConfirm={() => void handleArchiveImport()}
                title="Archive import?"
                body={
                    confirmArchive
                        ? `Hide "${confirmArchive.sourceDisplay?.label ?? "this import"}" from active work. Source records are preserved.`
                        : ""
                }
                confirmLabel="Archive import"
                confirming={deleting}
                testId="processing-archive-import-dialog"
            />
            <ProcessingConfirmDialog
                open={!!confirmDelete}
                onClose={() => {
                    if (!deleting) {
                        setConfirmDelete(null);
                        setDeleteErr(null);
                    }
                }}
                onConfirm={() => void handleDeleteTestUpload()}
                title="Delete test upload?"
                body={
                    confirmDelete
                        ? `Remove "${confirmDelete.sourceDisplay?.label ?? "this document"}" and its Processing case. Only use for throwaway test uploads.`
                        : ""
                }
                confirmLabel="Delete upload"
                confirming={deleting}
                testId="processing-delete-upload-dialog"
            />
            {deleteErr ? (
                <p className="px-4 py-2 text-[11px] text-alloy-midnight/60" role="alert">
                    {deleteErr}
                </p>
            ) : null}
            <ProcessingRenameDocumentDialog
                open={!!renameTarget}
                documentId={renameTarget?.primarySource?.kind === "document" ? renameTarget.primarySource.id : null}
                initialName={renameTarget?.sourceDisplay?.label ?? ""}
                onClose={() => setRenameTarget(null)}
                onRenamed={() => refresh()}
            />
        </div>
    );
}

function canArchiveImport(row: ProcessingCaseQueueRow): boolean {
    if (row.status === "archived") return false;
    return true;
}

function canDeleteTestUpload(row: ProcessingCaseQueueRow): boolean {
    if (row.primarySource?.kind !== "document") return false;
    if (row.formDraftSummary?.generatedFormId) return false;
    if (row.status === "completed" || row.status === "archived") return false;
    return true;
}
