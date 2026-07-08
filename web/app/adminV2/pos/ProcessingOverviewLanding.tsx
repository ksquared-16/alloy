"use client";

import { ArrowRight, Briefcase, FileUp, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { SurfaceHeaderKpiCard } from "@/components/presentation/workspace/WorkspaceHeader";
import type { WorkspaceHeaderKpiVm } from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import ProcessingLandingActionCard from "./ProcessingLandingActionCard";
import { ProcessingFolderIcon } from "@/lib/pos/processingFolderIcons";
import { useProcessingQueueWarm } from "@/lib/pos/useProcessingQueueWarm";
import { useProcessingFormApi } from "./useProcessingFormApi";
import { useProcessingFolders } from "@/lib/pos/useProcessingFolders";
import { caseMatchesCategoryFolder, formOrigin } from "@/lib/pos/processingFolderConfig";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";

function formatAge(iso: string | null): string {
    if (!iso) return "Recently";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Recently";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 60) return `${Math.max(mins, 1)}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function workStatusLabel(row: { status: string; formDraftSummary?: { generatedFormId: string | null } | null }): string {
    if (row.formDraftSummary?.generatedFormId) return "Ready to publish";
    if (row.status === "ready") return "Ready to generate";
    if (row.status === "completed" || row.status === "archived") return "Completed";
    return "Needs review";
}

function statusTone(label: string): string {
    if (label.includes("Ready")) return "text-alloy-bend-pine";
    if (label === "Completed") return "text-alloy-midnight/40";
    return "text-alloy-midnight/55";
}

const OVERVIEW_CARD_CLASS =
    "rounded-xl border border-alloy-stone/20 bg-white px-4 py-3.5 shadow-[0_1px_4px_rgba(15,23,42,0.06)]";

const OVERVIEW_KPIS = (args: {
    active: number;
    ready: number;
    forms: number;
    published: number;
}): WorkspaceHeaderKpiVm[] => [
    { slot: 1, label: "Active work", icon: "clipboard", accent: "midnight", formattedValue: String(args.active), status: "unknown", sourceKey: null, drillHref: null },
    { slot: 2, label: "Ready", icon: "spark", accent: "pine", formattedValue: String(args.ready), status: "healthy", sourceKey: null, drillHref: null },
    { slot: 3, label: "Forms", icon: "layers", accent: "midnight", formattedValue: String(args.forms), status: "unknown", sourceKey: null, drillHref: null },
    { slot: 4, label: "Published", icon: "book", accent: "pine", formattedValue: String(args.published), status: "healthy", sourceKey: null, drillHref: null },
];

export default function ProcessingOverviewLanding({
    onOpenWork,
    onOpenStudio,
    onOpenCase,
}: {
    onOpenWork: () => void;
    onOpenStudio: () => void;
    onOpenCase: (caseId: string) => void;
}) {
    const queue = useProcessingQueueWarm();
    const { forms, listLoaded, loadForms } = useProcessingFormApi();
    const { workFolders } = useProcessingFolders();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [importErr, setImportErr] = useState<string | null>(null);

    useEffect(() => {
        if (!listLoaded) void loadForms();
    }, [listLoaded, loadForms]);

    const rows = queue.data?.rows ?? [];
    const active = rows.filter((r) => r.status !== "completed" && r.status !== "archived");
    const ready = rows.filter((r) => r.status === "ready" || r.formDraftSummary?.generatedFormId);
    const recentRows = active.slice(0, 3);
    const recentForms = forms.slice(0, 3);

    const navFolders = useMemo(() => {
        return workFolders.map((folder) => {
            let count = 0;
            if (folder.id === "incoming") count = active.length;
            else if (folder.id === "completed") count = rows.filter((r) => r.status === "completed" || r.status === "archived").length;
            else count = rows.filter((r) => r.status !== "completed" && r.status !== "archived" && caseMatchesCategoryFolder(r, folder.id)).length;
            return { ...folder, count };
        });
    }, [workFolders, rows, active.length]);

    async function handleImport(file: File) {
        setUploading(true);
        setImportErr(null);
        try {
            const form = new FormData();
            form.append("file", file);
            form.append("open_processing_case", "true");
            const res = await fetch("/api/admin/documents/upload", { method: "POST", credentials: "same-origin", body: form });
            const body = (await res.json().catch(() => ({}))) as { processing_case_id?: string | null; error?: string };
            if (!res.ok) throw new Error(body.error || "Upload failed");
            void warmProcessingQueueCache({ force: true });
            if (body.processing_case_id) onOpenCase(body.processing_case_id);
        } catch (e) {
            setImportErr(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
            setDragActive(false);
        }
    }

    function onDragOver(e: DragEvent) {
        e.preventDefault();
        setDragActive(true);
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto bg-white p-4 lg:p-5" data-testid="processing-overview-landing">
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleImport(f);
                    e.target.value = "";
                }}
            />

            <div className="mx-auto max-w-6xl space-y-5">
                <section className="grid gap-3 md:grid-cols-3">
                            <ProcessingLandingActionCard
                                tier="primary"
                                disabled={uploading}
                        testId="processing-import-action-card"
                        icon={<FileUp className="h-5 w-5" aria-hidden />}
                        title={uploading ? "Importing…" : "Import form"}
                        description="Drop a PDF to start review."
                        cta="Open"
                        onClick={() => fileInputRef.current?.click()}
                        dragHandlers={{
                            onDragOver,
                            onDragLeave: () => setDragActive(false),
                            onDrop: (e) => {
                                e.preventDefault();
                                const file = e.dataTransfer.files?.[0];
                                if (file) void handleImport(file);
                                else setDragActive(false);
                            },
                            dragActive,
                        }}
                    />
                            <ProcessingLandingActionCard
                                tier="secondary"
                                icon={<Briefcase className="h-5 w-5" aria-hidden />}
                        title="Active work"
                        description="Resume imports and question review."
                        cta="Open"
                        onClick={onOpenWork}
                        testId="processing-continue-work-card"
                    />
                            <ProcessingLandingActionCard
                                tier="tertiary"
                                icon={<Layers className="h-5 w-5" aria-hidden />}
                        title="Form library"
                        description="Forms and assets in Studio."
                        cta="Open"
                        onClick={onOpenStudio}
                        testId="processing-studio-card"
                    />
                </section>
                {importErr ? <p className="text-[11px] text-alloy-midnight/60">{importErr}</p> : null}

                <section>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/35">
                        Today&apos;s activity
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                        {OVERVIEW_KPIS({
                            active: active.length,
                            ready: ready.length,
                            forms: forms.length,
                            published: forms.filter((f) => f.has_published_version).length,
                        }).map((kpi) => (
                            <SurfaceHeaderKpiCard key={kpi.slot} kpi={kpi} interactive={false} variant="workspace" density="compact" />
                        ))}
                    </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-3">
                    <ContinuePanel title="Recent work" action="View all" onAction={onOpenWork}>
                        {recentRows.length === 0 ? (
                            <EmptyHint>No active imports yet — import a form to begin.</EmptyHint>
                        ) : (
                            <ul className="space-y-1.5">
                                {recentRows.map((row) => {
                                    const status = workStatusLabel(row);
                                    return (
                                        <li key={row.id}>
                                            <button
                                                type="button"
                                                onClick={() => onOpenCase(row.id)}
                                                className="group flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-alloy-stone/[0.04]"
                                            >
                                                <span className="mt-1 h-8 w-0.5 shrink-0 rounded-full bg-alloy-bend-pine" aria-hidden />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[13px] font-semibold text-alloy-midnight group-hover:text-alloy-midnight">
                                                        {row.sourceDisplay?.label ?? "Untitled source"}
                                                    </span>
                                                    <span className={`mt-0.5 block text-[11px] font-medium ${statusTone(status)}`}>
                                                        {status} · Imported {formatAge(row.sourceDisplay?.receivedAt ?? row.createdAt)}
                                                    </span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </ContinuePanel>

                    <ContinuePanel title="Recent forms" action="View all" onAction={onOpenStudio}>
                        {recentForms.length === 0 ? (
                            <EmptyHint>Generated and manual forms appear here.</EmptyHint>
                        ) : (
                            <ul className="space-y-1.5">
                                {recentForms.map((form) => (
                                    <li
                                        key={form.id}
                                        className="flex items-start gap-3 rounded-lg px-2 py-2.5"
                                    >
                                        <span className="mt-1 h-8 w-0.5 shrink-0 rounded-full bg-alloy-midnight/25" aria-hidden />
                                        <span className="min-w-0 flex-1">
                                            <div className="truncate text-[13px] font-semibold text-alloy-midnight">{form.name ?? form.key}</div>
                                            <div className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                                Updated {formatAge(form.updated_at ?? form.created_at ?? null)}
                                            </div>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </ContinuePanel>

                    <section className={OVERVIEW_CARD_CLASS}>
                        <header className="mb-3 flex items-center justify-between gap-2 border-b border-alloy-stone/10 pb-2">
                            <h2 className="text-[14px] font-semibold text-alloy-midnight">Folders</h2>
                        </header>
                        <ul className="divide-y divide-alloy-stone/10">
                            {navFolders.map((folder) => (
                                <li key={folder.id}>
                                    <button
                                        type="button"
                                        onClick={onOpenWork}
                                        className="flex w-full items-center justify-between px-1 py-2.5 text-left transition-colors hover:bg-alloy-stone/[0.03]"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <ProcessingFolderIcon folderId={folder.id} className="h-3.5 w-3.5 shrink-0 text-alloy-midnight/40" />
                                            <span className="text-[12px] font-medium text-alloy-midnight/70">{folder.label}</span>
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <span className="text-[11px] tabular-nums text-alloy-midnight/35">({folder.count})</span>
                                            <ArrowRight className="h-3.5 w-3.5 text-alloy-midnight/25" aria-hidden />
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                </div>
            </div>
        </div>
    );
}

function ContinuePanel({
    title,
    action,
    onAction,
    children,
}: {
    title: string;
    action: string;
    onAction: () => void;
    children: ReactNode;
}) {
    return (
        <section className={OVERVIEW_CARD_CLASS}>
            <header className="mb-3 flex items-center justify-between gap-2 border-b border-alloy-stone/10 pb-2">
                <h2 className="text-[14px] font-semibold text-alloy-midnight">{title}</h2>
                <button type="button" onClick={onAction} className="text-[11px] font-semibold text-alloy-bend-pine hover:underline">
                    {action} →
                </button>
            </header>
            {children}
        </section>
    );
}

function EmptyHint({ children }: { children: ReactNode }) {
    return (
        <div className="rounded-lg border border-dashed border-alloy-stone/20 px-3 py-8 text-center text-[12px] text-alloy-midnight/45">
            {children}
        </div>
    );
}
