"use client";

import { useMemo } from "react";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import LayoutEditorSectionFlowView from "@/components/layout/LayoutEditorSectionFlowView";
import OpportunityDrawerLayoutCompositionPanel from "@/components/adminV2/settings/OpportunityDrawerLayoutCompositionPanel";
import type { LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import {
    buildSingleSectionPreviewDoc,
    isSectionEditorHidden,
    partitionOpportunityDrawerSectionsByZone,
    renameSectionTitle,
    reorderSectionInZone,
    resolveOpportunityDrawerSectionZone,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { readSectionType } from "@/lib/layout/layoutEditorSectionLayout";
import { LEAD_OVERVIEW_SECTION_KEYS } from "@/lib/layout/runtime/leadOverviewComposition";
import { listSectionLayoutBlocks } from "@/lib/layout/layoutEditorCompositionModel";
import { buildLayoutEditorItemIdPathIndex } from "@/lib/layout/layoutEditorInspectModel";
import { LayoutEditorRuntimeTraceProvider } from "@/lib/layout/layoutEditorRuntimeTraceContext";
import {
    DRAWER_OVERVIEW_CANVAS_CLASS,
    DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS,
    DRAWER_OVERVIEW_LEFT_COLUMN_CLASS,
    DRAWER_OVERVIEW_MAIN_COLUMN_CLASS,
    DRAWER_OVERVIEW_OVERFLOW_STACK_CLASS,
    DRAWER_OVERVIEW_RIGHT_RAIL_CLASS,
    DRAWER_OVERVIEW_SHELL_GRID_CLASS,
    DRAWER_OVERVIEW_SUMMARY_STRIP_HOST_CLASS,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { leadOverviewVisualEditorCompositionHints, partitionLeadOverviewBodySections } from "@/lib/layout/runtime/leadOverviewComposition";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";

type Props = {
    doc: LayoutDoc;
    editingSectionKey: string | null;
    settingsSectionKey: string | null;
    selectedFieldPath: string | null;
    selectedBlockId: string | null;
    inspectMode: boolean;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    fieldAddError: string | null;
    onEditSection: (sectionKey: string | null) => void;
    onSectionSettings: (sectionKey: string | null) => void;
    onSelectFieldPath: (path: string | null) => void;
    onSelectBlockId: (blockId: string | null) => void;
    onFieldAddError: (message: string | null) => void;
    applyDoc: (next: LayoutDoc) => void;
    layoutRecordId?: string | null;
    layoutVersion?: number | null;
};

function SectionPreviewBody({
    doc,
    sectionKey,
    hidden,
    traceEnabled,
    inspectMode,
    selectedFieldPath,
    onSelectFieldPath,
}: {
    doc: LayoutDoc;
    sectionKey: string;
    hidden: boolean;
    traceEnabled: boolean;
    inspectMode: boolean;
    selectedFieldPath: string | null;
    onSelectFieldPath: (path: string | null) => void;
}) {
    const sectionDoc = useMemo(() => buildSingleSectionPreviewDoc(doc, sectionKey), [doc, sectionKey]);
    const traceValue = useMemo(() => {
        const blocks = listSectionLayoutBlocks(doc, sectionKey);
        const { byItemId, byRefKey } = buildLayoutEditorItemIdPathIndex(blocks);
        return {
            enabled: traceEnabled,
            inspectMode,
            byItemId,
            byRefKey,
            selectedPath: selectedFieldPath,
            onSelectPath: (path: string | null) => {
                onSelectFieldPath(path);
            },
        };
    }, [doc, sectionKey, traceEnabled, inspectMode, selectedFieldPath, onSelectFieldPath]);

    if (!sectionDoc || hidden) {
        return (
            <p className="px-3 py-6 text-xs text-alloy-midnight/45" data-testid={`visual-editor-section-hidden-${sectionKey}`}>
                Hidden after publish — turn visibility back on in section settings.
            </p>
        );
    }

    return (
        <LayoutEditorRuntimeTraceProvider value={traceValue}>
            <LayoutRuntimeCompositionProvider value={leadOverviewVisualEditorCompositionHints()}>
                <div className={sectionKey === "lead_summary" ? DRAWER_OVERVIEW_SUMMARY_STRIP_HOST_CLASS : undefined}>
                    <LayoutRuntimePlanView doc={sectionDoc} record={LAYOUT_DRAWER_PREVIEW_RECORD} variant="production" />
                </div>
            </LayoutRuntimeCompositionProvider>
        </LayoutEditorRuntimeTraceProvider>
    );
}

function EditableSectionFrame({
    doc,
    section,
    editingSectionKey,
    settingsSectionKey,
    selectedFieldPath,
    selectedBlockId,
    inspectMode,
    fieldPickerGroups,
    validationOk,
    fieldAddError,
    onEditSection,
    onSectionSettings,
    onSelectFieldPath,
    onSelectBlockId,
    onFieldAddError,
    applyDoc,
    layoutRecordId,
    layoutVersion,
}: {
    doc: LayoutDoc;
    section: LayoutSection;
    editingSectionKey: string | null;
    settingsSectionKey: string | null;
    selectedFieldPath: string | null;
    selectedBlockId: string | null;
    inspectMode: boolean;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    fieldAddError: string | null;
    onEditSection: (sectionKey: string | null) => void;
    onSectionSettings: (sectionKey: string | null) => void;
    onSelectFieldPath: (path: string | null) => void;
    onSelectBlockId: (blockId: string | null) => void;
    onFieldAddError: (message: string | null) => void;
    applyDoc: (next: LayoutDoc) => void;
    layoutRecordId?: string | null;
    layoutVersion?: number | null;
}) {
    const hidden = isSectionEditorHidden(section);
    const isEditing = editingSectionKey === section.key;
    const isSettings = settingsSectionKey === section.key;
    const zone = resolveOpportunityDrawerSectionZone(section);
    const sectionType = readSectionType(section);
    const isPlatformCompositionSlot =
        section.key === LEAD_OVERVIEW_SECTION_KEYS.household
        || section.key === LEAD_OVERVIEW_SECTION_KEYS.enrollment
        || section.key === LEAD_OVERVIEW_SECTION_KEYS.summary;
    const platformSlotLabel =
        section.key === LEAD_OVERVIEW_SECTION_KEYS.summary ?
            "Platform summary strip · contents editable, position fixed"
        :   "Platform composition slot · contents editable, position fixed";

    return (
        <div
            className={`group relative rounded-lg border bg-white transition ${
                isEditing ?
                    "border-alloy-pine/40 ring-2 ring-alloy-pine/20"
                : isSettings ?
                    "border-alloy-blue/30 ring-1 ring-alloy-blue/15"
                : isPlatformCompositionSlot ?
                    "border-alloy-stone/20 ring-1 ring-alloy-stone/10"
                :   "border-transparent hover:border-alloy-pine/20 hover:ring-1 hover:ring-alloy-pine/10"
            } ${hidden ? "opacity-60" : ""}`}
            data-testid={`visual-editor-section-${section.key}`}
            data-visual-editor-editable="true"
            data-visual-editor-zone={zone}
            data-visual-editor-section-type={sectionType}
            data-visual-editor-platform-slot={isPlatformCompositionSlot ? "true" : undefined}
        >
            <div className="border-b border-alloy-stone/10 bg-gradient-to-r from-white via-alloy-stone/[0.03] to-white px-3 py-1.5">
                {isPlatformCompositionSlot ?
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/40">
                        {platformSlotLabel}
                    </p>
                :   null}
                <input
                    type="text"
                    value={section.title}
                    onChange={(e) => applyDoc(renameSectionTitle(doc, section.key, e.target.value))}
                    className="w-full bg-transparent text-xs font-semibold text-alloy-midnight outline-none placeholder:text-alloy-midnight/35 focus:ring-0"
                    aria-label="Section title"
                    data-testid={`visual-editor-section-title-inline-${section.key}`}
                />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end gap-1 p-2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <div className="pointer-events-auto flex flex-wrap justify-end gap-1 rounded-md border border-alloy-forge/10 bg-white/95 p-1 shadow-sm">
                    <button
                        type="button"
                        className="rounded px-2 py-0.5 text-[10px] font-semibold text-alloy-pine hover:bg-alloy-pine/10"
                        onClick={() => {
                            onSelectFieldPath(null);
                            onSelectBlockId(null);
                            onEditSection(isEditing ? null : section.key);
                        }}
                        data-testid={`visual-editor-section-edit-${section.key}`}
                    >
                        {isEditing ? "Close" : "Configure"}
                    </button>
                    <button
                        type="button"
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/65 hover:bg-alloy-stone/40"
                        onClick={() => onSectionSettings(isSettings ? null : section.key)}
                        data-testid={`visual-editor-section-settings-${section.key}`}
                    >
                        Settings
                    </button>
                    <button
                        type="button"
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/65 hover:bg-alloy-stone/40"
                        onClick={() => applyDoc(reorderSectionInZone(doc, section.key, -1))}
                    >
                        Move ↑
                    </button>
                    <button
                        type="button"
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/65 hover:bg-alloy-stone/40"
                        onClick={() => applyDoc(reorderSectionInZone(doc, section.key, 1))}
                    >
                        Move ↓
                    </button>
                </div>
            </div>

            {hidden ?
                <div className="absolute left-2 top-2 z-10 rounded bg-alloy-stone/80 px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/55">
                    Hidden
                </div>
            :   null}

            <SectionPreviewBody
                doc={doc}
                sectionKey={section.key}
                hidden={hidden}
                traceEnabled={isEditing || inspectMode}
                inspectMode={inspectMode}
                selectedFieldPath={selectedFieldPath}
                onSelectFieldPath={(path) => {
                    onSelectFieldPath(path);
                    if (path) {
                        onEditSection(section.key);
                        onSelectBlockId(null);
                    }
                }}
            />

            {isEditing ?
                <OpportunityDrawerLayoutCompositionPanel
                    doc={doc}
                    section={section}
                    fieldPickerGroups={fieldPickerGroups}
                    validationOk={validationOk}
                    selectedFieldPath={selectedFieldPath}
                    selectedBlockId={selectedBlockId}
                    onSelectFieldPath={onSelectFieldPath}
                    onSelectBlockId={onSelectBlockId}
                    onFieldAddError={onFieldAddError}
                    applyDoc={applyDoc}
                    onClose={() => onEditSection(null)}
                    layoutRecordId={layoutRecordId}
                    layoutVersion={layoutVersion}
                />
            :   null}
        </div>
    );
}

export default function OpportunityDrawerLayoutEditorCanvas({
    doc,
    editingSectionKey,
    settingsSectionKey,
    selectedFieldPath,
    selectedBlockId,
    inspectMode,
    fieldPickerGroups,
    validationOk,
    fieldAddError,
    onEditSection,
    onSectionSettings,
    onSelectFieldPath,
    onSelectBlockId,
    onFieldAddError,
    applyDoc,
    layoutRecordId,
    layoutVersion,
}: Props) {
    const slots = partitionLeadOverviewBodySections(doc);
    const zones = partitionOpportunityDrawerSectionsByZone(doc);
    const summarySections = zones.summary_strip;

    const renderSection = (section: LayoutSection | null) => {
        if (!section) return null;
        return (
            <EditableSectionFrame
                key={section.key}
                doc={doc}
                section={section}
                editingSectionKey={editingSectionKey}
                settingsSectionKey={settingsSectionKey}
                selectedFieldPath={selectedFieldPath}
                selectedBlockId={selectedBlockId}
                inspectMode={inspectMode}
                fieldPickerGroups={fieldPickerGroups}
                validationOk={validationOk}
                fieldAddError={fieldAddError}
                onEditSection={onEditSection}
                onSectionSettings={onSectionSettings}
                onSelectFieldPath={onSelectFieldPath}
                onSelectBlockId={onSelectBlockId}
                onFieldAddError={onFieldAddError}
                applyDoc={applyDoc}
                layoutRecordId={layoutRecordId}
                layoutVersion={layoutVersion}
            />
        );
    };

    const overflowSections = [
        ...(slots.notes ? [slots.notes] : []),
        ...(slots.activity ? [slots.activity] : []),
        ...slots.overflow,
    ];

    return (
        <div className={DRAWER_OVERVIEW_CANVAS_CLASS} data-testid="visual-editor-main-composition-grid">
            {summarySections.length > 0 ?
                <div data-visual-editor-zone="summary_strip" data-testid="visual-editor-zone-summary_strip" className="space-y-2">
                    <LayoutEditorSectionFlowView
                        sections={summarySections}
                        renderSection={renderSection}
                        stackClassName=""
                        rowClassName="min-w-0"
                        rowCellClassName="min-w-0"
                    />
                </div>
            :   null}

            <div className={DRAWER_OVERVIEW_SHELL_GRID_CLASS}>
                <div className={DRAWER_OVERVIEW_LEFT_COLUMN_CLASS} data-visual-editor-zone-main-household="">
                    {renderSection(slots.household)}
                </div>
                <div className={DRAWER_OVERVIEW_MAIN_COLUMN_CLASS} data-visual-editor-zone-main-enrollment="">
                    {renderSection(slots.enrollment)}
                </div>
                <div className={DRAWER_OVERVIEW_RIGHT_RAIL_CLASS} data-testid="visual-editor-zone-right_rail">
                    <LayoutEditorSectionFlowView
                        sections={zones.right_rail}
                        renderSection={renderSection}
                        stackClassName="space-y-2"
                        rowClassName="min-w-0"
                        rowCellClassName="min-w-0"
                    />
                </div>
            </div>

            {slots.leadSource ?
                <div className={DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS}>{renderSection(slots.leadSource)}</div>
            :   null}

            {overflowSections.length > 0 ?
                <div className={DRAWER_OVERVIEW_OVERFLOW_STACK_CLASS} data-visual-editor-zone-main-overflow="">
                    <LayoutEditorSectionFlowView
                        sections={overflowSections}
                        renderSection={renderSection}
                        stackClassName=""
                        rowClassName="min-w-0"
                        rowCellClassName="min-w-0"
                    />
                </div>
            :   null}

            {fieldAddError ?
                <p className="text-[11px] text-red-600" data-testid="visual-editor-field-add-error">
                    {fieldAddError}
                </p>
            :   null}
        </div>
    );
}
