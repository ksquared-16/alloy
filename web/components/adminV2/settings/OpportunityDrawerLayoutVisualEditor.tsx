"use client";

/**
 * Visual layout editor — Opportunity Drawer.
 * Phase 5.5 — production-faithful composition with inline section editing.
 */

import OpportunityDrawerLayoutEditorCanvas from "@/components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas";
import { isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient } from "@/lib/layout/featureFlag";
import { useCallback, useEffect, useMemo, useState } from "react";
import LayoutConfigClient from "@/components/layout/LayoutConfigClient";
import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import {
    fetchEntityLayoutRecord,
    patchEntityLayoutDraft,
    publishEntityLayoutDraft,
} from "@/lib/layout/opportunityDrawerLayoutEditorApi";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import {
    addRegisteredSection,
    formatLayoutValidationErrors,
    isOpportunityDrawerLayoutDoc,
    isSectionEditorHidden,
    listMissingRegisteredSections,
    OPPORTUNITY_DRAWER_LOCKED_SHELL_SLOTS,
    resolveOpportunityDrawerSectionZone,
    resolveVisualEditorActionState,
    validateOpportunityDrawerLayoutDoc,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import type { OpportunityDrawerSectionKey } from "@/lib/layout/surfaceLayoutRegistry";
import Link from "next/link";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";

type Props = {
    layoutId: string;
    basePath: string;
    onBack: () => void;
};

function LockedShellBand({
    slot,
    label,
    children,
}: {
    slot: string;
    label: string;
    children?: React.ReactNode;
}) {
    return (
        <div
            className="relative rounded-lg border border-dashed border-alloy-forge/25 bg-alloy-stone/[0.04]"
            data-testid={`visual-editor-locked-shell-${slot}`}
            data-visual-editor-locked="true"
        >
            <div className="flex items-center justify-between gap-2 border-b border-dashed border-alloy-forge/15 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{label}</span>
                <span className="rounded bg-alloy-stone/80 px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/50">
                    Platform · locked
                </span>
            </div>
            <div className="pointer-events-none select-none px-3 py-2 opacity-90">{children}</div>
        </div>
    );
}

export default function OpportunityDrawerLayoutVisualEditor({ layoutId, basePath, onBack }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [record, setRecord] = useState<EntityLayoutRecord | null>(null);
    const [workingDoc, setWorkingDoc] = useState<LayoutDoc | null>(null);
    const [workingName, setWorkingName] = useState("");
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState<"save" | "publish" | null>(null);
    const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);
    const [settingsSectionKey, setSettingsSectionKey] = useState<string | null>(null);
    const [fieldAddError, setFieldAddError] = useState<string | null>(null);
    const [forceAdvanced, setForceAdvanced] = useState(false);

    const advancedHref = `${basePath}?editor=1&layout=${encodeURIComponent(layoutId)}&advanced=1`;

    const validation = useMemo(
        () => (workingDoc ? validateOpportunityDrawerLayoutDoc(workingDoc) : { ok: true, errors: [], warnings: [] }),
        [workingDoc],
    );

    const missingSections = useMemo(
        () => (workingDoc ? listMissingRegisteredSections(workingDoc) : []),
        [workingDoc],
    );

    const actionState = useMemo(
        () =>
            record ?
                resolveVisualEditorActionState({
                    dirty,
                    validationOk: validation.ok,
                    recordStatus: record.status,
                    busy: busy != null,
                })
            :   {
                    canSave: false,
                    canPublish: false,
                    statusLabel: "",
                    statusTone: "neutral" as const,
                    publishBlockedReason: null,
                },
        [record, dirty, validation.ok, busy],
    );

    const fieldPickerGroups = useMemo(() => buildOpportunityDrawerEditorFieldPickerGroups(), []);

    const settingsSection = workingDoc?.sections.find((s) => s.key === settingsSectionKey) ?? null;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const rec = await fetchEntityLayoutRecord(layoutId);
            const parsed = parseLayoutDoc(rec.doc, { inferSurfaceKey: true });
            if (!parsed.ok || !parsed.doc) {
                throw new Error(formatLayoutValidationErrors(parsed.errors).join("; ") || "Invalid layout document");
            }
            if (!isOpportunityDrawerLayoutDoc(parsed.doc)) {
                setForceAdvanced(true);
            }
            setRecord(rec);
            setWorkingDoc(parsed.doc);
            setWorkingName(rec.name);
            setDirty(false);
            setEditingSectionKey(null);
            setSettingsSectionKey(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [layoutId]);

    useEffect(() => {
        void load();
    }, [load]);

    const applyDoc = useCallback((next: LayoutDoc) => {
        setWorkingDoc(next);
        setDirty(true);
        setFieldAddError(null);
    }, []);

    const saveDraft = useCallback(async () => {
        if (!workingDoc || !record || record.status === "published") return;
        if (!validation.ok) return;
        setBusy("save");
        setError(null);
        try {
            await patchEntityLayoutDraft(record.id, workingName, workingDoc);
            setDirty(false);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [workingDoc, workingName, record, validation.ok]);

    const publish = useCallback(async () => {
        if (!record || record.status === "published" || !validation.ok) return;
        setBusy("publish");
        setError(null);
        try {
            if (dirty) await patchEntityLayoutDraft(record.id, workingName, workingDoc!);
            const updated = await publishEntityLayoutDraft(record.id);
            setRecord(updated);
            setDirty(false);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [record, dirty, validation.ok, workingName, workingDoc]);

    if (forceAdvanced) {
        return (
            <div className="space-y-3" data-testid="opportunity-drawer-visual-editor-fallback">
                <p className="text-xs text-alloy-midnight/55">
                    Visual editor supports the opportunity drawer only. Using advanced builder.
                </p>
                <LayoutConfigClient adminV2Chrome hideLayoutCatalog initialSelectedId={layoutId} />
            </div>
        );
    }

    if (loading) {
        return (
            <div
                className="rounded-xl border border-alloy-forge/12 bg-white/90 p-6 text-sm text-alloy-midnight/55"
                data-testid="opportunity-drawer-visual-editor-loading"
            >
                Loading layout…
            </div>
        );
    }

    if (!workingDoc || !record) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {error ?? "Unable to load layout."}
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="opportunity-drawer-visual-editor">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-alloy-forge/12 bg-white/95 p-4 shadow-sm">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">Opportunity Drawer layout</h2>
                    <p className="mt-0.5 text-xs text-alloy-midnight/50">
                        Edit the drawer directly — hover a section for controls, or open Edit for inline changes.
                    </p>
                    {isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient() ?
                        <p
                            className="mt-1 rounded-md border border-alloy-pine/20 bg-alloy-pine/[0.06] px-2 py-1 text-[11px] text-alloy-midnight/70"
                            data-testid="visual-editor-live-publish-notice"
                        >
                            <strong>Live drawer:</strong> publishing updates section visibility, order, and fields in
                            supported sections for your org.
                        </p>
                    :   null}
                    <input
                        type="text"
                        value={workingName}
                        onChange={(e) => {
                            setWorkingName(e.target.value);
                            setDirty(true);
                        }}
                        className="mt-2 w-full max-w-md rounded-md border border-alloy-forge/20 px-2 py-1 text-sm"
                        aria-label="Layout name"
                    />
                    <p
                        className={`mt-1 text-[10px] font-medium uppercase tracking-wide ${
                            actionState.statusTone === "warning" ? "text-amber-700"
                            : actionState.statusTone === "error" ? "text-red-700"
                            : actionState.statusTone === "success" ? "text-alloy-pine"
                            :   "text-alloy-midnight/40"
                        }`}
                        data-testid="visual-editor-action-state"
                    >
                        {record.status} · v{record.version}
                        {actionState.statusLabel ? ` · ${actionState.statusLabel}` : ""}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void saveDraft()}
                        disabled={!actionState.canSave}
                        className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        data-testid="visual-editor-save-draft"
                    >
                        {busy === "save" ? "Saving…" : dirty ? "Save draft" : "Saved"}
                    </button>
                    <button
                        type="button"
                        onClick={() => void publish()}
                        disabled={!actionState.canPublish}
                        title={actionState.publishBlockedReason ?? undefined}
                        className="rounded-md border border-alloy-pine/30 px-3 py-1.5 text-xs font-semibold text-alloy-pine disabled:opacity-40"
                        data-testid="visual-editor-publish"
                    >
                        {busy === "publish" ? "Publishing…" : "Publish"}
                    </button>
                    <Link
                        href={advancedHref}
                        className="text-xs font-medium text-alloy-midnight/55 underline hover:text-alloy-pine"
                        data-testid="visual-editor-advanced-builder-link"
                    >
                        Switch to advanced builder
                    </Link>
                </div>
            </div>

            {error ?
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            :   null}

            {!validation.ok ?
                <div
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    data-testid="visual-editor-validation-errors"
                >
                    <p className="font-semibold">Fix validation issues before saving:</p>
                    <ul className="mt-1 list-inside list-disc text-xs">
                        {formatLayoutValidationErrors(validation.errors).map((msg) => (
                            <li key={msg}>{msg}</li>
                        ))}
                    </ul>
                </div>
            :   null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div
                    className={`${DRAWER_OVERVIEW_CONTAINER} overflow-hidden rounded-xl border border-alloy-forge/15 bg-[#F6F8FC] shadow-sm`}
                    data-testid="visual-editor-drawer-frame"
                >
                    <LockedShellBand slot="header" label="Drawer header">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-alloy-midnight">
                                    {String(LAYOUT_DRAWER_PREVIEW_RECORD.name ?? "Sample household")}
                                </p>
                                <p className="text-xs text-alloy-midnight/55">
                                    {String(LAYOUT_DRAWER_PREVIEW_RECORD._status_display ?? "Qualified")}
                                </p>
                            </div>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-alloy-midnight/45">Close</span>
                        </div>
                    </LockedShellBand>

                    <div className="space-y-3 p-4">
                        <LockedShellBand slot="lifecycle_rail_container" label="Lifecycle rail">
                            <div className="flex gap-2 text-[10px] text-alloy-midnight/50">
                                <span className="rounded bg-white px-2 py-1">Inquiry</span>
                                <span className="rounded bg-white px-2 py-1">Qualified</span>
                                <span className="rounded bg-white/60 px-2 py-1">Tour</span>
                            </div>
                        </LockedShellBand>

                        <LockedShellBand slot="tabs_container" label="Overview tabs">
                            <span className="inline-block border-b-2 border-alloy-pine/40 px-2 pb-1 text-xs font-medium text-alloy-midnight">
                                Overview
                            </span>
                        </LockedShellBand>

                        <OpportunityDrawerLayoutEditorCanvas
                            doc={workingDoc}
                            editingSectionKey={editingSectionKey}
                            settingsSectionKey={settingsSectionKey}
                            fieldPickerGroups={fieldPickerGroups}
                            validationOk={validation.ok}
                            fieldAddError={fieldAddError}
                            onEditSection={setEditingSectionKey}
                            onSectionSettings={setSettingsSectionKey}
                            onFieldAddError={setFieldAddError}
                            applyDoc={applyDoc}
                        />

                        <LockedShellBand slot="footer_actions" label="Footer actions">
                            <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-alloy-forge/20 bg-white px-3 py-1 text-xs text-alloy-midnight/60">
                                    Message
                                </span>
                                <span className="rounded-full border border-alloy-forge/20 bg-white px-3 py-1 text-xs text-alloy-midnight/60">
                                    Update status
                                </span>
                                <span className="text-[10px] text-alloy-midnight/40">Configured in Settings → Actions</span>
                            </div>
                        </LockedShellBand>
                    </div>
                </div>

                <aside className="rounded-xl border border-alloy-forge/12 bg-white/95 p-4 shadow-sm" data-testid="visual-editor-guidance-panel">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">Layout guidance</h3>
                    <div className="mt-3 space-y-3 text-xs leading-relaxed text-alloy-midnight/60">
                        <p>
                            This canvas uses the same overview grid and runtime renderer as the live opportunity drawer.
                            Hover a section for quick actions, or choose <strong>Edit</strong> to change fields inline.
                        </p>
                        <p>
                            Choose an entity, then a field when adding data. Technical keys stay in advanced builder
                            only.
                        </p>
                    </div>

                    {settingsSection ?
                        <div className="mt-5 border-t border-alloy-forge/10 pt-4" data-testid="visual-editor-section-settings-panel">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Section settings
                            </p>
                            <dl className="mt-2 space-y-2 text-xs">
                                <div>
                                    <dt className="text-alloy-midnight/45">Title</dt>
                                    <dd className="font-medium text-alloy-midnight">{settingsSection.title}</dd>
                                </div>
                                <div>
                                    <dt className="text-alloy-midnight/45">Zone</dt>
                                    <dd className="font-medium text-alloy-midnight">
                                        {resolveOpportunityDrawerSectionZone(settingsSection)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-alloy-midnight/45">Visibility</dt>
                                    <dd className="font-medium text-alloy-midnight">
                                        {isSectionEditorHidden(settingsSection) ? "Hidden after publish" : "Visible"}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-alloy-midnight/45">Registry key</dt>
                                    <dd className="font-mono text-[10px] text-alloy-midnight/55">{settingsSection.key}</dd>
                                </div>
                            </dl>
                            <button
                                type="button"
                                className="mt-3 text-[11px] font-medium text-alloy-pine hover:underline"
                                onClick={() => {
                                    setEditingSectionKey(settingsSection.key);
                                    setSettingsSectionKey(null);
                                }}
                            >
                                Edit this section
                            </button>
                        </div>
                    :   null}

                    {missingSections.length > 0 ?
                        <div className="mt-5 border-t border-alloy-forge/10 pt-4">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Add section</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                                {missingSections.map((key) => (
                                    <button
                                        key={key}
                                        type="button"
                                        className="rounded border border-alloy-forge/15 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60 hover:border-alloy-pine/30"
                                        onClick={() => applyDoc(addRegisteredSection(workingDoc, key as OpportunityDrawerSectionKey))}
                                        data-testid={`visual-editor-add-section-${key}`}
                                    >
                                        + {key.replace(/_/g, " ")}
                                    </button>
                                ))}
                            </div>
                        </div>
                    :   null}

                    <p className="mt-6 text-[10px] text-alloy-midnight/40">
                        Locked: {OPPORTUNITY_DRAWER_LOCKED_SHELL_SLOTS.slice(0, 4).join(", ")}…
                    </p>
                </aside>
            </div>

            <button type="button" onClick={onBack} className="text-xs font-medium text-alloy-pine hover:underline">
                ← Back to gallery
            </button>
        </div>
    );
}

const DRAWER_OVERVIEW_CONTAINER = "adminv2-drawer-overview-canvas max-w-none";
