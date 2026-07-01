"use client";

/**
 * Visual layout editor — drawer surfaces (opportunity, person, child).
 * Phase 5.16 — POS-builder-style studio shell (palette · canvas · inspector).
 */

import OpportunityDrawerLayoutEditorCanvas, {
    type LayoutBuilderEditorMode,
    type LayoutBuilderQuickStartAction,
} from "@/components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas";
import LayoutBuilderPreviewRecordSelector from "@/components/adminV2/settings/LayoutBuilderPreviewRecordSelector";
import LayoutBuilderInspectorPanel from "@/components/adminV2/settings/LayoutBuilderInspectorPanel";
import LayoutBuilderPalettePanel, {
    type LayoutBuilderStudioNotice,
} from "@/components/adminV2/settings/LayoutBuilderPalettePanel";
import { useCallback, useEffect, useMemo, useState } from "react";
import LayoutConfigClient from "@/components/layout/LayoutConfigClient";
import LayoutBuilderInspectorResizeHandle from "@/components/adminV2/settings/LayoutBuilderInspectorResizeHandle";
import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";
import {
    fetchEntityLayoutRecord,
    patchEntityLayoutDraft,
    publishEntityLayoutDraft,
} from "@/lib/layout/opportunityDrawerLayoutEditorApi";
import {
    dispatchChildDrawerLayoutPublished,
    dispatchOpportunityDrawerLayoutPublished,
    dispatchPersonDrawerLayoutPublished,
    forkPublishedLayoutToDraft,
    parseLayoutDocFromRecord,
} from "@/lib/layout/layoutEditorPublishWorkflow";
import {
    getDrawerLayoutEditorSurfaceConfig,
    type DrawerLayoutEditorSurfaceKey,
} from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import {
    prepareDrawerLayoutDocForEditor,
    validateDrawerLayoutDoc,
} from "@/lib/layout/drawerLayoutEditorModel";
import {
    applyOpportunityDrawerStarterTemplate,
    type OpportunityDrawerStarterTemplateKey,
} from "@/lib/layout/layoutEditorOpportunityDrawerStarterTemplates";
import { diffNewSectionKeys } from "@/lib/layout/layoutBuilderStudioUx";
import { formatDrawerLayoutValidationErrors } from "@/lib/layout/drawerSurfaceFieldValidation";
import {
    ensureOpportunityDrawerLayoutDocSaveReady,
    layoutDocHasRepairableGeneratedKeys,
    repairOpportunityDrawerLayoutGeneratedKeys,
    resolveVisualEditorActionState,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { opCaseFileCanvas } from "@/lib/operational/ui/operationalVisualTokens";
import { useLayoutBuilderPreviewRecord } from "@/lib/layout/layoutBuilderPreviewRecordState";
import {
    LAYOUT_BUILDER_INSPECTOR_RAIL_DEFAULT_PX,
    readLayoutBuilderInspectorRailWidth,
} from "@/lib/layout/layoutBuilderInspectorRailWidth";
import {
    formatLayoutDraftTitleWithVersion,
    formatLayoutPublishedTitleWithVersion,
    resolveLayoutStableTitle,
} from "@/lib/layout/layoutVersionNaming";
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
    const [surfaceKey, setSurfaceKey] = useState<DrawerLayoutEditorSurfaceKey>("opportunity_drawer");
    const [workingName, setWorkingName] = useState("");
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState<"save" | "publish" | null>(null);
    const [editorMode, setEditorMode] = useState<LayoutBuilderEditorMode>("build");
    const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
    const [selectedFieldPath, setSelectedFieldPath] = useState<string | null>(null);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [studioNotice, setStudioNotice] = useState<LayoutBuilderStudioNotice | null>(null);
    const [forceAdvanced, setForceAdvanced] = useState(false);
    const [autoRepairNotice, setAutoRepairNotice] = useState<string | null>(null);
    const previewRecordState = useLayoutBuilderPreviewRecord();
    const [inspectorRailWidth, setInspectorRailWidth] = useState(LAYOUT_BUILDER_INSPECTOR_RAIL_DEFAULT_PX);
    const [tenantFieldDefinitions, setTenantFieldDefinitions] = useState<
        import("@/lib/layout/tenantLayoutFieldPickerCatalog").TenantFieldDefinitionRow[]
    >([]);

    useEffect(() => {
        setInspectorRailWidth(readLayoutBuilderInspectorRailWidth());
    }, []);

    const advancedHref = `${basePath}?editor=1&layout=${encodeURIComponent(layoutId)}&advanced=1`;

    const surfaceConfig = useMemo(() => getDrawerLayoutEditorSurfaceConfig(surfaceKey), [surfaceKey]);

    const validation = useMemo(
        () =>
            workingDoc ?
                validateDrawerLayoutDoc(workingDoc, surfaceKey, { tenantFieldDefinitions })
            :   { ok: true, errors: [], warnings: [] },
        [workingDoc, surfaceKey, tenantFieldDefinitions],
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

    const fieldPickerGroups = useMemo(
        () => surfaceConfig.buildFieldPickerGroups({ tenantFieldDefinitions }),
        [surfaceConfig, tenantFieldDefinitions],
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        setAutoRepairNotice(null);
        try {
            const [rec, catalogRes] = await Promise.all([
                fetchEntityLayoutRecord(layoutId),
                fetch("/api/admin/entity-layouts/field-catalog?entity_type=opportunities"),
            ]);
            const catalogJson =
                catalogRes.ok ?
                    ((await catalogRes.json()) as { tenantFieldDefinitions?: typeof tenantFieldDefinitions })
                :   null;
            setTenantFieldDefinitions(catalogJson?.tenantFieldDefinitions ?? []);
            const prepared = prepareDrawerLayoutDocForEditor(rec.doc);
            if (!prepared.ok) {
                throw new Error(formatDrawerLayoutValidationErrors(prepared.errors, surfaceKey).join("; ") || "Invalid layout document");
            }
            setSurfaceKey(prepared.surfaceKey);
            setForceAdvanced(false);
            setRecord(rec);
            setWorkingDoc(prepared.doc);
            setWorkingName(resolveLayoutStableTitle(rec.name));
            setDirty(prepared.autoRepaired);
            if (prepared.autoRepaired) {
                setAutoRepairNotice(
                    `Repaired ${prepared.repairs.length} legacy layout key${prepared.repairs.length === 1 ? "" : "s"}. Save draft to persist the fix.`,
                );
            } else {
                setDirty(false);
            }
            setSelectedSectionId(null);
            setSelectedFieldPath(null);
            setSelectedBlockId(null);
            setEditorMode("build");
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
    }, []);

    const scrollToSection = useCallback((sectionKey: string) => {
        requestAnimationFrame(() => {
            document
                .querySelector(`[data-testid="visual-editor-section-${sectionKey}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    }, []);

    const handleQuickStart = useCallback(
        (action: LayoutBuilderQuickStartAction) => {
            if (!workingDoc || surfaceKey !== "opportunity_drawer") return;
            const templateKey: OpportunityDrawerStarterTemplateKey =
                action === "template" ? "minimal_lead_overview"
                : action === "kpi_strip" ? "kpi_strip"
                : action === "contact_summary" ? "contact_summary"
                : "children_enrollment_list";
            const next = applyOpportunityDrawerStarterTemplate(workingDoc, templateKey);
            if (next === workingDoc) {
                setStudioNotice({
                    tone: "info",
                    message: "That pattern is already on this layout — select it on the canvas to edit.",
                });
                return;
            }
            const added = diffNewSectionKeys(workingDoc, next);
            applyDoc(next);
            const focusKey = added[added.length - 1] ?? next.sections[next.sections.length - 1]?.key;
            if (focusKey) {
                setSelectedSectionId(focusKey);
                scrollToSection(focusKey);
            }
            setStudioNotice({ tone: "success", message: "Added starter content — customize it in Properties." });
        },
        [workingDoc, applyDoc, scrollToSection, surfaceKey],
    );

    const canvasPreviewRecord = useMemo(() => {
        if (surfaceKey === "opportunity_drawer") return previewRecordState.record;
        return surfaceConfig.previewRecord;
    }, [surfaceKey, previewRecordState.record, surfaceConfig.previewRecord]);

    const clearItemSelection = useCallback(() => {
        setSelectedFieldPath(null);
        setSelectedBlockId(null);
    }, []);

    const clearAllSelection = useCallback(() => {
        setSelectedSectionId(null);
        clearItemSelection();
    }, [clearItemSelection]);

    const saveDraft = useCallback(async () => {
        if (!workingDoc || !record) return;
        const ready = ensureOpportunityDrawerLayoutDocSaveReady(workingDoc);
        const docToSave = ready.doc;
        const validationForSave = validateDrawerLayoutDoc(docToSave, surfaceKey);
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
        const validationForPublish = validateDrawerLayoutDoc(docToPublish, surfaceKey);
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
            if (surfaceKey === "person_drawer") {
                dispatchPersonDrawerLayoutPublished(published.doc);
            } else if (surfaceKey === "child_drawer") {
                dispatchChildDrawerLayoutPublished(published.doc);
            } else {
                dispatchOpportunityDrawerLayoutPublished(published.doc);
            }
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
    }, [record, dirty, workingName, workingDoc, onLayoutIdChange, surfaceKey]);

    const layoutVersionHint = useMemo(() => {
        if (!record) return "";
        return record.status === "published" ?
                formatLayoutPublishedTitleWithVersion(workingName, record.version)
            :   formatLayoutDraftTitleWithVersion(workingName, record.version);
    }, [record, workingName]);

    if (forceAdvanced) {
        return (
            <div className="space-y-3" data-testid="opportunity-drawer-visual-editor-fallback">
                <p className="text-xs text-alloy-midnight/55">
                    Visual editor could not load this layout document. Using advanced builder.
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

    const isBuild = editorMode === "build";

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4" data-testid="opportunity-drawer-visual-editor">
            <div
                className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-alloy-forge/10 bg-white/95 px-4 py-3 shadow-sm"
                data-testid="experience-builder-studio-toolbar"
            >
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={onBack}
                            className="text-xs font-medium text-alloy-pine hover:underline"
                            data-testid="experience-builder-back-to-gallery"
                        >
                            ← Gallery
                        </button>
                        <span className="text-alloy-midnight/25">·</span>
                        <h2 className="text-sm font-semibold text-alloy-midnight">
                            Experience Builder · {surfaceConfig.label}
                        </h2>
                    </div>
                    <input
                        type="text"
                        value={workingName}
                        onChange={(e) => {
                            setWorkingName(e.target.value);
                            setDirty(true);
                        }}
                        className="mt-1.5 w-full max-w-md rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1 text-sm"
                        aria-label="Layout name"
                        data-testid="experience-builder-layout-name"
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
                        {layoutVersionHint}
                        {actionState.statusLabel ? ` · ${actionState.statusLabel}` : ""}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <LayoutBuilderPreviewRecordSelector state={previewRecordState} />
                    <div
                        className="inline-flex rounded-lg border border-alloy-forge/20 bg-alloy-stone/20 p-0.5"
                        data-testid="visual-editor-build-preview-toggle"
                    >
                        <button
                            type="button"
                            onClick={() => setEditorMode("build")}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                                isBuild ? "bg-white text-alloy-midnight shadow-sm" : "text-alloy-midnight/55"
                            }`}
                            data-testid="visual-editor-mode-build"
                        >
                            Build
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setEditorMode("preview");
                                clearItemSelection();
                            }}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                                !isBuild ? "bg-white text-alloy-midnight shadow-sm" : "text-alloy-midnight/55"
                            }`}
                            data-testid="visual-editor-mode-preview"
                        >
                            Preview
                        </button>
                    </div>
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
                        href={basePath}
                        className="text-xs font-medium text-alloy-midnight/55 underline hover:text-alloy-pine"
                        data-testid="visual-editor-gallery-rollback-link"
                    >
                        Version history
                    </Link>
                    <Link
                        href={advancedHref}
                        className="text-xs font-medium text-alloy-midnight/55 underline hover:text-alloy-pine"
                        data-testid="visual-editor-advanced-builder-link"
                    >
                        Advanced
                    </Link>
                </div>
            </div>

            {autoRepairNotice ?
                <div
                    className="shrink-0 rounded-lg border border-alloy-pine/25 bg-alloy-pine/[0.08] px-3 py-2 text-sm text-alloy-midnight"
                    data-testid="visual-editor-auto-repair-notice"
                >
                    {autoRepairNotice}
                </div>
            :   null}

            {error ?
                <div className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            :   null}

            {!validation.ok ?
                <div
                    className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    data-testid="visual-editor-validation-errors"
                >
                    <p className="font-semibold">Fix validation issues before saving:</p>
                    <ul className="mt-1 list-inside list-disc text-xs">
                        {formatDrawerLayoutValidationErrors(validation.errors, surfaceKey).map((msg) => (
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

            <div
                className={`grid min-h-0 flex-1 gap-3 overflow-hidden ${isBuild ? "" : "grid-cols-1"}`}
                style={
                    isBuild ?
                        { gridTemplateColumns: `minmax(280px, 300px) minmax(0, 1fr) ${inspectorRailWidth}px` }
                    :   undefined
                }
                data-testid="layout-builder-studio-grid"
            >
                {isBuild && studioNotice ?
                    <div
                        className={`col-span-full rounded-lg border px-3 py-2 text-xs ${
                            studioNotice.tone === "error" ? "border-red-200 bg-red-50 text-red-800"
                            : studioNotice.tone === "success" ? "border-alloy-pine/25 bg-alloy-pine/[0.08] text-alloy-midnight"
                            : "border-alloy-pine/20 bg-alloy-pine/[0.06] text-alloy-midnight/75"
                        }`}
                        data-testid="layout-builder-studio-notice"
                    >
                        {studioNotice.message}
                    </div>
                :   null}
                {isBuild ?
                    <LayoutBuilderPalettePanel
                        doc={workingDoc}
                        selectedSectionId={selectedSectionId}
                        fieldPickerGroups={fieldPickerGroups}
                        validationOk={validation.ok}
                        studioNotice={studioNotice}
                        applyDoc={applyDoc}
                        onSelectSection={setSelectedSectionId}
                        onSelectItem={(sectionKey, itemId) => {
                            setSelectedSectionId(sectionKey);
                            setSelectedFieldPath(`field:${sectionKey}:${itemId}`);
                            setSelectedBlockId(null);
                        }}
                        onStudioNotice={setStudioNotice}
                        onScrollToSection={scrollToSection}
                        surfaceKey={surfaceKey}
                    />
                :   null}

                <div className={`relative min-h-0 min-w-0 overflow-y-auto rounded-xl ${opCaseFileCanvas}`} data-testid="layout-builder-canvas-host">
                    <OpportunityDrawerLayoutEditorCanvas
                        doc={workingDoc}
                        surfaceKey={surfaceKey}
                        editorMode={editorMode}
                        selectedSectionId={selectedSectionId}
                        selectedFieldPath={selectedFieldPath}
                        onSelectSection={setSelectedSectionId}
                        onSelectFieldPath={setSelectedFieldPath}
                        onSelectBlockId={setSelectedBlockId}
                        applyDoc={applyDoc}
                        onQuickStart={surfaceKey === "opportunity_drawer" ? handleQuickStart : undefined}
                        previewRecord={canvasPreviewRecord}
                    />
                </div>

                {isBuild ?
                    <div className="relative min-h-0 min-w-0">
                        <LayoutBuilderInspectorResizeHandle onResize={setInspectorRailWidth} />
                        <LayoutBuilderInspectorPanel
                        doc={workingDoc}
                        selectedSectionId={selectedSectionId}
                        selectedFieldPath={selectedFieldPath}
                        selectedBlockId={selectedBlockId}
                        fieldPickerGroups={fieldPickerGroups}
                        validationOk={validation.ok}
                        applyDoc={applyDoc}
                        onFieldAddError={(message) =>
                            setStudioNotice(message ? { tone: "error", message } : null)
                        }
                        onClearSelection={clearAllSelection}
                        onClearItemSelection={clearItemSelection}
                        onSelectItem={(itemId) => {
                            if (selectedSectionId && itemId) {
                                setSelectedFieldPath(`field:${selectedSectionId}:${itemId}`);
                                setSelectedBlockId(null);
                            } else {
                                clearItemSelection();
                            }
                        }}
                        layoutRecordId={record.id}
                        layoutVersion={record.version}
                        surfaceKey={surfaceKey}
                    />
                    </div>
                :   null}
            </div>
        </div>
    );
}
