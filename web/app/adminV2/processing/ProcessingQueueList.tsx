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

import { useState } from "react";
import type { ProcessingCaseQueueRow, ProcessingCaseStatus } from "@/lib/pos/processingCase/readModel/types";
import RecommendationBadge from "@/app/adminV2/pos/RecommendationBadge";
import { useProcessingQueueWarm } from "@/lib/pos/useProcessingQueueWarm";

/**
 * Display order: operator-actionable lanes first; completed/archived are secondary.
 *
 * Scope B (future, not built here): Incoming will gain an OUTER grouping dimension —
 * categories like Enrollment · Subsidy · Licensing · Imports, and deeper trees
 * (e.g. Subsidy → State → AZ → School 201). The current status lanes would nest under
 * the selected category. Keep this lane rendering category-agnostic so a grouped queue
 * can wrap it later; do NOT hardcode a fake category tree until the data model exists.
 */
const PRIMARY_LANES: { key: ProcessingCaseStatus; label: string }[] = [
    { key: "needs_resolution", label: "Needs resolution" },
    { key: "needs_review", label: "Needs review" },
    { key: "ready", label: "Ready to approve" },
    { key: "received", label: "Received" },
    { key: "processing", label: "Processing" },
];
const SECONDARY_LANES: { key: ProcessingCaseStatus; label: string }[] = [
    { key: "completed", label: "Completed" },
    { key: "archived", label: "Archived" },
];
const SOURCE_TYPE_LABELS: Record<string, string> = {
    form_submission: "Form",
    form_packet_session: "Packet",
    document: "Document",
    upload: "Upload",
    email_attachment: "Email",
    import: "Import",
    recreated_document: "Recreated",
};

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
type ProcessingFolderKey = "all" | "documents" | "submissions" | "packets" | "imports" | "other";

const FOLDER_ORDER: { key: ProcessingFolderKey; label: string }[] = [
    { key: "all", label: "Incoming" },
    { key: "documents", label: "Documents" },
    { key: "submissions", label: "Submissions" },
    { key: "packets", label: "Packets" },
    { key: "imports", label: "Imports" },
    { key: "other", label: "Other" },
];
const FOLDER_LABEL: Record<ProcessingFolderKey, string> = FOLDER_ORDER.reduce(
    (acc, f) => ({ ...acc, [f.key]: f.label }),
    {} as Record<ProcessingFolderKey, string>,
);

function deriveFolder(row: ProcessingCaseQueueRow): Exclude<ProcessingFolderKey, "all"> {
    switch (row.primarySource?.kind) {
        case "document":
        case "upload":
        case "recreated_document":
            return "documents";
        case "form_submission":
            return "submissions";
        case "form_packet_session":
            return "packets";
        case "import":
        case "email_attachment":
            return "imports";
        default:
            return "other";
    }
}

/** Lane accent for the eyebrow — quiet, semantic, no rainbow. */
const LANE_TONE: Record<string, string> = {
    needs_resolution: "text-amber-700",
    needs_review: "text-amber-700",
    ready: "text-emerald-700",
    received: "text-stone-500",
    processing: "text-stone-500",
    completed: "text-stone-400",
    archived: "text-stone-400",
};

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

export default function ProcessingQueueList({
    selectedCaseId,
    onSelectCase,
    onGoToSources,
    showFolders = false,
}: {
    selectedCaseId: string | null;
    onSelectCase: (caseId: string) => void;
    /** When provided (POS workspace), the empty state switches to the Sources tab instead of linking out. */
    onGoToSources?: () => void;
    /** Processing Work mode: show the derived folder rail + folder-aware queue header. */
    showFolders?: boolean;
}) {
    const { data, loading, error, refresh } = useProcessingQueueWarm();
    const rows = data?.rows ?? [];
    const counts = data?.counts ?? {};
    const recommendations = data?.recommendations ?? {};
    const [activeFolder, setActiveFolder] = useState<ProcessingFolderKey>("all");
    const load = refresh;

    const total = rows.length;

    if (loading) {
        return (
            <div className="space-y-2 p-3" aria-busy="true">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-md bg-stone-100" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="m-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-medium">Couldn’t load the queue</div>
                <div className="mt-0.5 text-xs text-amber-700">{error}</div>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-2 rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (total === 0) {
        return (
            <div className="m-3 rounded-lg border border-dashed border-stone-200 bg-stone-50/60 p-5 text-center">
                <div className="text-sm font-medium text-stone-700">Nothing in Incoming yet</div>
                <p className="mx-auto mt-1 max-w-[18rem] text-xs leading-relaxed text-stone-500">
                    Items show up here as they arrive — a submitted form or packet, or an uploaded document. Set up a source in Studio to start.
                </p>
                {onGoToSources ? (
                    <button
                        type="button"
                        onClick={onGoToSources}
                        className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-700 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                    >
                        Go to Documents
                    </button>
                ) : (
                    <a
                        href="/admin/forms"
                        className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-700 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                    >
                        Go to Forms
                    </a>
                )}
            </div>
        );
    }

    // Derived folder rail — counts reflect loaded rows only; `all` is always present.
    const folderCounts = rows.reduce<Record<string, number>>((acc, r) => {
        const f = deriveFolder(r);
        acc[f] = (acc[f] ?? 0) + 1;
        return acc;
    }, {});
    const availableFolders = FOLDER_ORDER.filter((f) => f.key === "all" || (folderCounts[f.key] ?? 0) > 0);
    const effectiveFolder: ProcessingFolderKey =
        showFolders && availableFolders.some((f) => f.key === activeFolder) ? activeFolder : "all";
    const visibleRows =
        effectiveFolder === "all" ? rows : rows.filter((r) => deriveFolder(r) === effectiveFolder);

    const renderLane = (lane: { key: ProcessingCaseStatus; label: string }) => {
        const laneRows = visibleRows.filter((r) => r.status === lane.key);
        if (laneRows.length === 0) return null;
        // Folder view: count the loaded subset (honest). Default view: server count.
        const count = showFolders
            ? laneRows.length
            : typeof counts[lane.key] === "number"
              ? counts[lane.key]
              : laneRows.length;
        return (
            <div key={lane.key} className="mb-1.5">
                <div
                    className={`px-3 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-wide ${LANE_TONE[lane.key] ?? "text-stone-500"}`}
                >
                    {lane.label} · {count}
                </div>
                <ul>
                    {laneRows.map((row) => {
                        const selected = selectedCaseId === row.id;
                        const kindLabel = SOURCE_TYPE_LABELS[row.primarySource?.kind ?? ""] ?? "Source";
                        const title = row.sourceDisplay?.label ?? row.primarySource?.kind ?? "Untitled source";
                        const channel = row.sourceDisplay?.channel ?? null;
                        const rec = recommendations[row.id] ?? null;
                        return (
                            <li key={row.id}>
                                <button
                                    type="button"
                                    data-processing-case-id={row.id}
                                    onClick={() => onSelectCase(row.id)}
                                    aria-current={selected}
                                    className={`flex w-full items-start gap-2.5 border-l-2 px-3 py-2 text-left transition-colors ${
                                        selected
                                            ? "border-emerald-600 bg-emerald-50/70"
                                            : "border-transparent hover:bg-stone-50"
                                    }`}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2">
                                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-stone-900">
                                                {title}
                                            </span>
                                            <span className="shrink-0 text-[10.5px] text-stone-400">{formatAge(row.sourceDisplay?.receivedAt ?? row.createdAt)}</span>
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500">
                                            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">{kindLabel}</span>
                                            {channel ? <span className="truncate">via {channel}</span> : null}
                                            {row.relatedSourceCount > 0 ? <span>· +{row.relatedSourceCount} source{row.relatedSourceCount > 1 ? "s" : ""}</span> : null}
                                        </span>
                                        {rec ? (
                                            <span className="mt-1 flex items-center gap-1.5">
                                                <span className="text-[9px] font-medium uppercase tracking-wide text-stone-300">Alloy</span>
                                                <RecommendationBadge rec={rec} />
                                            </span>
                                        ) : null}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    };

    return (
        <div className="w-full">
            {showFolders ? (
                <>
                    <div
                        className="flex flex-wrap items-center gap-1 border-b border-alloy-stone/12 px-3 py-2"
                        role="tablist"
                        aria-label="Incoming folders"
                        data-processing-folder-rail="true"
                    >
                        {availableFolders.map((f) => {
                            const isOn = f.key === effectiveFolder;
                            const c = f.key === "all" ? rows.length : folderCounts[f.key] ?? 0;
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={isOn}
                                    data-processing-folder={f.key}
                                    onClick={() => setActiveFolder(f.key)}
                                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                        isOn
                                            ? "bg-alloy-juniper/[0.10] text-alloy-juniper ring-1 ring-alloy-juniper/30"
                                            : "text-alloy-midnight/55 hover:bg-alloy-stone/60 hover:text-alloy-midnight/80"
                                    }`}
                                >
                                    {f.label}
                                    <span className={`tabular-nums ${isOn ? "text-alloy-juniper/80" : "text-alloy-midnight/35"}`}>
                                        {c}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-baseline justify-between px-3 pb-1 pt-2.5">
                        <h3 className="text-[13px] font-semibold text-alloy-midnight">{FOLDER_LABEL[effectiveFolder]}</h3>
                        <span className="text-[11px] text-alloy-midnight/45">
                            {visibleRows.length} item{visibleRows.length === 1 ? "" : "s"}
                        </span>
                    </div>
                </>
            ) : null}
            <div className="py-1">
                {PRIMARY_LANES.map(renderLane)}
                {SECONDARY_LANES.some((l) => visibleRows.some((r) => r.status === l.key)) ? (
                    <div className="mt-1 border-t border-stone-100 pt-1">{SECONDARY_LANES.map(renderLane)}</div>
                ) : null}
            </div>
        </div>
    );
}
