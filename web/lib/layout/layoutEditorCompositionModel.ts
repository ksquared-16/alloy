/**
 * Opportunity drawer visual editor — layout block tree and nested edit paths.
 */

import {
    groupMoveItemHorizontal,
    groupMoveItemVertical,
    groupPatchItem,
    groupRemoveItem,
    patchItem,
    relatedMoveColumn,
    relatedPatchColumn,
    relatedRemoveColumn,
    type GroupLoc,
} from "@/lib/layout/builderOps";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import { readLayoutEditorContactRole, type LayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import type { LayoutCollectionColumn, LayoutCondition, LayoutDoc, LayoutItem, LayoutSection } from "@/lib/layout/layoutV2";
import {
    applyDisplayConfigToColumnPatch,
    applyDisplayConfigToItemPatch,
    readLayoutEditorDisplayConfig,
    type LayoutEditorDisplayConfig,
    validateLayoutEditorDisplayConfig,
} from "@/lib/layout/layoutEditorDisplayConfig";
import {
    buildCrossFieldVisibilityCondition,
    parseCrossFieldVisibility,
    resolveVisibilityRuleKey,
    visibilityConditionForRule,
    type LayoutEditorCrossFieldVisibility,
    type LayoutEditorVisibilityRule,
} from "@/lib/layout/layoutEditorVisibilityRules";
import {
    resolveLayoutEditorItemDisplayLabel,
} from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";
import {
    findLayoutItemLocation,
} from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import {
    moveSectionItemHorizontal,
    moveSectionItemVertical,
    removeSectionItem,
} from "@/lib/layout/layoutEditorSectionComposition";
import {
    moveLayoutBlock,
    removeLayoutBlock,
    resolveLayoutEditorBlockTitle,
} from "@/lib/layout/layoutEditorBlockRegistry";
import { addFieldToCustomBlockRow } from "@/lib/layout/layoutEditorFreeformBlocks";

export type LayoutEditorBlockKind = "card" | "field_group" | "related_list" | "widget" | "field";

export type LayoutEditorNodePath =
    | { kind: "field"; sectionKey: string; itemId: string }
    | { kind: "group_field"; sectionKey: string; blockItemId: string; gr: number; gc: number; fieldId: string }
    | { kind: "column"; sectionKey: string; blockItemId: string; colIdx: number };

export type LayoutEditorBlockNode = {
    id: string;
    kind: LayoutEditorBlockKind;
    title: string;
    itemId: string;
    locked?: boolean;
    children: LayoutEditorFieldNode[];
};

export type LayoutEditorFieldNode = {
    id: string;
    title: string;
    refKey: string;
    path: LayoutEditorNodePath;
    displayConfig: ReturnType<typeof readLayoutEditorDisplayConfig>;
    visibilityRule: LayoutEditorVisibilityRule;
    visibleWhen?: LayoutCondition;
    crossFieldVisibility?: LayoutEditorCrossFieldVisibility | null;
    editable?: boolean;
    contactRole?: LayoutEditorContactRole;
};

const WIDGET_BLOCK_TITLES: Record<string, string> = {
    notes: "Notes Block",
    recent_communication: "Communication Timeline Block",
    activity: "Activity Block",
};

function sectionIndex(doc: LayoutDoc, sectionKey: string): number {
    return doc.sections.findIndex((s) => s.key === sectionKey);
}

function blockTitle(item: LayoutItem, fallback: string): string {
    if (item.kind === "widget_placeholder") {
        return WIDGET_BLOCK_TITLES[item.refKey] ?? item.label ?? "Widget block";
    }
    return resolveLayoutEditorBlockTitle(item, item.label?.trim() || fallback);
}

function fieldNodeFromItem(
    sectionKey: string,
    item: LayoutItem,
    path: LayoutEditorNodePath,
    contactRole?: LayoutEditorContactRole,
): LayoutEditorFieldNode {
    const boundPath = item.refKey.startsWith("_") ? item.refKey : item.refKey;
    return {
        id: "field" in path && "fieldId" in path ? path.fieldId : item.id,
        title: resolveLayoutEditorItemDisplayLabel(item),
        refKey: item.refKey,
        path,
        displayConfig: readLayoutEditorDisplayConfig(item),
        visibilityRule: resolveVisibilityRuleKey(item.visibleWhen, boundPath),
        visibleWhen: item.visibleWhen,
        crossFieldVisibility: parseCrossFieldVisibility(item.visibleWhen, boundPath),
        editable: item.editable === true,
        contactRole,
    };
}

function columnNode(
    sectionKey: string,
    blockItemId: string,
    col: LayoutCollectionColumn,
    colIdx: number,
): LayoutEditorFieldNode {
    return {
        id: `${blockItemId}-col-${colIdx}`,
        title: col.label || resolveLayoutEditorItemDisplayLabel({ id: col.refKey, kind: "field", refKey: col.refKey }),
        refKey: col.refKey,
        path: { kind: "column", sectionKey, blockItemId, colIdx },
        displayConfig: readLayoutEditorDisplayConfig(col),
        visibilityRule: resolveVisibilityRuleKey(col.visibleWhen, col.refKey),
        editable: col.editable === true,
    };
}

/** List layout blocks and nested fields for a section (editor tree). */
export function listSectionLayoutBlocks(doc: LayoutDoc, sectionKey: string): LayoutEditorBlockNode[] {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return [];
    const section = doc.sections[sIdx]!;
    const blocks: LayoutEditorBlockNode[] = [];
    let cardCounter = 0;

    section.rows.forEach((row, rIdx) => {
        row.columns.forEach((col, cIdx) => {
            const fieldItems = col.items.filter((it) => it.kind === "field");
            const structuralItems = col.items.filter((it) => it.kind !== "field");

            if (fieldItems.length > 0) {
                const cardTitle =
                    section.key === "household_contact" && cIdx === 0 ? "Household Card"
                    : section.key === "household_contact" && cIdx === 1 ? "Contact details"
                    : `Card ${rIdx + 1}.${cIdx + 1}`;
                blocks.push({
                    id: `${sectionKey}-card-${rIdx}-${cIdx}`,
                    kind: "card",
                    title: cardTitle,
                    itemId: fieldItems[0]!.id,
                    children: fieldItems.map((item) =>
                        fieldNodeFromItem(sectionKey, item, { kind: "field", sectionKey, itemId: item.id }),
                    ),
                });
            }

            structuralItems.forEach((item) => {
                if (item.kind === "field_group") {
                    const contactRole =
                        item.refKey === "contact_block" ?
                            readLayoutEditorContactRole(item.metadata)
                        :   undefined;
                    const children: LayoutEditorFieldNode[] = [];
                    if (item.rows?.length) {
                        item.rows.forEach((grow, gr) => {
                            grow.columns.forEach((gcol, gc) => {
                                gcol.items.forEach((field) => {
                                    children.push(
                                        fieldNodeFromItem(
                                            sectionKey,
                                            field,
                                            {
                                                kind: "group_field",
                                                sectionKey,
                                                blockItemId: item.id,
                                                gr,
                                                gc,
                                                fieldId: field.id,
                                            },
                                            contactRole,
                                        ),
                                    );
                                });
                            });
                        });
                    } else {
                        (item.items ?? []).forEach((field) => {
                            children.push(
                                fieldNodeFromItem(
                                    sectionKey,
                                    field,
                                    {
                                        kind: "group_field",
                                        sectionKey,
                                        blockItemId: item.id,
                                        gr: 0,
                                        gc: 0,
                                        fieldId: field.id,
                                    },
                                    contactRole,
                                ),
                            );
                        });
                    }
                    blocks.push({
                        id: item.id,
                        kind: "field_group",
                        title: blockTitle(item, "Field group"),
                        itemId: item.id,
                        children,
                    });
                    return;
                }

                if (item.kind === "related_list") {
                    blocks.push({
                        id: item.id,
                        kind: "related_list",
                        title: blockTitle(item, "Related list"),
                        itemId: item.id,
                        children: (item.columns ?? []).map((col, colIdx) => columnNode(sectionKey, item.id, col, colIdx)),
                    });
                    return;
                }

                if (item.kind === "widget_placeholder") {
                    blocks.push({
                        id: item.id,
                        kind: "widget",
                        title: blockTitle(item, "Widget"),
                        itemId: item.id,
                        locked: true,
                        children: [],
                    });
                }
            });

            if (col.items.length === 0) {
                cardCounter += 1;
                blocks.push({
                    id: `${sectionKey}-card-${rIdx}-${cIdx}`,
                    kind: "card",
                    title: cardCounter === 1 ? "Household Card" : "Contact Card",
                    itemId: "",
                    children: [],
                });
            }
        });
    });

    return blocks;
}

/** Resolve a canvas trace path to the canonical field settings node. */
export function resolveLayoutEditorFieldNodeFromSerializedPath(
    doc: LayoutDoc,
    serializedPath: string,
): LayoutEditorFieldNode | null {
    const fieldMatch = serializedPath.match(/^field:([^:]+):(.+)$/);
    if (fieldMatch) {
        const sectionKey = fieldMatch[1]!;
        const itemId = fieldMatch[2]!;
        const loc = findLayoutItemLocation(doc, itemId);
        if (!loc || loc.item.kind !== "field") return null;
        return fieldNodeFromItem(sectionKey, loc.item, { kind: "field", sectionKey, itemId });
    }

    const groupMatch = serializedPath.match(/^group:([^:]+):([^:]+):(\d+):(\d+):(.+)$/);
    if (groupMatch) {
        const sectionKey = groupMatch[1]!;
        const blockItemId = groupMatch[2]!;
        const gr = Number(groupMatch[3]);
        const gc = Number(groupMatch[4]!);
        const fieldId = groupMatch[5]!;
        const loc = groupLoc(doc, sectionKey, blockItemId);
        if (!loc) return null;
        const group = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
        const field = group?.rows?.[gr]?.columns[gc]?.items.find((it) => it.id === fieldId);
        if (!field) return null;
        return fieldNodeFromItem(sectionKey, field, { kind: "group_field", sectionKey, blockItemId, gr, gc, fieldId });
    }

    const columnMatch = serializedPath.match(/^column:([^:]+):([^:]+):(\d+)$/);
    if (columnMatch) {
        const sectionKey = columnMatch[1]!;
        const blockItemId = columnMatch[2]!;
        const colIdx = Number(columnMatch[3]!);
        const loc = groupLoc(doc, sectionKey, blockItemId);
        if (!loc) return null;
        const list = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
        const col = list?.columns?.[colIdx];
        if (!list || !col) return null;
        return columnNode(sectionKey, blockItemId, col, colIdx);
    }

    return null;
}

export function applyLayoutEditorFieldSettingsPatch(
    doc: LayoutDoc,
    path: LayoutEditorNodePath,
    patch: {
        label?: string;
        display?: LayoutEditorDisplayConfig;
        visibility?: LayoutEditorVisibilityRule;
        crossFieldVisibility?: LayoutEditorCrossFieldVisibility | null;
        editable?: boolean;
    },
    boundRefKey?: string,
): LayoutDoc {
    let next = doc;
    if (patch.label !== undefined || patch.display) {
        next = patchLayoutEditorFieldDisplay(next, path, patch.display ?? {}, patch.label);
    }
    if (patch.crossFieldVisibility !== undefined) {
        next = patchLayoutEditorCrossFieldVisibility(next, path, patch.crossFieldVisibility);
    } else if (patch.visibility) {
        next = patchLayoutEditorFieldVisibility(next, path, patch.visibility, boundRefKey);
    }
    if (patch.editable !== undefined) {
        next = patchLayoutEditorFieldEditable(next, path, patch.editable);
    }
    return next;
}

function groupLoc(doc: LayoutDoc, sectionKey: string, blockItemId: string): GroupLoc | null {
    const loc = findLayoutItemLocation(doc, blockItemId);
    if (!loc || loc.item.id !== blockItemId) return null;
    return { sIdx: loc.sIdx, rIdx: loc.rIdx, cIdx: loc.cIdx, itemId: blockItemId };
}

export function patchLayoutEditorFieldDisplay(
    doc: LayoutDoc,
    path: LayoutEditorNodePath,
    displayPatch: LayoutEditorDisplayConfig,
    label?: string,
): LayoutDoc {
    const errors = validateLayoutEditorDisplayConfig(displayPatch, path.kind);
    if (errors.length) return doc;

    if (path.kind === "field") {
        const loc = findLayoutItemLocation(doc, path.itemId);
        if (!loc) return doc;
        const patch: Partial<LayoutItem> = applyDisplayConfigToItemPatch(loc.item, displayPatch);
        if (label !== undefined) patch.label = label;
        return patchItem(doc, loc.sIdx, loc.rIdx, loc.cIdx, path.itemId, patch);
    }

    if (path.kind === "group_field") {
        const loc = groupLoc(doc, path.sectionKey, path.blockItemId);
        if (!loc) return doc;
        const group = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === path.blockItemId);
        const field = group?.rows?.[path.gr]?.columns[path.gc]?.items.find((it) => it.id === path.fieldId);
        if (!field) return doc;
        const patch: Partial<LayoutItem> = applyDisplayConfigToItemPatch(field, displayPatch);
        if (label !== undefined) patch.label = label;
        return groupPatchItem(doc, loc, path.gr, path.gc, path.fieldId, patch);
    }

    if (path.kind === "column") {
        const loc = groupLoc(doc, path.sectionKey, path.blockItemId);
        if (!loc) return doc;
        const item = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === path.blockItemId);
        const col = item?.columns?.[path.colIdx];
        if (!col) return doc;
        const patch: Partial<LayoutCollectionColumn> = {
            ...applyDisplayConfigToColumnPatch(col, displayPatch),
            ...(label !== undefined ? { label } : {}),
        };
        return relatedPatchColumn(doc, loc, path.colIdx, patch);
    }

    return doc;
}

export function patchLayoutEditorFieldEditable(
    doc: LayoutDoc,
    path: LayoutEditorNodePath,
    editable: boolean,
): LayoutDoc {
    if (path.kind === "field") {
        const loc = findLayoutItemLocation(doc, path.itemId);
        if (!loc) return doc;
        return patchItem(doc, loc.sIdx, loc.rIdx, loc.cIdx, path.itemId, { editable });
    }
    if (path.kind === "group_field") {
        const loc = groupLoc(doc, path.sectionKey, path.blockItemId);
        if (!loc) return doc;
        return groupPatchItem(doc, loc, path.gr, path.gc, path.fieldId, { editable });
    }
    if (path.kind === "column") {
        const loc = groupLoc(doc, path.sectionKey, path.blockItemId);
        if (!loc) return doc;
        return relatedPatchColumn(doc, loc, path.colIdx, { editable });
    }
    return doc;
}

export function patchLayoutEditorCrossFieldVisibility(
    doc: LayoutDoc,
    path: LayoutEditorNodePath,
    crossField: LayoutEditorCrossFieldVisibility | null,
): LayoutDoc {
    const condition = crossField ? buildCrossFieldVisibilityCondition(crossField) : undefined;
    return patchLayoutEditorFieldVisibleWhen(doc, path, condition);
}

function patchLayoutEditorFieldVisibleWhen(
    doc: LayoutDoc,
    path: LayoutEditorNodePath,
    condition: LayoutCondition | undefined,
): LayoutDoc {
    if (path.kind === "field") {
        const loc = findLayoutItemLocation(doc, path.itemId);
        if (!loc) return doc;
        return patchItem(doc, loc.sIdx, loc.rIdx, loc.cIdx, path.itemId, { visibleWhen: condition });
    }
    if (path.kind === "group_field") {
        const loc = groupLoc(doc, path.sectionKey, path.blockItemId);
        if (!loc) return doc;
        return groupPatchItem(doc, loc, path.gr, path.gc, path.fieldId, { visibleWhen: condition });
    }
    if (path.kind === "column") {
        const loc = groupLoc(doc, path.sectionKey, path.blockItemId);
        if (!loc) return doc;
        return relatedPatchColumn(doc, loc, path.colIdx, { visibleWhen: condition });
    }
    return doc;
}

export function patchLayoutEditorFieldVisibility(
    doc: LayoutDoc,
    path: LayoutEditorNodePath,
    rule: LayoutEditorVisibilityRule,
    boundPath?: string,
): LayoutDoc {
    const refKey =
        path.kind === "column" ?
            doc.sections[sectionIndex(doc, path.sectionKey)]?.rows
                .flatMap((r) => r.columns.flatMap((c) => c.items))
                .find((it) => it.id === path.blockItemId)
                ?.columns?.[path.colIdx]?.refKey ?? ""
        : path.kind === "group_field" ?
            doc.sections[sectionIndex(doc, path.sectionKey)]?.rows
                .flatMap((r) => r.columns.flatMap((c) => c.items))
                .flatMap((it) => it.rows ?? [])
                .flatMap((row) => row.columns.flatMap((col) => col.items))
                .find((f) => f.id === path.fieldId)?.refKey ?? ""
        :   findLayoutItemLocation(doc, path.itemId)?.item.refKey ?? "";

    const condition = visibilityConditionForRule(rule, boundPath ?? refKey, boundPath);

    return patchLayoutEditorFieldVisibleWhen(doc, path, condition);
}

export function tryAddFieldAtLayoutBlock(
    doc: LayoutDoc,
    sectionKey: string,
    blockItemId: string,
    field: LayoutCatalogField,
    target?: { rowIndex: number; columnIndex: number },
): { ok: true; doc: LayoutDoc } | { ok: false; error: string } {
    const rowIndex = target?.rowIndex ?? 0;
    const columnIndex = target?.columnIndex ?? 0;
    const result = addFieldToCustomBlockRow(doc, blockItemId, rowIndex, columnIndex, field);
    if (!result.ok) return result;
    return { ok: true, doc: result.doc };
}

export function removeLayoutEditorField(doc: LayoutDoc, path: LayoutEditorNodePath): LayoutDoc {
    if (path.kind === "field") {
        return removeSectionItem(doc, path.sectionKey, path.itemId);
    }
    if (path.kind === "group_field") {
        const loc = groupLoc(doc, path.sectionKey, path.blockItemId);
        if (!loc) return doc;
        return groupRemoveItem(doc, loc, path.gr, path.gc, path.fieldId);
    }
    if (path.kind === "column") {
        const loc = groupLoc(doc, path.sectionKey, path.blockItemId);
        if (!loc) return doc;
        return relatedRemoveColumn(doc, loc, path.colIdx);
    }
    return doc;
}

export function moveLayoutEditorField(
    doc: LayoutDoc,
    path: LayoutEditorNodePath,
    direction: -1 | 1,
    axis: "vertical" | "horizontal" = "vertical",
): LayoutDoc {
    if (path.kind === "field") {
        return axis === "horizontal" ?
            moveSectionItemHorizontal(doc, path.sectionKey, path.itemId, direction)
        :   moveSectionItemVertical(doc, path.sectionKey, path.itemId, direction);
    }
    if (path.kind === "group_field") {
        const loc = groupLoc(doc, path.sectionKey, path.blockItemId);
        if (!loc) return doc;
        if (axis === "horizontal") {
            return groupMoveItemHorizontal(doc, loc, path.gr, path.gc, path.fieldId, direction);
        }
        return groupMoveItemVertical(doc, loc, path.gr, path.gc, path.fieldId, direction);
    }
    if (path.kind === "column") {
        const loc = groupLoc(doc, path.sectionKey, path.blockItemId);
        if (!loc) return doc;
        return relatedMoveColumn(doc, loc, path.colIdx, direction);
    }
    return doc;
}

export function serializeLayoutEditorNodePath(path: LayoutEditorNodePath): string {
    if (path.kind === "field") return `field:${path.sectionKey}:${path.itemId}`;
    if (path.kind === "group_field") return `group:${path.sectionKey}:${path.blockItemId}:${path.gr}:${path.gc}:${path.fieldId}`;
    return `column:${path.sectionKey}:${path.blockItemId}:${path.colIdx}`;
}

export function findFieldNodeByPath(blocks: LayoutEditorBlockNode[], serialized: string): LayoutEditorFieldNode | null {
    for (const block of blocks) {
        for (const child of block.children) {
            if (serializeLayoutEditorNodePath(child.path) === serialized) return child;
        }
    }
    return null;
}

export function patchSectionPresentation(
    doc: LayoutDoc,
    sectionKey: string,
    patch: Partial<Pick<LayoutSection, "title" | "metadata">>,
): LayoutDoc {
    const sIdx = sectionIndex(doc, sectionKey);
    if (sIdx < 0) return doc;
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    next.sections[sIdx] = { ...next.sections[sIdx]!, ...patch, title: patch.title ?? next.sections[sIdx]!.title };
    return next;
}

export function serializeLayoutEditorBlockPath(sectionKey: string, blockItemId: string): string {
    return `block:${sectionKey}:${blockItemId}`;
}

export function removeLayoutEditorBlock(doc: LayoutDoc, sectionKey: string, blockItemId: string): LayoutDoc {
    return removeLayoutBlock(doc, sectionKey, blockItemId);
}

export function moveLayoutEditorBlock(
    doc: LayoutDoc,
    sectionKey: string,
    blockItemId: string,
    direction: -1 | 1,
): LayoutDoc {
    return moveLayoutBlock(doc, sectionKey, blockItemId, direction);
}

export function findBlockNodeByItemId(blocks: LayoutEditorBlockNode[], blockItemId: string): LayoutEditorBlockNode | null {
    return blocks.find((b) => b.itemId === blockItemId) ?? null;
}
