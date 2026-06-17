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
import {
    fetchEntityLayoutRecord,
    patchEntityLayoutDraft,
    publishEntityLayoutDraft,
} from "@/lib/layout/opportunityDrawerLayoutEditorApi";
import {
    dispatchOpportunityDrawerLayoutPublished,
    forkPublishedLayoutToDraft,
    parseLayoutDocFromRecord,
} from "@/lib/layout/layoutEditorPublishWorkflow";
import { buildOpportunityDrawerEditorFieldPickerGroups } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import {
    addRegisteredSection,
    addCustomOpportunityDrawerSection,
    addRelatedListOpportunityDrawerSection,
    addWidgetOpportunityDrawerSection,
    ensureOpportunityDrawerLayoutDocSaveReady,
    formatLayoutValidationErrors,
    isOpportunityDrawerLayoutDoc,
    isSectionEditorHidden,
    layoutDocHasRepairableGeneratedKeys,
    listMissingRegisteredSections,
    OPPORTUNITY_DRAWER_LOCKED_SHELL_SLOTS,
    prepareOpportunityDrawerLayoutDocForEditor,
    repairOpportunityDrawerLayoutGeneratedKeys,
    resolveOpportunityDrawerSectionZone,
    resolveVisualEditorActionState,
    validateOpportunityDrawerLayoutDoc,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import {
    applyOpportunityDrawerStarterTemplate,
    OPPORTUNITY_DRAWER_STARTER_TEMPLATES,
    type OpportunityDrawerStarterTemplateKey,
} from "@/lib/layout/layoutEditorOpportunityDrawerStarterTemplates";
import type { OpportunityDrawerSectionKey } from "@/lib/layout/surfaceLayoutRegistry";
import Link from "next/link";

type Props = {
    layoutId: string;
    basePath: string;
    onBack: () => void;
    onLayoutIdChange?: (layoutId: string) => void;
};

export default function OpportunityDrawerLayoutVisualEditor({ layoutId, basePath, onBack, onLayoutIdChange }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [record, setRecord] = useState<EntityLayoutRecord | null>(null);
    const [workingDoc, setWorkingDoc] = useState<LayoutDoc | null>(null);
    const [workingName, setWorkingName] = useState("");
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState<"save" | "publish" | null>(null);
    const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);
    const [settingsSectionKey, setSettingsSectionKey] = useState<string | null>(null);
    const [selectedFieldPath, setSelectedFieldPath] = useState<string | null>(null);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [inspectMode, setInspectMode] = useState(false);
    const [fieldAddError, setFieldAddError] = useState<string | null>(null);
    const [forceAdvanced, setForceAdvanced] = useState(false);
    const [autoRepairNotice, setAutoRepairNotice] = useState<string | null>(null);

    const advancedHref = `${basePath}?editor=1&layout=${encodeURIComponent(layoutId)}&advanced=1`;

    const validation = useMemo(
        () => (workingDoc ? validateOpportunityDrawerLayoutDoc(workingDoc) : { ok: true, errors: [], warnings: [] }),
        [workingDoc],
    );

    const missingSections = useMemo(
        () => (workingDoc ? listMissingRegisteredSections(workingDoc) : []),
        [workingDoc],
    );

    const repairableKeys = useMemo(
        () => (workingDoc ? layoutDocHasRepairableGeneratedKeys(workingDoc) : false),
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
        setAutoRepairNotice(null);
        try {
            const rec = await fetchEntityLayoutRecord(layoutId);
            const prepared = prepareOpportunityDrawerLayoutDocForEditor(rec.doc);
            if (!prepared.ok) {
                throw new Error(formatLayoutValidationErrors(prepared.errors).join("; ") || "Invalid layout document");
            }
            if (!isOpportunityDrawerLayoutDoc(prepared.doc)) {
                setForceAdvanced(true);
            }
            setRecord(rec);
            setWorkingDoc(prepared.doc);
            setWorkingName(rec.name);
            setDirty(prepared.autoRepaired);
            if (prepared.autoRepaired) {
                setAutoRepairNotice(
                    `Repaired ${prepared.repairs.length} legacy layout key${prepared.repairs.length === 1 ? "" : "s"}. Save draft to persist the fix.`,
                );
            } else {
                setDirty(false);
            }
            setEditingSectionKey(null);
            setSettingsSectionKey(null);
            setSelectedFieldPath(null);
            setSelectedBlockId(null);
            setInspectMode(false);
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
        if (!workingDoc || !record) return;
        const ready = ensureOpportunityDrawerLayoutDocSaveReady(workingDoc);
        const docToSave = ready.doc;
        const validationForSave = validateOpportunityDrawerLayoutDoc(docToSave);
        if (!validationForSave.ok) return;
        if (ready.repaired) {
            setWorkingDoc(docToSave);
            setAutoRepairNotice(
                `Repaired ${ready.repairs.length} legacy layout key${ready.repairs.length === 1 ? "" : "s"} before save.`,
            );
        }
        setBusy("save");
        setError(null);
        try {
            let target = record;
            if (record.status === "published") {
                target = await forkPublishedLayoutToDraft(record);
                onLayoutIdChange?.(target.id);
                setRecord(target);
            }
            const saved = await patchEntityLayoutDraft(target.id, workingName, docToSave);
            setRecord(saved);
            setWorkingDoc(parseLayoutDocFromRecord(saved));
            setDirty(false);
            setAutoRepairNotice(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [workingDoc, workingName, record, onLayoutIdChange]);

    const publish = useCallback(async () => {
        if (!record || !workingDoc) return;
        const ready = ensureOpportunityDrawerLayoutDocSaveReady(workingDoc);
        const docToPublish = ready.doc;
        const validationForPublish = validateOpportunityDrawerLayoutDoc(docToPublish);
        if (!validationForPublish.ok) return;
        if (ready.repaired) {
            setWorkingDoc(docToPublish);
        }
        setBusy("publish");
        setError(null);
        try {
            let target = record;
            if (record.status === "published") {
                target = await forkPublishedLayoutToDraft(record);
                onLayoutIdChange?.(target.id);
                setRecord(target);
            }
            if (dirty || ready.repaired) {
                target = await patchEntityLayoutDraft(target.id, workingName, docToPublish);
            }
            const published = await publishEntityLayoutDraft(target.id);
            dispatchOpportunityDrawerLayoutPublished(published.doc);
            const nextDraft = await forkPublishedLayoutToDraft(published);
            onLayoutIdChange?.(nextDraft.id);
            setRecord(nextDraft);
            setWorkingDoc(parseLayoutDocFromRecord(nextDraft));
            setDirty(false);
            setAutoRepairNotice(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [record, dirty, workingName, workingDoc, onLayoutIdChange]);

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
                        onClick={() => setInspectMode((v) => !v)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                            inspectMode ?
                                "border-alloy-pine/40 bg-alloy-pine/[0.08] text-alloy-pine"
                            :   "border-alloy-forge/20 text-alloy-midnight/65"
                        }`}
                        data-testid="visual-editor-inspect-mode"
                    >
                        {inspectMode ? "Inspect on" : "Inspect"}
                    </button>
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

            {autoRepairNotice ?
                <div
                    className="rounded-lg border border-alloy-pine/25 bg-alloy-pine/[0.08] px-3 py-2 text-sm text-alloy-midnight"
                    data-testid="visual-editor-auto-repair-notice"
                >
                    {autoRepairNotice}
                </div>
            :   null}

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
                    {repairableKeys ?
                        <button
                            type="button"
                            className="mt-2 rounded-md border border-amber-400/60 bg-white px-2 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100/80"
                            data-testid="visual-editor-repair-layout-keys"
                            onClick={() => {
                                if (!workingDoc) return;
                                const repaired = repairOpportunityDrawerLayoutGeneratedKeys(workingDoc);
                                if (repaired.changed) applyDoc(repaired.doc);
                            }}
                        >
                            Repair generated layout keys
                        </button>
                    :   null}
                </div>
            :   null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div
                    className={`${DRAWER_OVERVIEW_CONTAINER} overflow-hidden rounded-xl border border-alloy-forge/15 bg-[#F6F8FC] shadow-sm`}
                    data-testid="visual-editor-drawer-frame"
                >
                    <div
                        className="mb-2 flex items-center justify-between gap-2 rounded-md border border-dashed border-alloy-forge/20 bg-white/60 px-2 py-1.5"
                        data-testid="visual-editor-shell-preview-indicator"
                    >
                        <span className="text-[10px] text-alloy-midnight/45">
                            Drawer shell (header · lifecycle · tabs · footer) — preview only, not editable here
                        </span>
                    </div>

                    <div className="p-1">
                        <OpportunityDrawerLayoutEditorCanvas
                            doc={workingDoc}
                            editingSectionKey={editingSectionKey}
                            settingsSectionKey={settingsSectionKey}
                            selectedFieldPath={selectedFieldPath}
                            selectedBlockId={selectedBlockId}
                            inspectMode={inspectMode}
                            fieldPickerGroups={fieldPickerGroups}
                            validationOk={validation.ok}
                            fieldAddError={fieldAddError}
                            onEditSection={(key) => {
                                setEditingSectionKey(key);
                                if (key) {
                                    setSelectedFieldPath(null);
                                    setSelectedBlockId(null);
                                }
                            }}
                            onSectionSettings={setSettingsSectionKey}
                            onSelectFieldPath={setSelectedFieldPath}
                            onSelectBlockId={setSelectedBlockId}
                            onFieldAddError={setFieldAddError}
                            applyDoc={applyDoc}
                            layoutRecordId={record?.id ?? null}
                            layoutVersion={record?.version ?? null}
                        />
                    </div>
                </div>

                <aside className="rounded-xl border border-alloy-forge/12 bg-white/95 p-4 shadow-sm" data-testid="visual-editor-guidance-panel">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">Layout guidance</h3>
                    <div className="mt-3 space-y-3 text-xs leading-relaxed text-alloy-midnight/60">
                        <p>
                            Hover a section and choose <strong>Configure</strong> to edit layout blocks, fields, and display
                            behavior inline. Field settings expand directly under the selected field — no separate panel below.
                        </p>
                        <p>
                            Use <strong>Inspect</strong> to hover or click preview elements and jump to their configuration.
                            Preview updates instantly; save only persists changes.
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

                    <div className="mt-5 border-t border-alloy-forge/10 pt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Starter templates</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-alloy-midnight/45">
                            Add production-ready section patterns using current builder primitives.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                            {OPPORTUNITY_DRAWER_STARTER_TEMPLATES.map((template) => (
                                <button
                                    key={template.key}
                                    type="button"
                                    className="rounded border border-alloy-blue/25 bg-alloy-blue/[0.05] px-2 py-0.5 text-[10px] font-medium text-alloy-blue hover:border-alloy-blue/40"
                                    title={template.description}
                                    onClick={() =>
                                        applyDoc(
                                            applyOpportunityDrawerStarterTemplate(
                                                workingDoc,
                                                template.key as OpportunityDrawerStarterTemplateKey,
                                            ),
                                        )
                                    }
                                    data-testid={`visual-editor-starter-${template.key}`}
                                >
                                    + {template.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-5 border-t border-alloy-forge/10 pt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Add section</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                            <button
                                type="button"
                                className="rounded border border-alloy-pine/30 bg-alloy-pine/[0.06] px-2 py-0.5 text-[10px] font-medium text-alloy-pine hover:border-alloy-pine/50"
                                onClick={() => applyDoc(addCustomOpportunityDrawerSection(workingDoc, { zone: "main" }))}
                                data-testid="visual-editor-add-custom-section"
                            >
                                + Custom section
                            </button>
                            <button
                                type="button"
                                className="rounded border border-alloy-pine/30 bg-alloy-pine/[0.06] px-2 py-0.5 text-[10px] font-medium text-alloy-pine hover:border-alloy-pine/50"
                                onClick={() => applyDoc(addWidgetOpportunityDrawerSection(workingDoc, { zone: "summary_strip" }))}
                                data-testid="visual-editor-add-widget-section"
                            >
                                + Widget section
                            </button>
                            <button
                                type="button"
                                className="rounded border border-alloy-blue/30 bg-alloy-blue/[0.06] px-2 py-0.5 text-[10px] font-medium text-alloy-blue hover:border-alloy-blue/50"
                                onClick={() => applyDoc(addRelatedListOpportunityDrawerSection(workingDoc, { zone: "main" }))}
                                data-testid="visual-editor-add-related-list-section"
                            >
                                + Related list section
                            </button>
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
