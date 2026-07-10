"use client";

import { LayoutGrid, List, MoreHorizontal, Plus } from "lucide-react";
import { useState, useEffect } from "react";
import type { ProcessingFormRow } from "./useProcessingFormApi";
import ProcessingConfirmDialog from "./ProcessingConfirmDialog";
import ProcessingFolderDetailPanel from "./ProcessingFolderDetailPanel";
import ProcessingManageFoldersDialog from "./ProcessingManageFoldersDialog";
import { formMatchesStudioFolder, formOrigin, formPublishStatus } from "@/lib/pos/processingFolderConfig";
import { useProcessingFolders } from "@/lib/pos/useProcessingFolders";
import { ProcessingFolderIcon } from "@/lib/pos/processingFolderIcons";
import { parseFormBranding } from "@/lib/forms/processingFormBranding";

export type FormAssetFilter = "all" | "generated" | "manual" | "draft" | "published";

function matchesFilter(form: ProcessingFormRow, filter: FormAssetFilter): boolean {
    if (filter === "all") return true;
    if (filter === "generated") return formOrigin(form) === "generated";
    if (filter === "manual") return formOrigin(form) === "manual";
    if (filter === "draft") return formPublishStatus(form) === "draft";
    if (filter === "published") return formPublishStatus(form) === "published";
    return true;
}

function formStats(form: ProcessingFormRow): { questions: number | null; sections: number | null } {
    const meta = form.metadata ?? {};
    const questions = typeof meta.field_count === "number" ? meta.field_count : null;
    const sections = typeof meta.section_count === "number" ? meta.section_count : null;
    return { questions, sections };
}

function formDescription(form: ProcessingFormRow): string | null {
    if (typeof form.description === "string" && form.description.trim()) return form.description.trim();
    const meta = form.metadata ?? {};
    if (typeof meta.description === "string" && meta.description.trim()) return meta.description.trim();
    return null;
}

function formatEdited(form: ProcessingFormRow): string {
    const iso = form.updated_at ?? form.created_at;
    if (!iso) return "Recently";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Recently";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 60) return `${Math.max(mins, 1)}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function CardSkeleton() {
    return (
        <div className="overflow-hidden rounded-[14px] border border-alloy-stone/15 bg-white shadow-sm" aria-hidden>
            <div className="h-[120px] animate-pulse bg-alloy-stone/15" />
            <div className="space-y-2 p-3.5">
                <div className="h-4 w-3/4 animate-pulse rounded bg-alloy-stone/15" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-alloy-stone/10" />
            </div>
        </div>
    );
}

export default function ProcessingFormsAssetLibrary({
    forms,
    search,
    filter,
    onSearchChange,
    onFilterChange,
    onSelectForm,
    onCreateBlank,
    onArchiveForm,
    onDeleteForm,
    listLoaded,
    listErr,
    onRetry,
    focusFolderId,
}: {
    forms: ProcessingFormRow[];
    search: string;
    filter: FormAssetFilter;
    onSearchChange: (q: string) => void;
    onFilterChange: (f: FormAssetFilter) => void;
    onSelectForm: (formId: string) => void;
    onCreateBlank: () => void;
    onArchiveForm?: (formId: string) => Promise<void>;
    onDeleteForm?: (formId: string) => Promise<void>;
    listLoaded?: boolean;
    listErr?: string | null;
    onRetry?: () => void;
    focusFolderId?: string | null;
}) {
    const { formFolders } = useProcessingFolders();
    const [activeFolder, setActiveFolder] = useState("generated");

    useEffect(() => {
        if (focusFolderId) setActiveFolder(focusFolderId);
    }, [focusFolderId]);
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [manageOpen, setManageOpen] = useState(false);
    const [menuFormId, setMenuFormId] = useState<string | null>(null);
    const [confirmArchive, setConfirmArchive] = useState<ProcessingFormRow | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<ProcessingFormRow | null>(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [actionErr, setActionErr] = useState<string | null>(null);
    const q = search.trim().toLowerCase();
    const filtered = forms.filter((f) => {
        if (!matchesFilter(f, filter)) return false;
        if (!q) return true;
        const name = (f.name || f.key || "").toLowerCase();
        return name.includes(q);
    });

    const folderCounts = formFolders.reduce<Record<string, number>>((acc, folder) => {
        acc[folder.id] = forms.filter((f) => formMatchesStudioFolder(f, folder.id)).length;
        return acc;
    }, {});
    const visibleForms = filtered.filter((f) => formMatchesStudioFolder(f, activeFolder));
    const activeFolderDef = formFolders.find((f) => f.id === activeFolder) ?? null;
    const activeFolderLabel = activeFolderDef?.label ?? "Forms";

    async function handleArchive() {
        if (!confirmArchive || !onArchiveForm) return;
        setActionBusy(true);
        setActionErr(null);
        try {
            await onArchiveForm(confirmArchive.id);
            setConfirmArchive(null);
        } catch (e) {
            setActionErr(e instanceof Error ? e.message : "Archive failed");
        } finally {
            setActionBusy(false);
        }
    }

    async function handleDelete() {
        if (!confirmDelete || !onDeleteForm) return;
        setActionBusy(true);
        setActionErr(null);
        try {
            await onDeleteForm(confirmDelete.id);
            setConfirmDelete(null);
        } catch (e) {
            setActionErr(e instanceof Error ? e.message : "Delete failed");
        } finally {
            setActionBusy(false);
        }
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white" data-testid="processing-forms-asset-library">
            <div className="shrink-0 border-b border-alloy-stone/12 bg-white px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search forms…"
                        className="max-w-md min-w-[200px] flex-1 rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-[13px] shadow-sm focus:border-alloy-bend-pine/40 focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/15"
                        data-testid="forms-library-search"
                    />
                    <div className="flex items-center gap-1 rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.04] p-0.5">
                        <button
                            type="button"
                            aria-label="Grid view"
                            onClick={() => setViewMode("grid")}
                            className={`rounded-md p-1.5 ${viewMode === "grid" ? "bg-white text-alloy-bend-pine shadow-sm" : "text-alloy-midnight/40"}`}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                            type="button"
                            aria-label="List view"
                            onClick={() => setViewMode("list")}
                            className={`rounded-md p-1.5 ${viewMode === "list" ? "bg-white text-alloy-bend-pine shadow-sm" : "text-alloy-midnight/40"}`}
                        >
                            <List className="h-3.5 w-3.5" aria-hidden />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={onCreateBlank}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg bg-alloy-bend-pine px-3 py-2 text-[12px] font-semibold text-white hover:bg-alloy-bend-pine/90"
                        data-testid="forms-library-new-form"
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden /> New form
                    </button>
                </div>
            </div>

            <div className="flex min-h-0 flex-1">
                <aside className="w-52 shrink-0 overflow-y-auto border-r border-alloy-stone/8 bg-white/80 p-3">
                    <div className="mb-2 flex items-center justify-between px-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/30">Folders</p>
                        <button
                            type="button"
                            onClick={() => setManageOpen(true)}
                            className="text-[10px] font-semibold text-alloy-bend-pine hover:underline"
                            data-testid="processing-manage-folders-open"
                        >
                            Manage folders +
                        </button>
                    </div>
                    <div className="space-y-1">
                        {formFolders.map((folder) => {
                            const active = activeFolder === folder.id;
                            return (
                                <button
                                    key={folder.id}
                                    type="button"
                                    onClick={() => {
                                        setActiveFolder(folder.id);
                                        onFilterChange("all");
                                    }}
                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium transition-colors ${
                                        active
                                            ? "bg-alloy-bend-pine/[0.08] text-alloy-midnight"
                                            : "text-alloy-midnight/55 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight/75"
                                    }`}
                                >
                                    <ProcessingFolderIcon folderId={folder.id} className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                    <span className="truncate flex-1">{folder.label}</span>
                                    <span className="ml-2 shrink-0 text-[10px] tabular-nums opacity-60">{folderCounts[folder.id] ?? 0}</span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        onClick={() => setManageOpen(true)}
                        className="mt-3 w-full px-2.5 text-left text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                    >
                        + Add folder
                    </button>
                </aside>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {listErr ? (
                    <div className="rounded-xl border border-alloy-stone/20 bg-alloy-stone/[0.03] p-6 text-center">
                        <p className="text-[13px] font-medium text-alloy-midnight/75">Couldn&apos;t load forms</p>
                        <p className="mt-1 text-[12px] text-alloy-midnight/50">{listErr}</p>
                        {onRetry ? (
                            <button
                                type="button"
                                onClick={onRetry}
                                className="mt-4 rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/70"
                            >
                                Retry
                            </button>
                        ) : null}
                    </div>
                ) : !listLoaded ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4" aria-busy="true" aria-label="Loading forms">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <CardSkeleton key={i} />
                        ))}
                    </div>
                ) : visibleForms.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-alloy-stone/25 bg-white p-8 text-center">
                        <p className="text-[13px] font-medium text-alloy-midnight/70">
                            {forms.length === 0 ? "No forms yet" : `No forms in ${activeFolderLabel}`}
                        </p>
                        <p className="mt-1 text-[12px] text-alloy-midnight/45">
                            Create a blank form or generate one from a document in Work.
                        </p>
                        <button type="button" onClick={onCreateBlank} className="mt-4 rounded-lg bg-alloy-bend-pine px-3 py-2 text-[12px] font-semibold text-white">
                            + New form
                        </button>
                    </div>
                ) : (
                    <AssetSection
                        title={activeFolderLabel}
                        forms={visibleForms}
                        viewMode={viewMode}
                        onSelect={onSelectForm}
                        showCreate={activeFolder === "manual"}
                        onCreate={onCreateBlank}
                        onArchiveForm={onArchiveForm}
                        onDeleteForm={onDeleteForm}
                        menuFormId={menuFormId}
                        onMenuToggle={setMenuFormId}
                        onRequestArchive={setConfirmArchive}
                        onRequestDelete={setConfirmDelete}
                    />
                )}
                </div>
                <ProcessingFolderDetailPanel
                    folder={activeFolderDef}
                    formCount={folderCounts[activeFolder] ?? 0}
                    onManageFolders={() => setManageOpen(true)}
                />
            </div>
            <ProcessingManageFoldersDialog open={manageOpen} onClose={() => setManageOpen(false)} />
            <ProcessingConfirmDialog
                open={!!confirmArchive}
                onClose={() => {
                    if (!actionBusy) {
                        setConfirmArchive(null);
                        setActionErr(null);
                    }
                }}
                onConfirm={() => void handleArchive()}
                title={confirmArchive?.has_published_version ? "Archive published form?" : "Archive draft form?"}
                body={
                    confirmArchive
                        ? `"${confirmArchive.name ?? confirmArchive.key}" will be soft-archived and removed from this library.`
                        : ""
                }
                confirmLabel="Archive form"
                confirming={actionBusy}
                testId="processing-archive-form-dialog"
            />
            <ProcessingConfirmDialog
                open={!!confirmDelete}
                onClose={() => {
                    if (!actionBusy) {
                        setConfirmDelete(null);
                        setActionErr(null);
                    }
                }}
                onConfirm={() => void handleDelete()}
                title="Delete draft form?"
                body={
                    confirmDelete
                        ? `"${confirmDelete.name ?? confirmDelete.key}" will be permanently deleted. Only use for drafts with no submissions.`
                        : ""
                }
                confirmLabel="Delete draft"
                confirming={actionBusy}
                testId="processing-delete-form-dialog"
            />
            {actionErr ? (
                <p className="px-5 py-2 text-[11px] text-alloy-midnight/60" role="alert">
                    {actionErr}
                </p>
            ) : null}
        </div>
    );
}

function AssetSection({
    title,
    forms,
    viewMode,
    onSelect,
    showCreate,
    onCreate,
    onArchiveForm,
    onDeleteForm,
    menuFormId,
    onMenuToggle,
    onRequestArchive,
    onRequestDelete,
}: {
    title: string;
    forms: ProcessingFormRow[];
    viewMode: "grid" | "list";
    onSelect: (id: string) => void;
    showCreate?: boolean;
    onCreate?: () => void;
    onArchiveForm?: (formId: string) => Promise<void>;
    onDeleteForm?: (formId: string) => Promise<void>;
    menuFormId: string | null;
    onMenuToggle: (id: string | null) => void;
    onRequestArchive: (form: ProcessingFormRow) => void;
    onRequestDelete: (form: ProcessingFormRow) => void;
}) {
    return (
        <section className="mb-6">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/35">{title}</h3>
            <div
                className={
                    viewMode === "grid"
                        ? "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4"
                        : "flex flex-col gap-2"
                }
            >
                {forms.map((form) => (
                    <FormAssetCard
                        key={form.id}
                        form={form}
                        compact={viewMode === "list"}
                        onSelect={() => onSelect(form.id)}
                        canArchive={!!onArchiveForm}
                        canDelete={!!onDeleteForm}
                        menuOpen={menuFormId === form.id}
                        onMenuToggle={() => onMenuToggle(menuFormId === form.id ? null : form.id)}
                        onRequestArchive={() => {
                            onMenuToggle(null);
                            onRequestArchive(form);
                        }}
                        onRequestDelete={() => {
                            onMenuToggle(null);
                            onRequestDelete(form);
                        }}
                    />
                ))}
                {showCreate && onCreate ? (
                    <button
                        type="button"
                        onClick={onCreate}
                        className="flex min-h-[200px] flex-col items-center justify-center rounded-[14px] border-2 border-dashed border-alloy-stone/25 bg-white text-[12px] font-medium text-alloy-midnight/45 hover:border-alloy-bend-pine/30 hover:text-alloy-bend-pine"
                        data-testid="forms-library-create-blank-card"
                    >
                        <span className="mb-2 text-[28px] font-light text-alloy-bend-pine">+</span>
                        Create blank form
                    </button>
                ) : null}
            </div>
        </section>
    );
}

function FormAssetCard({
    form,
    compact = false,
    onSelect,
    canArchive,
    canDelete,
    menuOpen,
    onMenuToggle,
    onRequestArchive,
    onRequestDelete,
}: {
    form: ProcessingFormRow;
    compact?: boolean;
    onSelect: () => void;
    canArchive?: boolean;
    canDelete?: boolean;
    menuOpen?: boolean;
    onMenuToggle?: () => void;
    onRequestArchive?: () => void;
    onRequestDelete?: () => void;
}) {
    const origin = formOrigin(form);
    const status = formPublishStatus(form);
    const published = status === "published";
    const { questions, sections } = formStats(form);
    const description = formDescription(form);
    const brandName =
        typeof form.metadata?.brand_name === "string" && form.metadata.brand_name.trim()
            ? form.metadata.brand_name.trim()
            : null;
    const branding = parseFormBranding(form);
    const accent = branding.accent_color;
    return (
        <div
            className={`group relative overflow-hidden rounded-xl border border-alloy-stone/15 bg-white text-left shadow-[0_2px_12px_rgba(15,23,42,0.05)] transition-all duration-150 hover:shadow-[0_6px_20px_rgba(15,23,42,0.08)] ${
                compact ? "flex items-stretch" : ""
            }`}
            data-testid={`form-asset-card-${form.id}`}
        >
            <span
                className={`absolute inset-y-0 left-0 w-1 ${published ? "bg-alloy-bend-pine" : "bg-alloy-stone/25"}`}
                aria-hidden
            />
            <button type="button" onClick={onSelect} className={`block w-full text-left ${compact ? "flex min-w-0 flex-1 items-center gap-3 p-3 pl-4" : "pl-4"}`}>
            {!compact ? (
            <div
                className="relative flex h-[128px] items-center justify-center overflow-hidden"
                style={{ background: `linear-gradient(145deg, ${accent}18 0%, ${accent}08 50%, #f7f8fa 100%)` }}
            >
                {branding.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={branding.logo_url} alt="" className="absolute left-3 top-3 h-6 max-w-[4rem] object-contain opacity-80" />
                ) : brandName ? (
                    <span className="absolute left-3 top-3 text-[10px] font-bold uppercase tracking-wide text-alloy-midnight/35">
                        {brandName.slice(0, 12)}
                    </span>
                ) : null}
                <div className="w-[76%] rounded-lg border border-alloy-midnight/[0.06] bg-white p-3 shadow-[0_4px_16px_rgba(24,39,58,0.08)] transition-transform duration-150 group-hover:scale-[1.02]">
                    <div className="mb-2 h-2 rounded" style={{ width: "66%", backgroundColor: `${accent}40` }} />
                    <div className="mb-2 flex gap-1.5">
                        <div className="h-2 flex-1 rounded bg-alloy-stone/30" />
                        <div className="h-2 flex-1 rounded bg-alloy-stone/30" />
                    </div>
                    <div className="h-2 rounded bg-alloy-stone/20" />
                    <div className="mt-2 h-2 w-1/2 rounded" style={{ backgroundColor: `${accent}25` }} />
                </div>
            </div>
            ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.06] text-alloy-midnight/35">
                    <span className="text-[10px] font-bold">FM</span>
                </div>
            )}
            <div className={compact ? "min-w-0 flex-1" : "p-3.5 pt-3"}>
                <h4 className="text-[14px] font-semibold leading-snug text-alloy-midnight">{form.name || form.key}</h4>
                {description ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/45">{description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${published ? "bg-alloy-bend-pine/10 text-alloy-bend-pine" : "bg-alloy-stone/12 text-alloy-midnight/50"}`}>
                        {published ? "Published" : "Draft"}
                    </span>
                    <span className="rounded-full bg-alloy-stone/10 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/45">
                        {origin === "generated" ? "From document" : "Manual"}
                    </span>
                    {brandName ? (
                        <span className="rounded-full bg-alloy-stone/10 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/45">{brandName}</span>
                    ) : null}
                </div>
                <div className={`flex items-center justify-between gap-2 text-[10px] text-alloy-midnight/40 ${compact ? "mt-2" : "mt-3"}`}>
                    <span>
                        {questions != null ? `${questions} question${questions === 1 ? "" : "s"}` : "— questions"}
                        {sections != null ? ` · ${sections} section${sections === 1 ? "" : "s"}` : null}
                    </span>
                    <span>Updated {formatEdited(form)}</span>
                </div>
            </div>
            </button>
            {canArchive || canDelete ? (
                <div className="absolute right-2 top-2">
                    <button
                        type="button"
                        aria-label="Form actions"
                        onClick={(e) => {
                            e.stopPropagation();
                            onMenuToggle?.();
                        }}
                        className="rounded p-1 text-alloy-midnight/35 opacity-0 transition-opacity hover:bg-alloy-stone/10 hover:text-alloy-midnight/60 group-hover:opacity-100 data-[open=true]:opacity-100"
                        data-open={menuOpen || undefined}
                    >
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                    {menuOpen ? (
                        <div className="absolute right-0 z-10 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-alloy-stone/15 bg-white py-1 shadow-lg">
                            {status === "published" && canArchive ? (
                                <button
                                    type="button"
                                    className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRequestArchive?.();
                                    }}
                                >
                                    Archive published
                                </button>
                            ) : null}
                            {status === "draft" && canDelete ? (
                                <button
                                    type="button"
                                    className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRequestDelete?.();
                                    }}
                                >
                                    Delete draft
                                </button>
                            ) : null}
                            {status === "draft" && canArchive ? (
                                <button
                                    type="button"
                                    className="block w-full px-3 py-1.5 text-left text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRequestArchive?.();
                                    }}
                                >
                                    Archive draft
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
