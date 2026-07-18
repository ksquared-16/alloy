"use client";

import { ArrowRight, Briefcase, FileUp, Layers } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import ProcessingLandingActionCard from "./ProcessingLandingActionCard";
import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import {
    WS_ICON_STRUCTURAL,
    WS_TEXT_DISABLED,
    WS_TEXT_PRIMARY,
    WS_TEXT_SECONDARY,
} from "@/components/workspace/workspaceTokens";
import { ProcessingFolderIcon } from "@/lib/pos/processingFolderIcons";
import { useProcessingQueueWarm } from "@/lib/pos/useProcessingQueueWarm";
import { useProcessingFormApi } from "./useProcessingFormApi";
import { useProcessingFolders } from "@/lib/pos/useProcessingFolders";
import { caseMatchesCategoryFolder } from "@/lib/pos/processingFolderConfig";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";
import ProcessingDevCleanupDialog from "./ProcessingDevCleanupDialog";
import ProcessingImportIntentModal from "./ProcessingImportIntentModal";
import { processingImportAcceptList } from "@/lib/pos/processingSourceCapabilities";
import { uploadProcessingDocument } from "@/lib/pos/processingDocumentUpload";
import { useProcessingOverviewKpis } from "@/lib/pos/processingOverviewKpis";
import { SurfaceHeaderKpiCard } from "@/components/presentation/workspace/WorkspaceHeader";

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
    if (label === "Completed") return WS_TEXT_DISABLED;
    return WS_TEXT_SECONDARY;
}

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
    const [importOpen, setImportOpen] = useState(false);
    const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [importErr, setImportErr] = useState<string | null>(null);
    const [cleanupOpen, setCleanupOpen] = useState(false);
    const { kpis: overviewKpis, loading: overviewKpisLoading } = useProcessingOverviewKpis();

    useEffect(() => {
        if (!listLoaded) void loadForms();
    }, [listLoaded, loadForms]);

    const rows = queue.data?.rows ?? [];
    const active = rows.filter((r) => r.status !== "completed" && r.status !== "archived");
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

    const existingDisplayNames = useMemo(() => {
        const fromRows = rows.map((row) => row.sourceDisplay?.label).filter((name): name is string => Boolean(name?.trim()));
        const fromForms = forms.map((f) => f.name).filter((name): name is string => Boolean(name?.trim()));
        return [...fromRows, ...fromForms];
    }, [rows, forms]);

    function openImportModal(file: File | null = null) {
        setPendingImportFile(file);
        setImportOpen(true);
        setImportErr(null);
    }

    async function submitImport(payload: {
        file: File;
        intent: import("@/lib/pos/processingImportIntent").ProcessingImportIntent;
        displayName: string;
    }) {
        setUploading(true);
        setImportErr(null);
        try {
            const body = await uploadProcessingDocument({
                file: payload.file,
                intent: payload.intent,
                displayName: payload.displayName,
            });
            void warmProcessingQueueCache({ force: true });
            setImportOpen(false);
            setPendingImportFile(null);
            if (body.processing_case_id) onOpenCase(body.processing_case_id);
            else throw new Error("Import succeeded but no review case was created.");
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
        <WorkspaceSurface scroll data-testid="processing-overview-landing">
            <input
                ref={fileInputRef}
                type="file"
                accept={processingImportAcceptList()}
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) openImportModal(f);
                    e.target.value = "";
                }}
            />

            <div className="mx-auto max-w-6xl space-y-5">
                <section className="grid gap-3 md:grid-cols-3">
                            <ProcessingLandingActionCard
                                tier="primary"
                                disabled={uploading}
                        testId="processing-import-action-card"
                        icon={<FileUp className="h-5 w-5" aria-hidden strokeWidth={2} />}
                        title={uploading ? "Importing…" : "Import document"}
                        description="Upload a document and choose what Alloy should do with it."
                        cta="Open"
                        onClick={() => openImportModal()}
                        dragHandlers={{
                            onDragOver,
                            onDragLeave: () => setDragActive(false),
                            onDrop: (e) => {
                                e.preventDefault();
                                const file = e.dataTransfer.files?.[0];
                                if (file) openImportModal(file);
                                else setDragActive(false);
                            },
                            dragActive,
                        }}
                    />
                            <ProcessingLandingActionCard
                                tier="secondary"
                                icon={<Briefcase className="h-5 w-5" aria-hidden strokeWidth={2} />}
                        title="Active work"
                        description="Resume imports and question review."
                        cta="Open"
                        onClick={onOpenWork}
                        testId="processing-continue-work-card"
                    />
                            <ProcessingLandingActionCard
                                tier="tertiary"
                                icon={<Layers className="h-5 w-5" aria-hidden strokeWidth={2} />}
                        title="Form library"
                        description="Forms and assets in Studio."
                        cta="Open"
                        onClick={onOpenStudio}
                        testId="processing-studio-card"
                    />
                </section>
                {importErr ? <p className={`text-[11px] ${WS_TEXT_SECONDARY}`}>{importErr}</p> : null}

                <section data-testid="processing-overview-activity-kpis">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/35">
                        Today&apos;s activity
                    </p>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-busy={overviewKpisLoading}>
                        {overviewKpis.map((kpi) => (
                            <SurfaceHeaderKpiCard
                                key={kpi.slot}
                                kpi={kpi}
                                variant="work-unit"
                                density="compact"
                            />
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
                                                    <span className={`block truncate text-[13px] font-semibold ${WS_TEXT_PRIMARY} group-hover:text-alloy-midnight`}>
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
                                            <div className={`mt-0.5 text-[11px] ${WS_TEXT_SECONDARY}`}>
                                                Updated {formatAge(form.updated_at ?? form.created_at ?? null)}
                                            </div>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </ContinuePanel>

                    <WorkspaceCard flat padded className="px-4 py-3">
                        <header className="mb-2 flex items-center justify-between gap-2">
                            <h2 className={`text-[13px] font-semibold ${WS_TEXT_PRIMARY}`}>Folders</h2>
                        </header>
                        <ul className="divide-y divide-alloy-stone/12">
                            {navFolders.map((folder) => (
                                <li key={folder.id}>
                                    <button
                                        type="button"
                                        onClick={onOpenWork}
                                        className="flex w-full items-center justify-between px-1 py-2.5 text-left transition-colors hover:bg-alloy-stone/[0.04]"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <ProcessingFolderIcon folderId={folder.id} className={`h-3.5 w-3.5 shrink-0 ${WS_ICON_STRUCTURAL}`} />
                                            <span className={`text-[12px] font-medium ${WS_TEXT_PRIMARY}`}>{folder.label}</span>
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <span className={`text-[11px] tabular-nums ${WS_TEXT_DISABLED}`}>({folder.count})</span>
                                            <ArrowRight className={`h-3.5 w-3.5 ${WS_ICON_STRUCTURAL} opacity-60`} aria-hidden />
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </WorkspaceCard>
                </div>
                {process.env.NODE_ENV !== "production" ? (
                    <div className="rounded-lg border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-[11px] text-amber-950">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                                <span className="font-semibold">Dev reset:</span> Remove all Processing test artifacts and return Work + Studio to blank.
                            </span>
                            <button
                                type="button"
                                onClick={() => setCleanupOpen(true)}
                                className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100/60"
                                data-testid="processing-dev-cleanup-open"
                            >
                                Reset test data
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
            <ProcessingDevCleanupDialog
                open={cleanupOpen}
                onClose={() => setCleanupOpen(false)}
                onApplied={() => {
                    void warmProcessingQueueCache({ force: true });
                    void loadForms();
                }}
            />
            <ProcessingImportIntentModal
                open={importOpen}
                onClose={() => {
                    if (!uploading) {
                        setImportOpen(false);
                        setPendingImportFile(null);
                    }
                }}
                onSubmit={submitImport}
                submitting={uploading}
                error={importErr}
                existingDisplayNames={existingDisplayNames}
                initialFile={pendingImportFile}
            />
        </WorkspaceSurface>
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
        <WorkspaceCard flat padded className="px-4 py-3.5">
            <header className="mb-2.5 flex items-center justify-between gap-2">
                <h2 className={`text-[13px] font-semibold ${WS_TEXT_PRIMARY}`}>{title}</h2>
                <button type="button" onClick={onAction} className="text-[11px] font-semibold text-alloy-bend-pine hover:underline">
                    {action} →
                </button>
            </header>
            {children}
        </WorkspaceCard>
    );
}

function EmptyHint({ children }: { children: ReactNode }) {
    return (
        <div className={`rounded-lg border border-dashed border-alloy-stone/20 px-3 py-8 text-center text-[12px] ${WS_TEXT_SECONDARY}`}>
            {children}
        </div>
    );
}
