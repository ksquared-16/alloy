"use client";

import { useMemo } from "react";
import { createContext, useContext } from "react";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import LayoutEditorSectionFlowView from "@/components/layout/LayoutEditorSectionFlowView";
import LayoutBuilderPreviewDrawerFrame from "@/components/adminV2/settings/LayoutBuilderPreviewDrawerFrame";
import ExperienceBuilderEditableCardShell from "@/components/adminV2/settings/ExperienceBuilderEditableCardShell";
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
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { repackPeerCardsAfterZoneReorder } from "@/lib/layout/layoutBuilderPeerCardRows";
import { readCardWidthFraction } from "@/lib/layout/layoutBuilderCardWidth";
import { sectionIsKpiTile, sectionIsWidgetStrip, listSectionWidgetItems, widgetStripColumnCount } from "@/lib/layout/layoutBuilderWidgetStrip";
import { readLayoutEditorWidgetStyle, resolveLayoutEditorWidgetToneRailClass } from "@/lib/layout/layoutEditorWidgetStyle";

export type LayoutBuilderEditorMode = "build" | "preview";

export type LayoutBuilderQuickStartAction = "template" | "kpi_strip" | "contact_summary" | "children_list";

const LayoutBuilderPreviewRecordContext = createContext<ProofRuntimeRecord>(LAYOUT_DRAWER_PREVIEW_RECORD);

type Props = {
    doc: LayoutDoc;
    editorMode: LayoutBuilderEditorMode;
    selectedSectionId: string | null;
    selectedFieldPath: string | null;
    onSelectSection: (sectionKey: string | null) => void;
    onSelectFieldPath: (path: string | null) => void;
    onSelectBlockId: (blockId: string | null) => void;
    applyDoc: (next: LayoutDoc) => void;
    onQuickStart?: (action: LayoutBuilderQuickStartAction) => void;
    previewRecord?: ProofRuntimeRecord;
};

function SectionPreviewBody({
    doc,
    sectionKey,
    hidden,
    traceEnabled,
    selectedFieldPath,
    onSelectFieldPath,
    onSelectSection,
    editorMode = "build",
}: {
    doc: LayoutDoc;
    sectionKey: string;
    hidden: boolean;
    traceEnabled: boolean;
    selectedFieldPath: string | null;
    onSelectFieldPath: (path: string | null) => void;
    onSelectSection: (sectionKey: string) => void;
    editorMode?: LayoutBuilderEditorMode;
}) {
    const previewRecord = useContext(LayoutBuilderPreviewRecordContext);
    const sectionDoc = useMemo(() => buildSingleSectionPreviewDoc(doc, sectionKey), [doc, sectionKey]);
    const traceValue = useMemo(() => {
        const blocks = listSectionLayoutBlocks(doc, sectionKey);
        const { byItemId, byRefKey } = buildLayoutEditorItemIdPathIndex(sectionKey, blocks);
        return {
            enabled: traceEnabled,
            inspectMode: traceEnabled,
            byItemId,
            byRefKey,
            selectedPath: selectedFieldPath,
            onSelectPath: (path: string | null) => {
                onSelectFieldPath(path);
                if (path) onSelectSection(sectionKey);
            },
        };
    }, [doc, sectionKey, traceEnabled, selectedFieldPath, onSelectFieldPath, onSelectSection]);

    const widgets = useMemo(() => listSectionWidgetItems(doc, sectionKey), [doc, sectionKey]);
    const widgetColumnCount = useMemo(() => widgetStripColumnCount(doc, sectionKey), [doc, sectionKey]);
    const section = useMemo(() => doc.sections.find((s) => s.key === sectionKey) ?? null, [doc, sectionKey]);
    const sectionPresentation =
        section && (sectionIsKpiTile(section) || resolveOpportunityDrawerSectionZone(section) === "summary_strip") ?
            "summary_strip" as const
        :   "default" as const;
    const previewCompositionHints = useMemo(() => {
        const cardWidth = section ? readCardWidthFraction(section) : "full";
        const narrowCard = cardWidth === "quarter";
        const suppressRuntimeCardChrome = editorMode === "build" && sectionPresentation === "default";
        return leadOverviewVisualEditorCompositionHints({
            ...(section && sectionIsKpiTile(section) ? { summaryStripCompactRow: false } : {}),
            ...(suppressRuntimeCardChrome ?
                {
                    suppressDrawerOverviewSectionHeader: true,
                    suppressRelatedListPanelHeader: true,
                    stackFieldColumns: narrowCard,
                }
            :   {
                    stackFieldColumns: narrowCard,
                }),
        });
    }, [editorMode, section, sectionPresentation]);

    if (!sectionDoc || hidden) {
        return (
            <p className="px-3 py-6 text-xs text-alloy-midnight/45" data-testid={`visual-editor-section-hidden-${sectionKey}`}>
                Hidden after publish — turn visibility back on in Properties.
            </p>
        );
    }

    return (
        <LayoutEditorRuntimeTraceProvider value={traceValue}>
            <LayoutRuntimeCompositionProvider value={previewCompositionHints}>
                <div
                    className={`relative ${sectionKey === "lead_summary" ? DRAWER_OVERVIEW_SUMMARY_STRIP_HOST_CLASS : ""}`}
                >
                    <LayoutRuntimePlanView
                        doc={sectionDoc}
                        record={previewRecord}
                        variant="production"
                        sectionPresentation={sectionPresentation}
                    />
                    {traceEnabled && widgets.length > 0 && section && !sectionIsKpiTile(section) && !sectionIsWidgetStrip(section) ?
                        <div
                            className="pointer-events-none absolute inset-0 grid gap-2 p-1"
                            style={{ gridTemplateColumns: `repeat(${widgetColumnCount}, minmax(0, 1fr))` }}
                            data-testid={`visual-editor-widget-strip-overlay-${sectionKey}`}
                        >
                            {widgets.map((widget) => {
                                const path = `field:${sectionKey}:${widget.itemId}`;
                                const selected = selectedFieldPath === path;
                                const tone = readLayoutEditorWidgetStyle(widget.item.metadata).tone;
                                const railClass = resolveLayoutEditorWidgetToneRailClass(tone);
                                return (
                                    <button
                                        key={widget.itemId}
                                        type="button"
                                        className={`pointer-events-auto min-h-[3.5rem] rounded-xl border border-transparent border-l-[3px] transition-all ${railClass} ${
                                            selected ?
                                                "ring-2 ring-alloy-pine/35 bg-alloy-pine/[0.04]"
                                            :   "hover:ring-2 hover:ring-alloy-pine/20 hover:bg-white/40"
                                        }`}
                                        data-testid={`visual-editor-widget-select-${widget.itemId}`}
                                        data-layout-editor-widget-selected={selected ? "true" : undefined}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            traceValue.onSelectPath(path);
                                        }}
                                        aria-label={`Select widget ${widget.title}`}
                                    />
                                );
                            })}
                        </div>
                    :   null}
                </div>
            </LayoutRuntimeCompositionProvider>
        </LayoutEditorRuntimeTraceProvider>
    );
}

function KpiTileSectionFrame({
    doc,
    section,
    editorMode,
    selectedSectionId,
    selectedFieldPath,
    hasItemSelected,
    onSelectSection,
    onSelectFieldPath,
    applyDoc,
}: {
    doc: LayoutDoc;
    section: LayoutSection;
    editorMode: LayoutBuilderEditorMode;
    selectedSectionId: string | null;
    selectedFieldPath: string | null;
    hasItemSelected: boolean;
    onSelectSection: (sectionKey: string | null) => void;
    onSelectFieldPath: (path: string | null) => void;
    applyDoc: (next: LayoutDoc) => void;
}) {
    const hidden = isSectionEditorHidden(section);
    const isSelected = selectedSectionId === section.key;
    const isBuild = editorMode === "build";
    const widgets = listSectionWidgetItems(doc, section.key);
    const widget = widgets[0];
    const widgetPath = widget ? `field:${section.key}:${widget.itemId}` : null;
    const widgetSelected = Boolean(widgetPath && selectedFieldPath === widgetPath);
    const tone = widget ? readLayoutEditorWidgetStyle(widget.item.metadata).tone : undefined;
    const railClass = resolveLayoutEditorWidgetToneRailClass(tone);

    const applyKpiReorder = (direction: -1 | 1) => {
        let next = reorderSectionInZone(doc, section.key, direction);
        next = repackPeerCardsAfterZoneReorder(next, section.key);
        applyDoc(next);
    };

    if (!isBuild) {
        return (
            <div data-testid={`visual-editor-section-${section.key}`} data-visual-editor-kpi-tile="true">
                <SectionPreviewBody
                    doc={doc}
                    sectionKey={section.key}
                    hidden={hidden}
                    traceEnabled={false}
                    selectedFieldPath={null}
                    onSelectFieldPath={() => {}}
                    onSelectSection={() => {}}
                    editorMode={editorMode}
                />
            </div>
        );
    }

    return (
        <div
            role="button"
            tabIndex={0}
            className={`group relative flex h-full min-h-[4.25rem] cursor-pointer rounded-xl border border-l-[3px] transition-all duration-150 ${railClass} ${
                isSelected || widgetSelected ?
                    "border-alloy-pine/40 ring-1 ring-alloy-pine/25 shadow-[0_2px_8px_rgba(45,106,79,0.08)]"
                :   "border-alloy-stone/12 bg-white hover:border-alloy-pine/30 hover:shadow-[0_2px_8px_rgba(24,39,58,0.05)]"
            } ${hidden ? "opacity-60" : ""}`}
            data-testid={`visual-editor-section-${section.key}`}
            data-visual-editor-kpi-tile="true"
            data-visual-editor-editable="true"
            onClick={() => {
                onSelectSection(section.key);
                if (widgetPath) onSelectFieldPath(widgetPath);
            }}
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSection(section.key);
                    if (widgetPath) onSelectFieldPath(widgetPath);
                }
            }}
        >
            <div
                className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end gap-1 p-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="pointer-events-auto flex gap-1 rounded-lg border border-alloy-forge/8 bg-white/95 p-1 shadow-sm">
                    <button
                        type="button"
                        className="rounded-md px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60 hover:bg-alloy-stone/30"
                        onClick={() => applyKpiReorder(-1)}
                    >
                        Move ←
                    </button>
                    <button
                        type="button"
                        className="rounded-md px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60 hover:bg-alloy-stone/30"
                        onClick={() => applyKpiReorder(1)}
                    >
                        Move →
                    </button>
                </div>
            </div>

            {hidden ?
                <div className="absolute left-2 top-2 z-10 rounded-full bg-alloy-stone/85 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60">
                    Hidden after publish
                </div>
            :   null}

            <div className="pointer-events-none">
                <SectionPreviewBody
                    doc={doc}
                    sectionKey={section.key}
                    hidden={hidden}
                    traceEnabled={false}
                    selectedFieldPath={selectedFieldPath}
                    onSelectFieldPath={(path) => {
                        onSelectFieldPath(path);
                        if (path) onSelectSection(section.key);
                    }}
                    onSelectSection={onSelectSection}
                    editorMode={editorMode}
                />
            </div>
        </div>
    );
}

function WidgetStripSectionFrame({
    doc,
    section,
    editorMode,
    selectedSectionId,
    selectedFieldPath,
    hasItemSelected,
    onSelectSection,
    onSelectFieldPath,
    onSelectBlockId,
    applyDoc,
}: {
    doc: LayoutDoc;
    section: LayoutSection;
    editorMode: LayoutBuilderEditorMode;
    selectedSectionId: string | null;
    selectedFieldPath: string | null;
    hasItemSelected: boolean;
    onSelectSection: (sectionKey: string | null) => void;
    onSelectFieldPath: (path: string | null) => void;
    onSelectBlockId: (blockId: string | null) => void;
    applyDoc: (next: LayoutDoc) => void;
}) {
    const hidden = isSectionEditorHidden(section);
    const isSelected = selectedSectionId === section.key;
    const isBuild = editorMode === "build";
    const columnCount = widgetStripColumnCount(doc, section.key);

    if (!isBuild) {
        return (
            <div data-testid={`visual-editor-section-${section.key}`} data-visual-editor-widget-strip="true">
                <SectionPreviewBody
                    doc={doc}
                    sectionKey={section.key}
                    hidden={hidden}
                    traceEnabled={false}
                    selectedFieldPath={null}
                    onSelectFieldPath={() => {}}
                    onSelectSection={() => {}}
                    editorMode={editorMode}
                />
            </div>
        );
    }

    return (
        <div
            role="group"
            className={`relative rounded-xl transition-all duration-150 ${
                isSelected ?
                    "ring-1 ring-alloy-pine/25"
                :   "hover:ring-1 hover:ring-alloy-pine/15"
            } ${hidden ? "opacity-60" : ""}`}
            data-testid={`visual-editor-section-${section.key}`}
            data-visual-editor-widget-strip="true"
            data-visual-editor-editable="true"
            onClick={() => {
                onSelectSection(section.key);
                onSelectFieldPath(null);
                onSelectBlockId(null);
            }}
        >
            <div
                className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end gap-1 p-1 opacity-0 transition group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="pointer-events-auto flex gap-1 rounded-lg border border-alloy-forge/8 bg-white/95 p-1 text-[10px] shadow-sm">
                    <button
                        type="button"
                        className="rounded-md px-2 py-0.5 font-medium text-alloy-midnight/60 hover:bg-alloy-stone/30"
                        onClick={() => applyDoc(reorderSectionInZone(doc, section.key, -1))}
                    >
                        Move ↑
                    </button>
                    <button
                        type="button"
                        className="rounded-md px-2 py-0.5 font-medium text-alloy-midnight/60 hover:bg-alloy-stone/30"
                        onClick={() => applyDoc(reorderSectionInZone(doc, section.key, 1))}
                    >
                        Move ↓
                    </button>
                </div>
            </div>

            <div
                className="mb-1 flex items-center justify-between gap-2 px-1"
                onClick={(e) => e.stopPropagation()}
            >
                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/40">
                    KPI strip · {columnCount} widget{columnCount === 1 ? "" : "s"}
                </span>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
                <SectionPreviewBody
                    doc={doc}
                    sectionKey={section.key}
                    hidden={hidden}
                    traceEnabled={isBuild}
                    selectedFieldPath={selectedFieldPath}
                    onSelectFieldPath={(path) => {
                        onSelectFieldPath(path);
                        if (path) onSelectSection(section.key);
                    }}
                    onSelectSection={onSelectSection}
                    editorMode={editorMode}
                />
            </div>
        </div>
    );
}

function EditableSectionFrame({
    doc,
    section,
    editorMode,
    selectedSectionId,
    selectedFieldPath,
    hasItemSelected,
    onSelectSection,
    onSelectFieldPath,
    onSelectBlockId,
    applyDoc,
}: {
    doc: LayoutDoc;
    section: LayoutSection;
    editorMode: LayoutBuilderEditorMode;
    selectedSectionId: string | null;
    selectedFieldPath: string | null;
    hasItemSelected: boolean;
    onSelectSection: (sectionKey: string | null) => void;
    onSelectFieldPath: (path: string | null) => void;
    onSelectBlockId: (blockId: string | null) => void;
    applyDoc: (next: LayoutDoc) => void;
}) {
    const hidden = isSectionEditorHidden(section);
    const isSelected = selectedSectionId === section.key;
    const isBuild = editorMode === "build";
    const sectionType = readSectionType(section);

    const applySectionReorder = (direction: -1 | 1) => {
        let next = reorderSectionInZone(doc, section.key, direction);
        next = repackPeerCardsAfterZoneReorder(next, section.key);
        applyDoc(next);
    };

    if (!isBuild) {
        return (
            <div className={`${hidden ? "opacity-60" : ""}`} data-testid={`visual-editor-section-${section.key}`}>
                <SectionPreviewBody
                    doc={doc}
                    sectionKey={section.key}
                    hidden={hidden}
                    traceEnabled={false}
                    selectedFieldPath={null}
                    onSelectFieldPath={() => {}}
                    onSelectSection={() => {}}
                    editorMode={editorMode}
                />
            </div>
        );
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => {
                onSelectSection(section.key);
                onSelectFieldPath(null);
                onSelectBlockId(null);
            }}
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSection(section.key);
                    onSelectFieldPath(null);
                    onSelectBlockId(null);
                }
            }}
            className={`group relative flex h-full min-h-0 flex-col cursor-pointer ${hidden ? "opacity-60" : ""}`}
            data-testid={`visual-editor-section-${section.key}`}
            data-visual-editor-editable="true"
            data-visual-editor-section-type={sectionType}
        >
            <div
                className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end gap-1 p-2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
            >
                <div className="pointer-events-auto flex gap-1 rounded-lg border border-alloy-forge/8 bg-white/95 p-1 shadow-sm">
                    <button
                        type="button"
                        className="rounded-md px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60 hover:bg-alloy-stone/30"
                        onClick={(e) => {
                            e.stopPropagation();
                            applySectionReorder(-1);
                        }}
                    >
                        Move ↑
                    </button>
                    <button
                        type="button"
                        className="rounded-md px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60 hover:bg-alloy-stone/30"
                        onClick={(e) => {
                            e.stopPropagation();
                            applySectionReorder(1);
                        }}
                    >
                        Move ↓
                    </button>
                </div>
            </div>

            {hidden ?
                <div className="pointer-events-none absolute left-2 top-12 z-20 rounded-full bg-alloy-stone/85 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60">
                    Hidden after publish
                </div>
            :   null}

            <ExperienceBuilderEditableCardShell
                sectionKey={section.key}
                title={section.title}
                isSelected={isSelected}
                onTitleChange={(title) => applyDoc(renameSectionTitle(doc, section.key, title))}
            >
                <div onClick={(e) => e.stopPropagation()}>
                    <SectionPreviewBody
                        doc={doc}
                        sectionKey={section.key}
                        hidden={hidden}
                        traceEnabled={isBuild}
                        selectedFieldPath={selectedFieldPath}
                        onSelectFieldPath={(path) => {
                            onSelectFieldPath(path);
                            if (path) onSelectSection(section.key);
                        }}
                        onSelectSection={onSelectSection}
                    />
                </div>
            </ExperienceBuilderEditableCardShell>
        </div>
    );
}

function CompositionGrid({
    doc,
    editorMode,
    selectedSectionId,
    selectedFieldPath,
    onSelectSection,
    onSelectFieldPath,
    onSelectBlockId,
    applyDoc,
}: Omit<Props, "onQuickStart">) {
    const slots = partitionLeadOverviewBodySections(doc);
    const zones = partitionOpportunityDrawerSectionsByZone(doc);
    const summarySections = zones.summary_strip;
    const hasItemSelected = Boolean(selectedFieldPath);

    const renderSection = (section: LayoutSection | null) => {
        if (!section) return null;
        if (sectionIsKpiTile(section)) {
            return (
                <KpiTileSectionFrame
                    key={section.key}
                    doc={doc}
                    section={section}
                    editorMode={editorMode}
                    selectedSectionId={selectedSectionId}
                    selectedFieldPath={selectedFieldPath}
                    hasItemSelected={hasItemSelected}
                    onSelectSection={onSelectSection}
                    onSelectFieldPath={onSelectFieldPath}
                    applyDoc={applyDoc}
                />
            );
        }
        if (sectionIsWidgetStrip(section)) {
            return (
                <WidgetStripSectionFrame
                    key={section.key}
                    doc={doc}
                    section={section}
                    editorMode={editorMode}
                    selectedSectionId={selectedSectionId}
                    selectedFieldPath={selectedFieldPath}
                    hasItemSelected={hasItemSelected}
                    onSelectSection={onSelectSection}
                    onSelectFieldPath={onSelectFieldPath}
                    onSelectBlockId={onSelectBlockId}
                    applyDoc={applyDoc}
                />
            );
        }
        return (
            <EditableSectionFrame
                key={section.key}
                doc={doc}
                section={section}
                editorMode={editorMode}
                selectedSectionId={selectedSectionId}
                selectedFieldPath={selectedFieldPath}
                hasItemSelected={hasItemSelected}
                onSelectSection={onSelectSection}
                onSelectFieldPath={onSelectFieldPath}
                onSelectBlockId={onSelectBlockId}
                applyDoc={applyDoc}
            />
        );
    };

    const overflowSections = (() => {
        const renderedInZones = new Set([
            ...summarySections.map((section) => section.key),
            ...zones.right_rail.map((section) => section.key),
            ...zones.footer_actions.map((section) => section.key),
        ]);
        return [
            ...(slots.notes ? [slots.notes] : []),
            ...(slots.activity ? [slots.activity] : []),
            ...slots.overflow.filter((section) => !renderedInZones.has(section.key)),
        ];
    })();

    return (
        <div
            className={`${DRAWER_OVERVIEW_CANVAS_CLASS} ${editorMode === "build" ? "rounded-xl bg-[#F6F8FC]/80 p-2" : "p-1"}`}
            data-testid="visual-editor-main-composition-grid"
        >
            {summarySections.length > 0 ?
                <div
                    data-visual-editor-zone="summary_strip"
                    data-testid="visual-editor-zone-summary_strip"
                    className={DRAWER_OVERVIEW_SUMMARY_STRIP_HOST_CLASS}
                >
                    <LayoutEditorSectionFlowView
                        sections={summarySections}
                        renderSection={renderSection}
                        stackClassName="min-w-0"
                        rowClassName="min-w-0 w-full"
                        rowCellClassName="min-w-0 flex h-full min-h-0 flex-col"
                    />
                </div>
            :   null}

            <div className={DRAWER_OVERVIEW_SHELL_GRID_CLASS}>
                <div className={DRAWER_OVERVIEW_LEFT_COLUMN_CLASS}>{renderSection(slots.household)}</div>
                <div className={DRAWER_OVERVIEW_MAIN_COLUMN_CLASS}>{renderSection(slots.enrollment)}</div>
                <div className={DRAWER_OVERVIEW_RIGHT_RAIL_CLASS} data-testid="visual-editor-zone-right_rail">
                    <LayoutEditorSectionFlowView
                        sections={zones.right_rail}
                        renderSection={renderSection}
                        stackClassName="space-y-2"
                        rowClassName="min-w-0"
                        rowCellClassName="min-w-0 flex h-full min-h-0 flex-col"
                    />
                </div>
            </div>

            {slots.leadSource ?
                <div className={DRAWER_OVERVIEW_LEAD_SOURCE_GRID_CLASS}>{renderSection(slots.leadSource)}</div>
            :   null}

            {overflowSections.length > 0 ?
                <div className={DRAWER_OVERVIEW_OVERFLOW_STACK_CLASS}>
                    <LayoutEditorSectionFlowView
                        sections={overflowSections}
                        renderSection={renderSection}
                        stackClassName=""
                        rowClassName="min-w-0"
                        rowCellClassName="min-w-0 flex h-full min-h-0 flex-col"
                    />
                </div>
            :   null}
        </div>
    );
}

export default function OpportunityDrawerLayoutEditorCanvas({
    doc,
    editorMode,
    selectedSectionId,
    selectedFieldPath,
    onSelectSection,
    onSelectFieldPath,
    onSelectBlockId,
    applyDoc,
    previewRecord = LAYOUT_DRAWER_PREVIEW_RECORD,
}: Props) {
    const isPreview = editorMode === "preview";

    return (
        <LayoutBuilderPreviewRecordContext.Provider value={previewRecord}>
            <div className="relative" data-testid="visual-editor-drawer-frame">
            {isPreview ?
                <LayoutBuilderPreviewDrawerFrame record={previewRecord}>
                    <CompositionGrid
                        doc={doc}
                        editorMode={editorMode}
                        selectedSectionId={selectedSectionId}
                        selectedFieldPath={selectedFieldPath}
                        onSelectSection={onSelectSection}
                        onSelectFieldPath={onSelectFieldPath}
                        onSelectBlockId={onSelectBlockId}
                        applyDoc={applyDoc}
                    />
                </LayoutBuilderPreviewDrawerFrame>
            :   <CompositionGrid
                    doc={doc}
                    editorMode={editorMode}
                    selectedSectionId={selectedSectionId}
                    selectedFieldPath={selectedFieldPath}
                    onSelectSection={onSelectSection}
                    onSelectFieldPath={onSelectFieldPath}
                    onSelectBlockId={onSelectBlockId}
                    applyDoc={applyDoc}
                />
            }
        </div>
        </LayoutBuilderPreviewRecordContext.Provider>
    );
}
