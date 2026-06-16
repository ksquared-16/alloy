"use client";

/**
 * Visual layout editor — Opportunity Drawer (Phase 3).
 *
 * WYSIWYG-ish config-mode shell with sample preview data. Settings-only;
 * does not alter production drawer runtime.
 */

import OpportunityDrawerLayoutFieldPicker from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldPicker";
import { isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient } from "@/lib/layout/featureFlag";
import { useCallback, useEffect, useMemo, useState } from "react";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import LayoutConfigClient from "@/components/layout/LayoutConfigClient";
import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import {
    fetchEntityLayoutRecord,
    patchEntityLayoutDraft,
    publishEntityLayoutDraft,
} from "@/lib/layout/opportunityDrawerLayoutEditorApi";
import {
    addRegisteredSection,
    buildOpportunityDrawerPreviewDocs,
    buildSingleSectionPreviewDoc,
    formatLayoutValidationErrors,
    isOpportunityDrawerLayoutDoc,
    isSectionEditorHidden,
    listMissingRegisteredSections,
    listSectionTopLevelItems,
    OPPORTUNITY_DRAWER_LOCKED_SHELL_SLOTS,
    opportunityDrawerEditorFieldPickerOptions,
    partitionOpportunityDrawerSectionsByZone,
    removeLayoutItem,
    renameSectionTitle,
    reorderLayoutItemInColumn,
    reorderSectionInZone,
    resolveVisualEditorActionState,
    setSectionEditorHidden,
    tryAddFieldRefToSection,
    validateOpportunityDrawerLayoutDoc,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import Link from "next/link";
import {
    DRAWER_OVERVIEW_CANVAS_CLASS,
    DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS,
    DRAWER_OVERVIEW_LEFT_COLUMN_CLASS,
    DRAWER_OVERVIEW_MAIN_COLUMN_CLASS,
    DRAWER_OVERVIEW_RIGHT_RAIL_CLASS,
    DRAWER_OVERVIEW_SHELL_GRID_CLASS,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { LEAD_OVERVIEW_SECTION_KEYS } from "@/lib/layout/runtime/leadOverviewComposition";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";
import type { OpportunityDrawerLayoutZone, OpportunityDrawerSectionKey } from "@/lib/layout/surfaceLayoutRegistry";

const MAIN_GRID_SLOT_KEYS = {
    household: LEAD_OVERVIEW_SECTION_KEYS.household,
    enrollment: LEAD_OVERVIEW_SECTION_KEYS.enrollment,
    leadSource: LEAD_OVERVIEW_SECTION_KEYS.leadSource,
} as const;

function SectionCardsInZone({
    sections,
    doc,
    selectedSectionKey,
    onSelectSection,
}: {
    sections: import("@/lib/layout/layoutV2").LayoutSection[];
    doc: LayoutDoc;
    selectedSectionKey: string | null;
    onSelectSection: (key: string) => void;
}) {
    if (!sections.length) {
        return (
            <p className="rounded-lg border border-dashed border-alloy-forge/15 px-2 py-3 text-[10px] text-alloy-midnight/45">
                No sections
            </p>
        );
    }
    return (
        <div className="space-y-2">
            {sections.map((section) => (
                <SectionPreviewCard
                    key={section.key}
                    doc={doc}
                    sectionKey={section.key}
                    selected={selectedSectionKey === section.key}
                    hidden={isSectionEditorHidden(section)}
                    onSelect={() => onSelectSection(section.key)}
                />
            ))}
        </div>
    );
}

function MainBodyCompositionPreview({
    doc,
    selectedSectionKey,
    onSelectSection,
}: {
    doc: LayoutDoc;
    selectedSectionKey: string | null;
    onSelectSection: (key: string) => void;
}) {
    const zones = partitionOpportunityDrawerSectionsByZone(doc);
    const household = zones.main.find((s) => s.key === MAIN_GRID_SLOT_KEYS.household) ?? null;
    const enrollment = zones.main.find((s) => s.key === MAIN_GRID_SLOT_KEYS.enrollment) ?? null;
    const leadSource = zones.main.find((s) => s.key === MAIN_GRID_SLOT_KEYS.leadSource) ?? null;
    const otherMain = zones.main.filter(
        (s) =>
            s.key !== MAIN_GRID_SLOT_KEYS.household &&
            s.key !== MAIN_GRID_SLOT_KEYS.enrollment &&
            s.key !== MAIN_GRID_SLOT_KEYS.leadSource,
    );

    return (
        <div className={DRAWER_OVERVIEW_CANVAS_CLASS} data-testid="visual-editor-main-composition-grid">
            <div className={DRAWER_OVERVIEW_SHELL_GRID_CLASS}>
                <div className={DRAWER_OVERVIEW_LEFT_COLUMN_CLASS} data-visual-editor-zone-main-household="">
                    <SectionCardsInZone
                        sections={household ? [household] : []}
                        doc={doc}
                        selectedSectionKey={selectedSectionKey}
                        onSelectSection={onSelectSection}
                    />
                </div>
                <div className={DRAWER_OVERVIEW_MAIN_COLUMN_CLASS} data-visual-editor-zone-main-enrollment="">
                    <SectionCardsInZone
                        sections={enrollment ? [enrollment] : []}
                        doc={doc}
                        selectedSectionKey={selectedSectionKey}
                        onSelectSection={onSelectSection}
                    />
                </div>
                <div className={DRAWER_OVERVIEW_RIGHT_RAIL_CLASS} data-testid="visual-editor-zone-right_rail">
                    <SectionCardsInZone
                        sections={zones.right_rail}
                        doc={doc}
                        selectedSectionKey={selectedSectionKey}
                        onSelectSection={onSelectSection}
                    />
                </div>
            </div>
            {leadSource ?
                <div className={DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS}>
                    <SectionPreviewCard
                        doc={doc}
                        sectionKey={leadSource.key}
                        selected={selectedSectionKey === leadSource.key}
                        hidden={isSectionEditorHidden(leadSource)}
                        onSelect={() => onSelectSection(leadSource.key)}
                    />
                </div>
            :   null}
            {otherMain.length > 0 ?
                <div className="space-y-2" data-visual-editor-zone-main-overflow="">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Additional main sections
                    </p>
                    <SectionCardsInZone
                        sections={otherMain}
                        doc={doc}
                        selectedSectionKey={selectedSectionKey}
                        onSelectSection={onSelectSection}
                    />
                </div>
            :   null}
        </div>
    );
}

type Props = {
    layoutId: string;
    basePath: string;
    onBack: () => void;
};

const ZONE_LABELS: Record<OpportunityDrawerLayoutZone, string> = {
    summary_strip: "Summary strip",
    main: "Main body",
    right_rail: "Right rail",
    footer_actions: "Footer actions",
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

function SectionPreviewCard({
    doc,
    sectionKey,
    selected,
    hidden,
    onSelect,
}: {
    doc: LayoutDoc;
    sectionKey: string;
    selected: boolean;
    hidden: boolean;
    onSelect: () => void;
}) {
    const sectionDoc = useMemo(() => buildSingleSectionPreviewDoc(doc, sectionKey), [doc, sectionKey]);
    const section = doc.sections.find((s) => s.key === sectionKey);
    if (!section || !sectionDoc) return null;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full rounded-lg border text-left transition ${
                selected ?
                    "border-alloy-pine/40 bg-alloy-pine/[0.04] ring-1 ring-alloy-pine/20"
                :   "border-alloy-forge/15 bg-white hover:border-alloy-pine/25"
            } ${hidden ? "opacity-50" : ""}`}
            data-testid={`visual-editor-section-${sectionKey}`}
            data-visual-editor-editable="true"
        >
            <div className="flex items-center justify-between gap-2 border-b border-alloy-forge/10 px-3 py-2">
                <span className="text-xs font-semibold text-alloy-midnight">{section.title}</span>
                <span className="flex items-center gap-2">
                    {hidden ?
                        <span className="rounded bg-alloy-stone/70 px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/50">
                            Hidden
                        </span>
                    :   null}
                    <span className="rounded bg-alloy-pine/10 px-1.5 py-0.5 text-[10px] font-medium text-alloy-pine">Editable</span>
                </span>
            </div>
            <div className="max-h-64 overflow-hidden p-2">
                {hidden ?
                    <p className="px-2 py-4 text-xs text-alloy-midnight/45">Hidden in layout preview</p>
                :   <LayoutRuntimePlanView doc={sectionDoc} record={LAYOUT_DRAWER_PREVIEW_RECORD} variant="preview" />}
            </div>
        </button>
    );
}

function ZoneEditorColumn({
    zone,
    doc,
    selectedSectionKey,
    onSelectSection,
}: {
    zone: OpportunityDrawerLayoutZone;
    doc: LayoutDoc;
    selectedSectionKey: string | null;
    onSelectSection: (key: string) => void;
}) {
    const sections = partitionOpportunityDrawerSectionsByZone(doc)[zone];

    if (zone === "footer_actions") {
        return (
            <LockedShellBand slot="footer_actions" label={ZONE_LABELS.footer_actions}>
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
        );
    }

    return (
        <div className="space-y-2" data-testid={`visual-editor-zone-${zone}`}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    {ZONE_LABELS[zone]}
                </span>
                <span className="text-[10px] text-alloy-midnight/40">Editable sections</span>
            </div>
            {sections.length === 0 ?
                <p className="rounded-lg border border-dashed border-alloy-forge/15 px-3 py-4 text-xs text-alloy-midnight/45">
                    No sections in this zone.
                </p>
            :   sections.map((section) => (
                    <SectionPreviewCard
                        key={section.key}
                        doc={doc}
                        sectionKey={section.key}
                        selected={selectedSectionKey === section.key}
                        hidden={isSectionEditorHidden(section)}
                        onSelect={() => onSelectSection(section.key)}
                    />
                ))
            }
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
    const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);
    const [addFieldRef, setAddFieldRef] = useState("");
    const [fieldAddError, setFieldAddError] = useState<string | null>(null);
    const [forceAdvanced, setForceAdvanced] = useState(false);

    const advancedHref = `${basePath}?editor=1&layout=${encodeURIComponent(layoutId)}&advanced=1`;

    const validation = useMemo(
        () => (workingDoc ? validateOpportunityDrawerLayoutDoc(workingDoc) : { ok: true, errors: [], warnings: [] }),
        [workingDoc],
    );

    const previewDocs = useMemo(
        () => (workingDoc ? buildOpportunityDrawerPreviewDocs(workingDoc) : null),
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

    const fieldPickerOptions = useMemo(() => opportunityDrawerEditorFieldPickerOptions(), []);

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
            setSelectedSectionKey(parsed.doc.sections[0]?.key ?? null);
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
            <div className="rounded-xl border border-alloy-forge/12 bg-white/90 p-6 text-sm text-alloy-midnight/55" data-testid="opportunity-drawer-visual-editor-loading">
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

    const selectedSection = workingDoc.sections.find((s) => s.key === selectedSectionKey) ?? null;
    const selectedItems = selectedSectionKey ? listSectionTopLevelItems(workingDoc, selectedSectionKey) : [];

    return (
        <div className="space-y-4" data-testid="opportunity-drawer-visual-editor">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-alloy-forge/12 bg-white/95 p-4 shadow-sm">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">Opportunity Drawer layout</h2>
                    <p className="mt-0.5 text-xs text-alloy-midnight/50">
                        Edit sections and fields inside the drawer shell · sample preview data
                    </p>
                    {isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient() ?
                        <p
                            className="mt-1 rounded-md border border-alloy-pine/20 bg-alloy-pine/[0.06] px-2 py-1 text-[11px] text-alloy-midnight/70"
                            data-testid="visual-editor-live-publish-notice"
                        >
                            <strong>Live drawer:</strong> publishing this layout updates the opportunity drawer for your org
                            (section visibility, order, and fields in supported sections).
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

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="overflow-hidden rounded-xl border border-alloy-forge/15 bg-[#F6F8FC] shadow-sm max-w-[720px]" data-testid="visual-editor-drawer-frame">
                    <LockedShellBand slot="header" label="Drawer header">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-alloy-midnight">{String(LAYOUT_DRAWER_PREVIEW_RECORD.name ?? "Sample household")}</p>
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

                        <ZoneEditorColumn
                            zone="summary_strip"
                            doc={workingDoc}
                            selectedSectionKey={selectedSectionKey}
                            onSelectSection={setSelectedSectionKey}
                        />

                        <MainBodyCompositionPreview
                            doc={workingDoc}
                            selectedSectionKey={selectedSectionKey}
                            onSelectSection={setSelectedSectionKey}
                        />

                        <ZoneEditorColumn
                            zone="footer_actions"
                            doc={workingDoc}
                            selectedSectionKey={selectedSectionKey}
                            onSelectSection={setSelectedSectionKey}
                        />
                    </div>
                </div>

                <aside className="rounded-xl border border-alloy-forge/12 bg-white/95 p-4 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">Section editor</h3>
                    {!selectedSection ?
                        <p className="mt-3 text-xs text-alloy-midnight/45">Select a section in the drawer preview.</p>
                    :   (
                        <div className="mt-3 space-y-4">
                            <label className="block text-xs text-alloy-midnight/60">
                                Section label
                                <input
                                    type="text"
                                    value={selectedSection.title}
                                    onChange={(e) => applyDoc(renameSectionTitle(workingDoc, selectedSection.key, e.target.value))}
                                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-sm"
                                    data-testid="visual-editor-section-title"
                                />
                            </label>

                            <label className="flex items-center gap-2 text-xs text-alloy-midnight/70">
                                <input
                                    type="checkbox"
                                    checked={isSectionEditorHidden(selectedSection)}
                                    onChange={(e) =>
                                        applyDoc(setSectionEditorHidden(workingDoc, selectedSection.key, e.target.checked))
                                    }
                                    data-testid="visual-editor-section-hidden"
                                />
                                Hide section
                                <span className="block text-[10px] font-normal text-alloy-midnight/45">
                                    {isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient() ?
                                        "Hidden sections are omitted from the live drawer after you publish."
                                    :   "Saved to draft; enable layout runtime adoption to apply live."}
                                </span>
                            </label>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className="rounded border border-alloy-forge/20 px-2 py-1 text-[10px] font-medium"
                                    onClick={() => applyDoc(reorderSectionInZone(workingDoc, selectedSection.key, -1))}
                                    data-testid="visual-editor-section-move-up"
                                >
                                    Move up in zone
                                </button>
                                <button
                                    type="button"
                                    className="rounded border border-alloy-forge/20 px-2 py-1 text-[10px] font-medium"
                                    onClick={() => applyDoc(reorderSectionInZone(workingDoc, selectedSection.key, 1))}
                                    data-testid="visual-editor-section-move-down"
                                >
                                    Move down in zone
                                </button>
                            </div>

                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Fields & items</p>
                                <ul className="mt-2 space-y-1">
                                    {selectedItems.map(({ itemId, item }) => (
                                        <li
                                            key={itemId}
                                            className="flex items-center justify-between gap-1 rounded border border-alloy-forge/10 bg-alloy-stone/[0.03] px-2 py-1 text-xs"
                                        >
                                            <span className="truncate">{item.label || item.refKey}</span>
                                            <span className="flex shrink-0 gap-0.5">
                                                <button
                                                    type="button"
                                                    className="px-1 text-alloy-midnight/50 hover:text-alloy-pine"
                                                    aria-label="Move up"
                                                    onClick={() => applyDoc(reorderLayoutItemInColumn(workingDoc, itemId, -1))}
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    type="button"
                                                    className="px-1 text-alloy-midnight/50 hover:text-alloy-pine"
                                                    aria-label="Move down"
                                                    onClick={() => applyDoc(reorderLayoutItemInColumn(workingDoc, itemId, 1))}
                                                >
                                                    ↓
                                                </button>
                                                <button
                                                    type="button"
                                                    className="px-1 text-red-500/70 hover:text-red-600"
                                                    aria-label="Remove"
                                                    onClick={() => applyDoc(removeLayoutItem(workingDoc, itemId))}
                                                >
                                                    ✕
                                                </button>
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="mt-3">
                                    <OpportunityDrawerLayoutFieldPicker
                                        options={fieldPickerOptions}
                                        value={addFieldRef}
                                        onChange={setAddFieldRef}
                                        disabled={!validation.ok}
                                        onAdd={() => {
                                            const result = tryAddFieldRefToSection(
                                                workingDoc,
                                                selectedSection.key,
                                                addFieldRef,
                                                addFieldRef.split(".").pop() ?? addFieldRef,
                                            );
                                            if (!result.ok) {
                                                setFieldAddError(result.error);
                                                return;
                                            }
                                            applyDoc(result.doc);
                                            setAddFieldRef("");
                                        }}
                                    />
                                    {fieldAddError ?
                                        <p className="text-[10px] text-red-600" data-testid="visual-editor-field-add-error">
                                            {fieldAddError}
                                        </p>
                                    :   null}
                                </div>
                            </div>
                        </div>
                    )}

                    {missingSections.length > 0 ?
                        <div className="mt-6 border-t border-alloy-forge/10 pt-4">
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
                                        + {key}
                                    </button>
                                ))}
                            </div>
                        </div>
                    :   null}

                    <p className="mt-6 text-[10px] text-alloy-midnight/40">
                        Locked slots: {OPPORTUNITY_DRAWER_LOCKED_SHELL_SLOTS.slice(0, 4).join(", ")}…
                    </p>
                </aside>
            </div>

            {previewDocs ?
                <details className="rounded-lg border border-alloy-forge/10 bg-white/80 px-3 py-2 text-xs text-alloy-midnight/50">
                    <summary className="cursor-pointer font-medium">Full drawer preview (sample data)</summary>
                    <div className="mt-3 rounded-lg border border-alloy-forge/10 bg-white p-3">
                        <LayoutRuntimePlanView
                            doc={{
                                ...workingDoc,
                                sections: [
                                    ...previewDocs.summaryDoc.sections,
                                    ...previewDocs.mainDoc.sections,
                                    ...previewDocs.rightRailDoc.sections,
                                ],
                            }}
                            record={LAYOUT_DRAWER_PREVIEW_RECORD}
                            variant="preview"
                        />
                    </div>
                </details>
            :   null}

            <button
                type="button"
                onClick={onBack}
                className="text-xs font-medium text-alloy-pine hover:underline"
            >
                ← Back to gallery
            </button>
        </div>
    );
}
