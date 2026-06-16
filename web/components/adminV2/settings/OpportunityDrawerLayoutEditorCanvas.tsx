"use client";

import { useMemo } from "react";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import OpportunityDrawerLayoutFieldPicker from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldPicker";
import type { LayoutCatalogField, LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import {
    buildSingleSectionPreviewDoc,
    isSectionEditorHidden,
    listSectionTopLevelItems,
    partitionOpportunityDrawerSectionsByZone,
    removeLayoutItem,
    renameSectionTitle,
    reorderLayoutItemInColumn,
    reorderSectionInZone,
    resolveOpportunityDrawerSectionZone,
    setSectionEditorHidden,
    tryAddFieldRefToSection,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import {
    resolveLayoutEditorFieldHierarchy,
    resolveLayoutEditorItemDisplayLabel,
} from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
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
import { leadOverviewCompositionHints, partitionLeadOverviewBodySections } from "@/lib/layout/runtime/leadOverviewComposition";
import { LayoutRuntimeCompositionProvider } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import { LAYOUT_DRAWER_PREVIEW_RECORD } from "@/lib/layout/runtime/layoutDrawerPreviewRecord";

type SectionHandlers = {
    onRename: (sectionKey: string, title: string) => void;
    onToggleHidden: (sectionKey: string, hidden: boolean) => void;
    onMove: (sectionKey: string, direction: -1 | 1) => void;
    onRemoveItem: (itemId: string) => void;
    onReorderItem: (itemId: string, direction: -1 | 1) => void;
    onAddField: (sectionKey: string, field: LayoutCatalogField) => void;
};

type Props = {
    doc: LayoutDoc;
    editingSectionKey: string | null;
    settingsSectionKey: string | null;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    fieldAddError: string | null;
    onEditSection: (sectionKey: string | null) => void;
    onSectionSettings: (sectionKey: string | null) => void;
    onFieldAddError: (message: string | null) => void;
    applyDoc: (next: LayoutDoc) => void;
};

function SectionPreviewBody({ doc, sectionKey, hidden }: { doc: LayoutDoc; sectionKey: string; hidden: boolean }) {
    const sectionDoc = useMemo(() => buildSingleSectionPreviewDoc(doc, sectionKey), [doc, sectionKey]);
    if (!sectionDoc || hidden) {
        return (
            <p className="px-3 py-6 text-xs text-alloy-midnight/45" data-testid={`visual-editor-section-hidden-${sectionKey}`}>
                Hidden after publish — turn visibility back on in section settings.
            </p>
        );
    }

    return (
        <LayoutRuntimeCompositionProvider value={leadOverviewCompositionHints()}>
            <div className={sectionKey === "lead_summary" ? DRAWER_OVERVIEW_SUMMARY_STRIP_HOST_CLASS : undefined}>
                <LayoutRuntimePlanView doc={sectionDoc} record={LAYOUT_DRAWER_PREVIEW_RECORD} variant="production" />
            </div>
        </LayoutRuntimeCompositionProvider>
    );
}

function InlineSectionEditor({
    doc,
    section,
    fieldPickerGroups,
    validationOk,
    fieldAddError,
    onClose,
    onFieldAddError,
    handlers,
}: {
    doc: LayoutDoc;
    section: LayoutSection;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    fieldAddError: string | null;
    onClose: () => void;
    onFieldAddError: (message: string | null) => void;
    handlers: SectionHandlers;
}) {
    const items = listSectionTopLevelItems(doc, section.key);

    return (
        <div
            className="border-t border-alloy-pine/15 bg-alloy-pine/[0.03] px-3 py-3"
            data-testid="visual-editor-inline-section-editor"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Editing section</p>
                <button type="button" className="text-[11px] font-medium text-alloy-midnight/55 hover:text-alloy-pine" onClick={onClose}>
                    Done
                </button>
            </div>

            <label className="block text-xs text-alloy-midnight/60">
                Section label
                <input
                    type="text"
                    value={section.title}
                    onChange={(e) => handlers.onRename(section.key, e.target.value)}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-sm"
                    data-testid="visual-editor-section-title"
                />
            </label>

            <label className="mt-3 flex items-start gap-2 text-xs text-alloy-midnight/70">
                <input
                    type="checkbox"
                    checked={isSectionEditorHidden(section)}
                    onChange={(e) => handlers.onToggleHidden(section.key, e.target.checked)}
                    data-testid="visual-editor-section-hidden"
                    className="mt-0.5"
                />
                <span>
                    Hide section
                    <span className="mt-0.5 block text-[10px] font-normal text-alloy-midnight/45">
                        Hidden sections are omitted from the live drawer after publish.
                    </span>
                </span>
            </label>

            <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Fields & blocks</p>
                <ul className="mt-2 space-y-1">
                    {items.map(({ itemId, item }) => {
                        const hierarchy = item.kind === "field" ? resolveLayoutEditorFieldHierarchy(item.refKey) : null;
                        return (
                            <li
                                key={itemId}
                                className="flex items-center justify-between gap-2 rounded border border-alloy-forge/10 bg-white px-2 py-1.5 text-xs"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-medium text-alloy-midnight">
                                        {resolveLayoutEditorItemDisplayLabel(item)}
                                    </span>
                                    {hierarchy ?
                                        <span className="text-[10px] text-alloy-midnight/45">
                                            {hierarchy.entityLabel} · {hierarchy.fieldLabel}
                                        </span>
                                    :   null}
                                </span>
                                <span className="flex shrink-0 gap-0.5">
                                    <button
                                        type="button"
                                        className="px-1 text-alloy-midnight/50 hover:text-alloy-pine"
                                        aria-label="Move up"
                                        onClick={() => handlers.onReorderItem(itemId, -1)}
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        className="px-1 text-alloy-midnight/50 hover:text-alloy-pine"
                                        aria-label="Move down"
                                        onClick={() => handlers.onReorderItem(itemId, 1)}
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        className="px-1 text-red-500/70 hover:text-red-600"
                                        aria-label="Remove"
                                        onClick={() => handlers.onRemoveItem(itemId)}
                                    >
                                        ✕
                                    </button>
                                </span>
                            </li>
                        );
                    })}
                </ul>

                <div className="mt-3">
                    <OpportunityDrawerLayoutFieldPicker
                        groups={fieldPickerGroups}
                        disabled={!validationOk}
                        onPickField={(field) => handlers.onAddField(section.key, field)}
                    />
                    {fieldAddError ?
                        <p className="mt-1 text-[10px] text-red-600" data-testid="visual-editor-field-add-error">
                            {fieldAddError}
                        </p>
                    :   null}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    className="rounded border border-alloy-forge/20 bg-white px-2 py-1 text-[10px] font-medium"
                    onClick={() => handlers.onMove(section.key, -1)}
                    data-testid="visual-editor-section-move-up"
                >
                    Move up
                </button>
                <button
                    type="button"
                    className="rounded border border-alloy-forge/20 bg-white px-2 py-1 text-[10px] font-medium"
                    onClick={() => handlers.onMove(section.key, 1)}
                    data-testid="visual-editor-section-move-down"
                >
                    Move down
                </button>
            </div>
        </div>
    );
}

function EditableSectionFrame({
    doc,
    section,
    editingSectionKey,
    settingsSectionKey,
    fieldPickerGroups,
    validationOk,
    fieldAddError,
    onEditSection,
    onSectionSettings,
    onFieldAddError,
    handlers,
}: {
    doc: LayoutDoc;
    section: LayoutSection;
    editingSectionKey: string | null;
    settingsSectionKey: string | null;
    fieldPickerGroups: LayoutCatalogGroup[];
    validationOk: boolean;
    fieldAddError: string | null;
    onEditSection: (sectionKey: string | null) => void;
    onSectionSettings: (sectionKey: string | null) => void;
    onFieldAddError: (message: string | null) => void;
    handlers: SectionHandlers;
}) {
    const hidden = isSectionEditorHidden(section);
    const isEditing = editingSectionKey === section.key;
    const isSettings = settingsSectionKey === section.key;
    const zone = resolveOpportunityDrawerSectionZone(section);

    return (
        <div
            className={`group relative rounded-lg border bg-white transition ${
                isEditing ?
                    "border-alloy-pine/40 ring-2 ring-alloy-pine/20"
                : isSettings ?
                    "border-alloy-blue/30 ring-1 ring-alloy-blue/15"
                :   "border-transparent hover:border-alloy-pine/20 hover:ring-1 hover:ring-alloy-pine/10"
            } ${hidden ? "opacity-60" : ""}`}
            data-testid={`visual-editor-section-${section.key}`}
            data-visual-editor-editable="true"
            data-visual-editor-zone={zone}
        >
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end gap-1 p-2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <div className="pointer-events-auto flex flex-wrap justify-end gap-1 rounded-md border border-alloy-forge/10 bg-white/95 p-1 shadow-sm">
                    <button
                        type="button"
                        className="rounded px-2 py-0.5 text-[10px] font-semibold text-alloy-pine hover:bg-alloy-pine/10"
                        onClick={() => onEditSection(isEditing ? null : section.key)}
                        data-testid={`visual-editor-section-edit-${section.key}`}
                    >
                        {isEditing ? "Close" : "Edit"}
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
                        onClick={() => onEditSection(section.key)}
                    >
                        Add field
                    </button>
                    <button
                        type="button"
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/65 hover:bg-alloy-stone/40"
                        onClick={() => handlers.onMove(section.key, -1)}
                    >
                        Move ↑
                    </button>
                    <button
                        type="button"
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/65 hover:bg-alloy-stone/40"
                        onClick={() => handlers.onMove(section.key, 1)}
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

            <SectionPreviewBody doc={doc} sectionKey={section.key} hidden={hidden} />

            {isEditing ?
                <InlineSectionEditor
                    doc={doc}
                    section={section}
                    fieldPickerGroups={fieldPickerGroups}
                    validationOk={validationOk}
                    fieldAddError={fieldAddError}
                    onClose={() => onEditSection(null)}
                    onFieldAddError={onFieldAddError}
                    handlers={handlers}
                />
            :   null}
        </div>
    );
}

export default function OpportunityDrawerLayoutEditorCanvas({
    doc,
    editingSectionKey,
    settingsSectionKey,
    fieldPickerGroups,
    validationOk,
    fieldAddError,
    onEditSection,
    onSectionSettings,
    onFieldAddError,
    applyDoc,
}: Props) {
    const slots = partitionLeadOverviewBodySections(doc);
    const zones = partitionOpportunityDrawerSectionsByZone(doc);
    const summarySections = zones.summary_strip;

    const handlers: SectionHandlers = {
        onRename: (key, title) => applyDoc(renameSectionTitle(doc, key, title)),
        onToggleHidden: (key, hidden) => applyDoc(setSectionEditorHidden(doc, key, hidden)),
        onMove: (key, direction) => applyDoc(reorderSectionInZone(doc, key, direction)),
        onRemoveItem: (itemId) => applyDoc(removeLayoutItem(doc, itemId)),
        onReorderItem: (itemId, direction) => applyDoc(reorderLayoutItemInColumn(doc, itemId, direction)),
        onAddField: (key, field) => {
            const result = tryAddFieldRefToSection(doc, key, field.refKey, field.fieldLabel);
            if (!result.ok) {
                onFieldAddError(result.error);
                return;
            }
            applyDoc(result.doc);
            onFieldAddError(null);
        },
    };

    const renderSection = (section: LayoutSection | null) => {
        if (!section) return null;
        return (
            <EditableSectionFrame
                key={section.key}
                doc={doc}
                section={section}
                editingSectionKey={editingSectionKey}
                settingsSectionKey={settingsSectionKey}
                fieldPickerGroups={fieldPickerGroups}
                validationOk={validationOk}
                fieldAddError={fieldAddError}
                onEditSection={onEditSection}
                onSectionSettings={onSectionSettings}
                onFieldAddError={onFieldAddError}
                handlers={handlers}
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
                    {summarySections.map((section) => renderSection(section))}
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
                    {zones.right_rail.map((section) => renderSection(section))}
                </div>
            </div>

            {slots.leadSource ?
                <div className={DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS}>{renderSection(slots.leadSource)}</div>
            :   null}

            {overflowSections.length > 0 ?
                <div className={DRAWER_OVERVIEW_OVERFLOW_STACK_CLASS} data-visual-editor-zone-main-overflow="">
                    {overflowSections.map((section) => renderSection(section))}
                </div>
            :   null}
        </div>
    );
}
