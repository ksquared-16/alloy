"use client";

import { useMemo } from "react";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import LayoutEditorSectionFlowView from "@/components/layout/LayoutEditorSectionFlowView";
import LayoutBuilderPreviewDrawerFrame from "@/components/adminV2/settings/LayoutBuilderPreviewDrawerFrame";
import LayoutBuilderCanvasStartGuide from "@/components/adminV2/settings/LayoutBuilderCanvasStartGuide";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import {
    buildSingleSectionPreviewDoc,
    isSectionEditorHidden,
    partitionOpportunityDrawerSectionsByZone,
    renameSectionTitle,
    reorderSectionInZone,
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
import { shouldShowLayoutBuilderStartGuide } from "@/lib/layout/layoutBuilderStudioUx";

export type LayoutBuilderEditorMode = "build" | "preview";

export type LayoutBuilderQuickStartAction = "template" | "kpi_strip" | "contact_summary" | "children_list";

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
};

function SectionPreviewBody({
    doc,
    sectionKey,
    hidden,
    traceEnabled,
    selectedFieldPath,
    onSelectFieldPath,
    onSelectSection,
}: {
    doc: LayoutDoc;
    sectionKey: string;
    hidden: boolean;
    traceEnabled: boolean;
    selectedFieldPath: string | null;
    onSelectFieldPath: (path: string | null) => void;
    onSelectSection: (sectionKey: string) => void;
}) {
    const sectionDoc = useMemo(() => buildSingleSectionPreviewDoc(doc, sectionKey), [doc, sectionKey]);
    const traceValue = useMemo(() => {
        const blocks = listSectionLayoutBlocks(doc, sectionKey);
        const { byItemId, byRefKey } = buildLayoutEditorItemIdPathIndex(blocks);
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

    if (!sectionDoc || hidden) {
        return (
            <p className="px-3 py-6 text-xs text-alloy-midnight/45" data-testid={`visual-editor-section-hidden-${sectionKey}`}>
                Hidden after publish — turn visibility back on in Properties.
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
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSection(section.key);
                    onSelectFieldPath(null);
                    onSelectBlockId(null);
                }
            }}
            className={`group relative cursor-pointer rounded-xl border bg-white shadow-sm transition-all duration-150 ${
                isSelected && hasItemSelected ?
                    "border-alloy-blue/35 ring-2 ring-alloy-blue/15"
                : isSelected ?
                    "border-alloy-pine/45 ring-2 ring-alloy-pine/20 shadow-[0_2px_8px_rgba(45,106,79,0.08)]"
                :   "border-alloy-stone/12 hover:border-alloy-pine/30 hover:shadow-[0_2px_8px_rgba(24,39,58,0.05)]"
            } ${hidden ? "opacity-60" : ""}`}
            data-testid={`visual-editor-section-${section.key}`}
            data-visual-editor-editable="true"
            data-visual-editor-section-type={sectionType}
        >
            <div className="border-b border-alloy-stone/8 bg-gradient-to-r from-white to-alloy-stone/[0.02] px-3 py-2">
                <input
                    type="text"
                    value={section.title}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => applyDoc(renameSectionTitle(doc, section.key, e.target.value))}
                    className="w-full bg-transparent text-sm font-semibold text-alloy-midnight outline-none placeholder:text-alloy-midnight/35 focus:ring-0"
                    aria-label="Section title"
                    data-testid={`visual-editor-section-title-inline-${section.key}`}
                />
            </div>

            <div
                className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end gap-1 p-2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="pointer-events-auto flex gap-1 rounded-lg border border-alloy-forge/8 bg-white/95 p-1 shadow-sm">
                    <button
                        type="button"
                        className="rounded-md px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60 hover:bg-alloy-stone/30"
                        onClick={() => applyDoc(reorderSectionInZone(doc, section.key, -1))}
                    >
                        Move ↑
                    </button>
                    <button
                        type="button"
                        className="rounded-md px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60 hover:bg-alloy-stone/30"
                        onClick={() => applyDoc(reorderSectionInZone(doc, section.key, 1))}
                    >
                        Move ↓
                    </button>
                </div>
            </div>

            {hidden ?
                <div className="absolute left-2 top-2 z-10 rounded-full bg-alloy-stone/85 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60">
                    Hidden after publish
                </div>
            :   null}

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

    const overflowSections = [
        ...(slots.notes ? [slots.notes] : []),
        ...(slots.activity ? [slots.activity] : []),
        ...slots.overflow,
    ];

    return (
        <div
            className={`${DRAWER_OVERVIEW_CANVAS_CLASS} ${editorMode === "build" ? "rounded-xl bg-[#F6F8FC]/80 p-2" : "p-1"}`}
            data-testid="visual-editor-main-composition-grid"
        >
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
                <div className={DRAWER_OVERVIEW_LEFT_COLUMN_CLASS}>{renderSection(slots.household)}</div>
                <div className={DRAWER_OVERVIEW_MAIN_COLUMN_CLASS}>{renderSection(slots.enrollment)}</div>
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
                <div className={DRAWER_OVERVIEW_OVERFLOW_STACK_CLASS}>
                    <LayoutEditorSectionFlowView
                        sections={overflowSections}
                        renderSection={renderSection}
                        stackClassName=""
                        rowClassName="min-w-0"
                        rowCellClassName="min-w-0"
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
    onQuickStart,
}: Props) {
    const isPreview = editorMode === "preview";
    const showStartGuide =
        editorMode === "build" && !selectedSectionId && shouldShowLayoutBuilderStartGuide(doc) && onQuickStart;

    return (
        <div className="relative" data-testid="visual-editor-drawer-frame">
            {isPreview ?
                <LayoutBuilderPreviewDrawerFrame>
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

            {showStartGuide ?
                <LayoutBuilderCanvasStartGuide onQuickStart={onQuickStart} />
            :   null}
        </div>
    );
}
