/**
 * Layout editor — section-level row/column composition (Phase 5.10).
 * Delegates to builderOps; registry constrains unsafe choices only.
 */

import {
    addItem,
    addRow,
    makeFieldItem,
    makeId,
    makeTemplateItem,
    makeWidgetItem,
    moveItemHorizontal,
    moveItemVertical,
    moveRow,
    patchItem,
    removeItem,
    removeRow,
    setRowColumnCount,
    type GroupLoc,
} from "@/lib/layout/builderOps";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import {
    buildCustomLayoutBlock,
    type CreateCustomBlockInput,
} from "@/lib/layout/layoutEditorFreeformBlocks";
import {
    isAllowedLayoutEditorActionKey,
    makeLayoutEditorActionButtonItem,
    readLayoutEditorActionButtonConfig,
    writeLayoutEditorActionButtonConfig,
    type LayoutEditorActionButtonConfig,
} from "@/lib/layout/layoutEditorActionButton";
import type { LayoutEditorActionCatalogEntry } from "@/lib/layout/layoutEditorActionCatalog";
import { layoutEditorActionButtonConfigFromCatalogEntry } from "@/lib/layout/layoutEditorActionCatalog";
import {
    applyLayoutEditorFieldDisplayPresetToItem,
    type LayoutEditorFieldDisplayPreset,
} from "@/lib/layout/layoutEditorFieldDisplayPresets";
import type { LayoutEditorVisibilityRule } from "@/lib/layout/layoutEditorVisibilityRules";
import {
    isAllowedChildDrawerWidgetKey,
    isAllowedOpportunityDrawerFieldRefKey,
    isAllowedOpportunityDrawerWidgetKey,
    isAllowedPersonDrawerWidgetKey,
    OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS,
} from "@/lib/layout/surfaceLayoutRegistry";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import { GLOBAL_WIDGET_CATALOG } from "@/lib/layout/fieldCatalog";
import {
    defaultActivityTimelineConfigForSurface,
    writeLayoutEditorActivityTimelineConfig,
} from "@/lib/layout/layoutEditorActivityTimelineConfig";
import {
    defaultRelationshipWidgetConfigForSurface,
    writeLayoutEditorRelationshipWidgetConfig,
} from "@/lib/layout/layoutEditorRelationshipWidgetConfig";
import { isRelationshipWidgetKey } from "@/lib/layout/runtime/layoutRuntimeScopedRelationshipContacts";
import { makeEmptyCustomLayoutBlockItem } from "@/lib/layout/layoutEditorGeneratedKeys";

export type SectionColumnCount = 1 | 2 | 3;

export type SectionItemKind = "field" | "block" | "text" | "list" | "action_button" | "widget";

export type SectionCompositionItem = {
    itemId: string;
    kind: SectionItemKind;
    title: string;
    item: LayoutItem;
    runtimeEffective: boolean;
    previewOnlyReason?: string;
};

export type SectionCompositionColumn = {
    colIndex: number;
    colId: string;
    items: SectionCompositionItem[];
};

export type SectionCompositionRow = {
    rowIndex: number;
    rowId: string;
    columnCount: number;
    columns: SectionCompositionColumn[];
};

export type SectionItemCoords = {
    sIdx: number;
    rIdx: number;
    cIdx: number;
    itemId: string;
};

export type AddSectionItemResult = { ok: true; doc: LayoutDoc; itemId: string } | { ok: false; error: string };

function sectionIndex(doc: LayoutDoc, sectionKey: string): number {
    return doc.sections.findIndex((s) => s.key === sectionKey);
}

function resolveSectionItemKind(item: LayoutItem): SectionItemKind {
    if (item.refKey === "_template") return "text";
    if (readLayoutEditorActionButtonConfig(item.metadata)) return "action_button";
    if (item.kind === "field_group") return "block";
    if (item.kind === "related_list") return "list";
    if (item.kind === "widget_placeholder") return "widget";
    return "field";
}

function sectionItemRuntimeEffective(item: LayoutItem, kind: SectionItemKind): { effective: boolean; reason?: string } {
    if (kind === "widget") {
        if (!isAllowedOpportunityDrawerWidgetKey(item.refKey)) {
            return { effective: false, reason: "Widget key is not registered for the opportunity drawer." };
        }
        return { effective: true };
    }
    if (kind === "action_button") {
        const cfg = readLayoutEditorActionButtonConfig(item.metadata);
        if (!cfg?.actionKey || !isAllowedLayoutEditorActionKey(cfg.actionKey)) {
            return { effective: false, reason: "Action key is not registered for drawer layout buttons." };
        }
        return { effective: false, reason: "Action buttons render in preview; live drawer wiring is coming next." };
    }
    if (kind === "list" && item.refKey !== "children") {
        return { effective: false, reason: "Only children enrollment lists are runtime-effective today." };
    }
    if (item.kind === "field_group" && (item.refKey === "block" || item.refKey?.startsWith("custom_block_") || item.refKey?.startsWith("layout_block_"))) {
        return { effective: true };
    }
    return { effective: true };
}

function sectionItemTitle(item: LayoutItem, kind: SectionItemKind): string {
    if (kind === "text") return item.template?.trim() || item.label?.trim() || "Text";
    if (kind === "action_button") {
        const cfg = readLayoutEditorActionButtonConfig(item.metadata);
        return cfg?.label?.trim() || item.label?.trim() || "Action";
    }
    return item.label?.trim() || item.refKey || "Item";
}

export function listSectionCompositionRows(doc: LayoutDoc, sectionKey: string): SectionCompositionRow[] {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return [];
    return doc.sections[sIdx]!.rows.map((row, rowIndex) => ({
        rowIndex,
        rowId: row.id,
        columnCount: Math.max(1, row.columns.length),
        columns: row.columns.map((col, colIndex) => ({
            colIndex,
            colId: col.id,
            items: col.items.map((item) => {
                const kind = resolveSectionItemKind(item);
                const runtime = sectionItemRuntimeEffective(item, kind);
                return {
                    itemId: item.id,
                    kind,
                    title: sectionItemTitle(item, kind),
                    item,
                    runtimeEffective: runtime.effective,
                    previewOnlyReason: runtime.reason,
                };
            }),
        })),
    }));
}

export function findSectionItemCoords(doc: LayoutDoc, sectionKey: string, itemId: string): SectionItemCoords | null {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return null;
    const section = doc.sections[sIdx]!;
    for (let rIdx = 0; rIdx < section.rows.length; rIdx += 1) {
        const row = section.rows[rIdx]!;
        for (let cIdx = 0; cIdx < row.columns.length; cIdx += 1) {
            if (row.columns[cIdx]!.items.some((it) => it.id === itemId)) {
                return { sIdx, rIdx, cIdx, itemId };
            }
        }
    }
    return null;
}

export function addSectionRow(
    doc: LayoutDoc,
    sectionKey: string,
    columnCount: SectionColumnCount = 1,
): LayoutDoc {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return doc;
    return addRow(doc, sIdx, columnCount);
}

export function removeSectionRow(doc: LayoutDoc, sectionKey: string, rowIndex: number): LayoutDoc {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return doc;
    return removeRow(doc, sIdx, rowIndex);
}

export function moveSectionRow(doc: LayoutDoc, sectionKey: string, rowIndex: number, direction: -1 | 1): LayoutDoc {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return doc;
    return moveRow(doc, sIdx, rowIndex, direction);
}

export function setSectionRowColumnCount(
    doc: LayoutDoc,
    sectionKey: string,
    rowIndex: number,
    columnCount: SectionColumnCount,
): LayoutDoc {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return doc;
    return setRowColumnCount(doc, sIdx, rowIndex, columnCount);
}

export function addSectionFieldItem(
    doc: LayoutDoc,
    sectionKey: string,
    rowIndex: number,
    colIndex: number,
    field: LayoutCatalogField,
): AddSectionItemResult {
    if (!isAllowedOpportunityDrawerFieldRefKey(field.refKey)) {
        return { ok: false, error: `"${field.refKey}" is not allowed on the opportunity drawer.` };
    }
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return { ok: false, error: "Section not found." };
    const section = doc.sections[sIdx]!;
    if (!section.rows[rowIndex]) return { ok: false, error: "Row not found." };
    if (!section.rows[rowIndex]!.columns[colIndex]) return { ok: false, error: "Column not found." };
    try {
        const item = makeFieldItem(field.refKey, field.fieldLabel, field.fieldType);
        return { ok: true, doc: addItem(doc, sIdx, rowIndex, colIndex, item), itemId: item.id };
    } catch (e) {
        return { ok: false, error: (e as Error).message };
    }
}

export function addSectionTextItem(
    doc: LayoutDoc,
    sectionKey: string,
    rowIndex: number,
    colIndex: number,
    template = "Display text",
    label = "Text",
): AddSectionItemResult {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return { ok: false, error: "Section not found." };
    const item = makeTemplateItem(template, label);
    return { ok: true, doc: addItem(doc, sIdx, rowIndex, colIndex, item), itemId: item.id };
}

export function addSectionListItem(
    doc: LayoutDoc,
    sectionKey: string,
    rowIndex: number,
    colIndex: number,
): AddSectionItemResult {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return { ok: false, error: "Section not found." };
    const item: LayoutItem = {
        id: makeId("item"),
        kind: "related_list",
        refKey: "children",
        label: "Related list",
        source: "children",
        displayMode: "table",
        related: { entityType: "child" },
        columns: [{ label: "Name", refKey: "child.name", width: "medium", renderHint: "text" }],
    };
    return { ok: true, doc: addItem(doc, sIdx, rowIndex, colIndex, item), itemId: item.id };
}

export function addSectionBlockItem(
    doc: LayoutDoc,
    sectionKey: string,
    rowIndex: number,
    colIndex: number,
    input?: Partial<CreateCustomBlockInput>,
): AddSectionItemResult {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return { ok: false, error: "Section not found." };
    const built = buildCustomLayoutBlock({
        title: input?.title ?? "New block",
        blockType: input?.blockType ?? "custom_layout_block",
        dataContext: input?.dataContext ?? "lead",
        contactRole: input?.contactRole,
        editMode: input?.editMode ?? "display_only",
        showTitle: input?.showTitle ?? true,
        columnCount: input?.columnCount ?? 1,
    });
    return { ok: true, doc: addItem(doc, sIdx, rowIndex, colIndex, built), itemId: built.id };
}

export function addSectionActionButtonItem(
    doc: LayoutDoc,
    sectionKey: string,
    rowIndex: number,
    colIndex: number,
    config?: Partial<LayoutEditorActionButtonConfig> & { defaultVisibility?: LayoutEditorVisibilityRule },
): AddSectionItemResult {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return { ok: false, error: "Section not found." };
    if (config?.actionKey && !isAllowedLayoutEditorActionKey(config.actionKey)) {
        return { ok: false, error: `"${config.actionKey}" is not an allowed drawer action key.` };
    }
    const item = makeLayoutEditorActionButtonItem(config);
    return { ok: true, doc: addItem(doc, sIdx, rowIndex, colIndex, item), itemId: item.id };
}

export function addSectionActionButtonCatalogEntry(
    doc: LayoutDoc,
    sectionKey: string,
    rowIndex: number,
    colIndex: number,
    entry: LayoutEditorActionCatalogEntry,
): AddSectionItemResult {
    if (!entry.selectableInActionPicker) {
        return { ok: false, error: entry.disabledReason ?? `"${entry.label}" cannot be added as a layout action button.` };
    }
    return addSectionActionButtonItem(doc, sectionKey, rowIndex, colIndex, layoutEditorActionButtonConfigFromCatalogEntry(entry));
}

export function addSectionFieldDisplayPresetItem(
    doc: LayoutDoc,
    sectionKey: string,
    rowIndex: number,
    colIndex: number,
    preset: LayoutEditorFieldDisplayPreset,
): AddSectionItemResult {
    if (!isAllowedOpportunityDrawerFieldRefKey(preset.refKey)) {
        return { ok: false, error: `"${preset.refKey}" is not allowed on the opportunity drawer.` };
    }
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return { ok: false, error: "Section not found." };
    const section = doc.sections[sIdx]!;
    if (!section.rows[rowIndex]) return { ok: false, error: "Row not found." };
    if (!section.rows[rowIndex]!.columns[colIndex]) return { ok: false, error: "Column not found." };
    const base = makeFieldItem(preset.refKey, preset.fieldLabel, preset.fieldType);
    const item = applyLayoutEditorFieldDisplayPresetToItem(base, preset);
    return { ok: true, doc: addItem(doc, sIdx, rowIndex, colIndex, item), itemId: item.id };
}

const SINGLETON_SECTION_WIDGET_KEYS = new Set(["attention", "tasks", "current_work"]);

function isWidgetAllowedOnDrawerSurface(widgetKey: string, surfaceKey: DrawerLayoutEditorSurfaceKey): boolean {
    if (surfaceKey === "person_drawer") return isAllowedPersonDrawerWidgetKey(widgetKey);
    if (surfaceKey === "child_drawer") return isAllowedChildDrawerWidgetKey(widgetKey);
    return isAllowedOpportunityDrawerWidgetKey(widgetKey);
}

export function addSectionWidgetItem(
    doc: LayoutDoc,
    sectionKey: string,
    rowIndex: number,
    colIndex: number,
    widgetKey: string,
    surfaceKey: DrawerLayoutEditorSurfaceKey = "opportunity_drawer",
): AddSectionItemResult {
    if (!isWidgetAllowedOnDrawerSurface(widgetKey, surfaceKey)) {
        return { ok: false, error: `"${widgetKey}" is not allowed on the ${surfaceKey.replace(/_/g, " ")}.` };
    }
    const catalog = GLOBAL_WIDGET_CATALOG.find((w) => w.widgetKey === widgetKey);
    if (catalog?.relevantSurfaces?.length && !catalog.relevantSurfaces.includes("drawer")) {
        return { ok: false, error: `"${catalog.label}" is not supported on drawer surfaces.` };
    }
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return { ok: false, error: "Section not found." };
    const section = doc.sections[sIdx]!;
    if (SINGLETON_SECTION_WIDGET_KEYS.has(widgetKey)) {
        const exists = section.rows.some((row) =>
            row.columns.some((col) =>
                col.items.some((it) => it.kind === "widget_placeholder" && it.refKey === widgetKey),
            ),
        );
        if (exists) {
            return { ok: false, error: `Only one ${catalog?.label ?? widgetKey} widget is allowed per section.` };
        }
    }
    const item = makeWidgetItem(widgetKey, catalog?.label ?? widgetKey, catalog?.defaultDisplayMode);
    if (widgetKey === "activity_timeline") {
        item.metadata = writeLayoutEditorActivityTimelineConfig(
            item.metadata,
            defaultActivityTimelineConfigForSurface(surfaceKey),
        );
    }
    if (isRelationshipWidgetKey(widgetKey)) {
        item.metadata = writeLayoutEditorRelationshipWidgetConfig(
            item.metadata,
            defaultRelationshipWidgetConfigForSurface(widgetKey, surfaceKey),
        );
    }
    return { ok: true, doc: addItem(doc, sIdx, rowIndex, colIndex, item), itemId: item.id };
}

export function addSectionEmptyGroupBlock(
    doc: LayoutDoc,
    sectionKey: string,
    rowIndex: number,
    colIndex: number,
): AddSectionItemResult {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return { ok: false, error: "Section not found." };
    const item = makeEmptyCustomLayoutBlockItem();
    return { ok: true, doc: addItem(doc, sIdx, rowIndex, colIndex, item), itemId: item.id };
}

export function removeSectionItem(doc: LayoutDoc, sectionKey: string, itemId: string): LayoutDoc {
    const coords = findSectionItemCoords(doc, sectionKey, itemId);
    if (!coords) return doc;
    return removeItem(doc, coords.sIdx, coords.rIdx, coords.cIdx, itemId);
}

export function moveSectionItemVertical(
    doc: LayoutDoc,
    sectionKey: string,
    itemId: string,
    direction: -1 | 1,
): LayoutDoc {
    const coords = findSectionItemCoords(doc, sectionKey, itemId);
    if (!coords) return doc;
    return moveItemVertical(doc, coords.sIdx, coords.rIdx, coords.cIdx, itemId, direction);
}

export function moveSectionItemHorizontal(
    doc: LayoutDoc,
    sectionKey: string,
    itemId: string,
    direction: -1 | 1,
): LayoutDoc {
    const coords = findSectionItemCoords(doc, sectionKey, itemId);
    if (!coords) return doc;
    return moveItemHorizontal(doc, coords.sIdx, coords.rIdx, coords.cIdx, itemId, direction);
}

export function patchSectionItem(
    doc: LayoutDoc,
    sectionKey: string,
    itemId: string,
    patch: Partial<LayoutItem>,
): LayoutDoc {
    const coords = findSectionItemCoords(doc, sectionKey, itemId);
    if (!coords) return doc;
    return patchItem(doc, coords.sIdx, coords.rIdx, coords.cIdx, itemId, patch);
}

export function patchSectionTextItem(
    doc: LayoutDoc,
    sectionKey: string,
    itemId: string,
    patch: { template?: string; label?: string },
): LayoutDoc {
    const coords = findSectionItemCoords(doc, sectionKey, itemId);
    if (!coords) return doc;
    const item = doc.sections[coords.sIdx]?.rows[coords.rIdx]?.columns[coords.cIdx]?.items.find((it) => it.id === itemId);
    if (!item || item.refKey !== "_template") return doc;
    return patchItem(doc, coords.sIdx, coords.rIdx, coords.cIdx, itemId, {
        template: patch.template ?? item.template,
        label: patch.label ?? item.label,
    });
}

export function patchSectionActionButtonItem(
    doc: LayoutDoc,
    sectionKey: string,
    itemId: string,
    patch: LayoutEditorActionButtonConfig,
): LayoutDoc {
    if (patch.actionKey && !isAllowedLayoutEditorActionKey(patch.actionKey)) {
        return doc;
    }
    const coords = findSectionItemCoords(doc, sectionKey, itemId);
    if (!coords) return doc;
    const item = doc.sections[coords.sIdx]?.rows[coords.rIdx]?.columns[coords.cIdx]?.items.find((it) => it.id === itemId);
    if (!item) return doc;
    const metadata = writeLayoutEditorActionButtonConfig(item.metadata, patch);
    return patchItem(doc, coords.sIdx, coords.rIdx, coords.cIdx, itemId, {
        label: patch.label ?? item.label,
        metadata,
    });
}

export function sectionItemToGroupLoc(doc: LayoutDoc, sectionKey: string, itemId: string): GroupLoc | null {
    const coords = findSectionItemCoords(doc, sectionKey, itemId);
    if (!coords) return null;
    return { sIdx: coords.sIdx, rIdx: coords.rIdx, cIdx: coords.cIdx, itemId };
}

export function isStructuralSectionRefKey(refKey: string): boolean {
    return (OPPORTUNITY_DRAWER_STRUCTURAL_REF_KEYS as readonly string[]).includes(refKey);
}

export function ensureSectionHasRow(doc: LayoutDoc, sectionKey: string, columnCount: SectionColumnCount = 1): LayoutDoc {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return doc;
    if (doc.sections[sIdx]!.rows.length > 0) return doc;
    return addRow(doc, sIdx, columnCount);
}

export function getSectionByKey(doc: LayoutDoc, sectionKey: string): LayoutSection | null {
    return doc.sections.find((s) => s.key === sectionKey) ?? null;
}
