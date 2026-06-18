/**
 * Layout editor — freeform block and row builder operations (Phase 5.9).
 */

import {
    addItem,
    groupAddItem,
    groupAddRow,
    groupMoveItemHorizontal,
    groupMoveItemVertical,
    groupRemoveItem,
    groupRemoveRow,
    makeFieldItem,
    makeId,
    makeTemplateItem,
    relatedAddColumn,
    relatedMoveColumn,
    relatedRemoveColumn,
    type GroupLoc,
} from "@/lib/layout/builderOps";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutItem, LayoutRow } from "@/lib/layout/layoutV2";
import { LAYOUT_GRID_COLUMNS } from "@/lib/layout/layoutV2";
import {
    makeLayoutEditorActionButtonItem,
    type LayoutEditorActionButtonConfig,
} from "@/lib/layout/layoutEditorActionButton";
import {
    blockRefKeyForType,
    blockVisibilityCondition,
    defaultBlockVisibilityRule,
    readLayoutEditorBlockConfig,
    writeLayoutEditorBlockConfig,
    writeLayoutEditorRowConfig,
    type LayoutEditorBlockConfig,
    type LayoutEditorBlockEditMode,
    type LayoutEditorBlockType,
    type LayoutEditorChildRowGroup,
    type LayoutEditorDataContext,
} from "@/lib/layout/layoutEditorBlockConfig";
import {
    makeCustomBlockRefKey,
    writeCustomLayoutEditorMetadata,
} from "@/lib/layout/layoutEditorGeneratedKeys";
import {
    contactRoleFieldRefs,
    LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY,
    readLayoutEditorContactRole,
    type LayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";
import { findLayoutBlockLocation, LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY } from "@/lib/layout/layoutEditorBlockRegistry";
import {
    DEFAULT_LAYOUT_EDITOR_ROW_TEMPLATE_CONFIG,
    writeLayoutEditorRowTemplateConfig,
} from "@/lib/layout/layoutEditorRowTemplateConfig";
import { isAllowedOpportunityDrawerFieldRefKey } from "@/lib/layout/surfaceLayoutRegistry";

export type CreateCustomBlockInput = {
    title: string;
    blockType: LayoutEditorBlockType;
    dataContext: LayoutEditorDataContext;
    contactRole?: LayoutEditorContactRole;
    editMode?: LayoutEditorBlockEditMode;
    showTitle?: boolean;
    columnCount?: 1 | 2 | 3;
};

function columnWidths(count: 1 | 2 | 3): number[] {
    if (count === 1) return [LAYOUT_GRID_COLUMNS];
    if (count === 2) return [LAYOUT_GRID_COLUMNS / 2, LAYOUT_GRID_COLUMNS / 2];
    return [4, 4, 4];
}

function emptyRow(columnCount: 1 | 2 | 3 = 1): LayoutRow {
    return {
        id: makeId("row"),
        columns: columnWidths(columnCount).map((width) => ({
            id: makeId("col"),
            width,
            items: [],
        })),
    };
}

function buildContactRoleRows(role: LayoutEditorContactRole): LayoutRow[] {
    const refs = contactRoleFieldRefs(role);
    return [
        {
            id: makeId("row"),
            columns: [{ id: makeId("col"), width: LAYOUT_GRID_COLUMNS, items: [makeFieldItem(refs.name, "Full name", "text")] }],
        },
        {
            id: makeId("row"),
            columns: [
                { id: makeId("col"), width: LAYOUT_GRID_COLUMNS / 2, items: [makeFieldItem(refs.email, "Email", "text")] },
                { id: makeId("col"), width: LAYOUT_GRID_COLUMNS / 2, items: [makeFieldItem(refs.phone, "Phone", "phone")] },
            ],
        },
    ];
}

export function buildCustomLayoutBlock(input: CreateCustomBlockInput): LayoutItem {
    const role = input.contactRole ?? "primary";
    const blockType = input.blockType;
    const refKey = blockType === "contact_card" ? blockRefKeyForType(blockType) : makeCustomBlockRefKey();
    const visibilityRule = defaultBlockVisibilityRule(blockType === "contact_card" ? "contact_card" : blockType, role);
    const metadata = writeCustomLayoutEditorMetadata(
        {
            [LAYOUT_EDITOR_BLOCK_TEMPLATE_METADATA_KEY]: "custom_layout_block",
            ...(blockType === "contact_card" ? { [LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY]: role } : {}),
            ...(blockType === "child_row_template" ?
                writeLayoutEditorRowTemplateConfig(undefined, DEFAULT_LAYOUT_EDITOR_ROW_TEMPLATE_CONFIG)
            :   {}),
        },
        {
            blockType,
            dataContext: input.dataContext,
            showTitle: input.showTitle ?? true,
            editMode: input.editMode ?? "display_only",
            visibilityRule,
        },
    );

    if (blockType === "child_row_template") {
        return {
            id: makeId("item"),
            kind: "related_list",
            refKey: "children",
            label: input.title.trim() || "Child row template",
            source: "children",
            displayMode: "table",
            related: { entityType: "child" },
            visibleWhen: blockVisibilityCondition(visibilityRule, metadata),
            metadata: writeLayoutEditorBlockConfig(
                writeLayoutEditorRowTemplateConfig(undefined, DEFAULT_LAYOUT_EDITOR_ROW_TEMPLATE_CONFIG),
                {
                    blockType: "child_row_template",
                    dataContext: "child",
                    childRowGroups: [
                        { columnIndices: [0], columnCount: 1 },
                        { columnIndices: [1, 2, 3], columnCount: 3 },
                        { columnIndices: [4], columnCount: 1 },
                    ],
                },
            ),
            columns: [
                { label: "Child", refKey: "child.name", width: "medium" },
                { label: "Program", refKey: "child.program", width: "medium" },
                { label: "Desired start", refKey: "child.desired_start_date", width: "medium", renderHint: "date" },
                { label: "DOB / Age", refKey: "child.dob_age", width: "medium" },
                { label: "Status", refKey: "child.status", width: "medium", renderHint: "status" },
            ],
        };
    }

    const rows =
        blockType === "contact_card" ? buildContactRoleRows(role)
        : [emptyRow(input.columnCount ?? 1)];

    return {
        id: makeId("grp"),
        kind: "field_group",
        refKey,
        label: input.title.trim() || "New block",
        rows,
        visibleWhen: blockVisibilityCondition(visibilityRule, metadata, contactRoleFieldRefs(role).name),
        metadata,
    };
}

function sectionInsertColumn(doc: LayoutDoc, sectionKey: string): { sIdx: number; rIdx: number; cIdx: number } | null {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return null;
    const row = doc.sections[sIdx]!.rows[0];
    if (!row) return null;
    const contactColumn = row.columns[1] ?? row.columns[0];
    return { sIdx, rIdx: 0, cIdx: row.columns.indexOf(contactColumn!) };
}

export function createCustomBlockInSection(
    doc: LayoutDoc,
    sectionKey: string,
    input: CreateCustomBlockInput,
): { ok: true; doc: LayoutDoc; blockItemId: string } | { ok: false; error: string } {
    const target = sectionInsertColumn(doc, sectionKey);
    if (!target) return { ok: false, error: "Section structure not found." };
    const built = buildCustomLayoutBlock(input);
    const next = addItem(doc, target.sIdx, target.rIdx, target.cIdx, built);
    return { ok: true, doc: next, blockItemId: built.id };
}

export function patchCustomBlockConfig(
    doc: LayoutDoc,
    blockItemId: string,
    patch: LayoutEditorBlockConfig & { title?: string; contactRole?: LayoutEditorContactRole },
): LayoutDoc {
    const loc = findLayoutBlockLocation(doc, blockItemId);
    if (!loc) return doc;
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    const item = next.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    if (!item) return doc;

    if (patch.title !== undefined) item.label = patch.title.replace(/^\s+|\s+$/g, "") || item.label;
    if (patch.contactRole && item.refKey === "contact_block") {
        item.metadata = { ...(item.metadata ?? {}), [LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY]: patch.contactRole };
        item.rows = buildContactRoleRows(patch.contactRole);
        patch.visibilityRule = defaultBlockVisibilityRule("contact_card", patch.contactRole);
    }

    const { title: _title, contactRole: _role, ...configPatch } = patch;
    item.metadata = writeLayoutEditorBlockConfig(item.metadata, configPatch);
    if (configPatch.visibilityRule || patch.contactRole) {
        const role = readLayoutEditorContactRole(item.metadata);
        item.visibleWhen = blockVisibilityCondition(
            readLayoutEditorBlockConfig(item.metadata).visibilityRule,
            item.metadata,
            contactRoleFieldRefs(role).name,
        );
    }
    return next;
}

export function addRowToCustomBlock(
    doc: LayoutDoc,
    blockItemId: string,
    columnCount: 1 | 2 | 3 = 1,
): LayoutDoc {
    const loc = findLayoutBlockLocation(doc, blockItemId);
    if (!loc) return doc;
    const item = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    if (item?.kind === "related_list") {
        const groups = readChildRowGroups(item);
        return writeChildRowGroups(doc, loc, [...groups, { columnIndices: [], columnCount }]);
    }
    let next = groupAddRow(doc, loc, columnCount);
    const updated = next.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    const rowId = updated?.rows?.[updated.rows.length - 1]?.id;
    if (rowId) {
        next = patchCustomBlockConfig(next, blockItemId, {
            rowConfigs: {
                [rowId]: { columnCount, showLabel: false },
            },
        });
    }
    return next;
}

export function removeRowFromCustomBlock(doc: LayoutDoc, blockItemId: string, rowIndex: number): LayoutDoc {
    const loc = findLayoutBlockLocation(doc, blockItemId);
    if (!loc) return doc;
    const item = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    if (item?.kind === "related_list") {
        const groups = readChildRowGroups(item);
        if (rowIndex < 0 || rowIndex >= groups.length) return doc;
        const removed = groups[rowIndex]!;
        const nextGroups = groups.filter((_, i) => i !== rowIndex);
        let next = writeChildRowGroups(doc, loc, nextGroups);
        for (const colIdx of [...removed.columnIndices].sort((a, b) => b - a)) {
            next = relatedRemoveColumn(next, loc, colIdx);
            const updated = next.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
            const remapped = readChildRowGroups(updated!).map((g) => ({
                ...g,
                columnIndices: g.columnIndices
                    .filter((idx) => idx !== colIdx)
                    .map((idx) => (idx > colIdx ? idx - 1 : idx)),
            }));
            next = writeChildRowGroups(next, loc, remapped);
        }
        return next;
    }
    return groupRemoveRow(doc, loc, rowIndex);
}

export function setCustomBlockRowColumnCount(
    doc: LayoutDoc,
    blockItemId: string,
    rowIndex: number,
    columnCount: 1 | 2 | 3,
): LayoutDoc {
    const loc = findLayoutBlockLocation(doc, blockItemId);
    if (!loc) return doc;
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    const item = next.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    if (item?.kind === "related_list") {
        const groups = readChildRowGroups(item);
        const group = groups[rowIndex];
        if (!group) return doc;
        group.columnCount = columnCount;
        if (group.columnIndices.length > columnCount) {
            group.columnIndices = group.columnIndices.slice(0, columnCount);
        }
        item.metadata = writeLayoutEditorBlockConfig(item.metadata, { childRowGroups: groups });
        return next;
    }
    const row = item?.rows?.[rowIndex];
    if (!row) return doc;
    const existingItems = row.columns.flatMap((col) => col.items);
    row.columns = columnWidths(columnCount).map((width) => ({
        id: makeId("col"),
        width,
        items: [],
    }));
    existingItems.forEach((field, index) => {
        const colIndex = Math.min(row.columns.length - 1, index);
        row.columns[colIndex]!.items.push(field);
    });
    if (row.id) {
        item!.metadata = writeLayoutEditorRowConfig(item!.metadata, row.id, { columnCount });
    }
    return next;
}

export function addFieldToCustomBlockRow(
    doc: LayoutDoc,
    blockItemId: string,
    rowIndex: number,
    columnIndex: number,
    field: LayoutCatalogField,
): AddBlockFieldResult {
    if (!isAllowedOpportunityDrawerFieldRefKey(field.refKey)) {
        return { ok: false, error: `"${field.refKey}" is not allowed on the opportunity drawer.` };
    }
    const loc = findLayoutBlockLocation(doc, blockItemId);
    if (!loc) return { ok: false, error: "Block not found." };
    const item = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    if (item?.kind === "related_list") {
        const groups = readChildRowGroups(item);
        while (groups.length <= rowIndex) groups.push({ columnIndices: [] });
        const next = relatedAddColumn(doc, loc, {
            label: field.fieldLabel,
            refKey: field.refKey,
            width: "medium",
            renderHint: field.fieldType === "status" ? "status" : field.fieldType === "date" ? "date" : "text",
        });
        const updated = next.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
        const colIdx = (updated?.columns?.length ?? 1) - 1;
        const rowGroup = groups[rowIndex]!;
        rowGroup.columnIndices[columnIndex] = colIdx;
        const withGroups = writeChildRowGroups(next, loc, groups);
        return { ok: true, doc: withGroups, fieldId: `${blockItemId}-col-${colIdx}` };
    }
    if (item?.kind !== "field_group") return { ok: false, error: "Add field is supported on layout blocks only." };
    const rows = item.rows ?? [];
    if (!rows[rowIndex]) return { ok: false, error: "Block row not found." };
    if (!rows[rowIndex]!.columns[columnIndex]) return { ok: false, error: "Block column not found." };
    const fieldItem = makeFieldItem(field.refKey, field.fieldLabel, field.fieldType);
    return { ok: true, doc: groupAddItem(doc, loc, rowIndex, columnIndex, fieldItem), fieldId: fieldItem.id };
}

export function addTextToCustomBlockRow(
    doc: LayoutDoc,
    blockItemId: string,
    rowIndex: number,
    columnIndex: number,
    template = "Display text",
    label = "Text",
): AddBlockFieldResult {
    const loc = findLayoutBlockLocation(doc, blockItemId);
    if (!loc) return { ok: false, error: "Block not found." };
    const item = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    if (item?.kind !== "field_group") return { ok: false, error: "Text items are supported inside layout blocks only." };
    const textItem = makeTemplateItem(template, label);
    return { ok: true, doc: groupAddItem(doc, loc, rowIndex, columnIndex, textItem), fieldId: textItem.id };
}

export function addActionToCustomBlockRow(
    doc: LayoutDoc,
    blockItemId: string,
    rowIndex: number,
    columnIndex: number,
    config?: Partial<LayoutEditorActionButtonConfig>,
): AddBlockFieldResult {
    const loc = findLayoutBlockLocation(doc, blockItemId);
    if (!loc) return { ok: false, error: "Block not found." };
    const item = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    if (item?.kind !== "field_group") return { ok: false, error: "Action items are supported inside layout blocks only." };
    const actionItem = makeLayoutEditorActionButtonItem(config);
    return { ok: true, doc: groupAddItem(doc, loc, rowIndex, columnIndex, actionItem), fieldId: actionItem.id };
}

export function removeCustomBlockNestedField(
    doc: LayoutDoc,
    blockItemId: string,
    rowIndex: number,
    columnIndex: number,
    fieldId: string,
): LayoutDoc {
    const loc = findLayoutBlockLocation(doc, blockItemId);
    if (!loc) return doc;
    const item = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    if (item?.kind === "related_list") {
        const match = fieldId.match(/-col-(\d+)$/);
        const colIdx = match ? Number(match[1]) : Number.NaN;
        if (Number.isNaN(colIdx)) return doc;
        let next = relatedRemoveColumn(doc, loc, colIdx);
        const updated = next.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
        const groups = readChildRowGroups(updated!).map((g) => ({
            columnIndices: g.columnIndices
                .filter((idx) => idx !== colIdx)
                .map((idx) => (idx > colIdx ? idx - 1 : idx)),
        }));
        return writeChildRowGroups(next, loc, groups);
    }
    return groupRemoveItem(doc, loc, rowIndex, columnIndex, fieldId);
}

export function moveCustomBlockNestedField(
    doc: LayoutDoc,
    blockItemId: string,
    rowIndex: number,
    columnIndex: number,
    fieldId: string,
    direction: -1 | 1,
    axis: "vertical" | "horizontal" = "vertical",
): LayoutDoc {
    const loc = findLayoutBlockLocation(doc, blockItemId);
    if (!loc) return doc;
    const item = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    if (item?.kind === "related_list") {
        const groups = readChildRowGroups(item);
        const group = groups[rowIndex];
        if (!group) return doc;
        if (axis === "horizontal") {
            const targetSlot = columnIndex + direction;
            if (targetSlot < 0 || targetSlot >= childRowGroupColumnCount(group)) return doc;
            const nextGroups = groups.map((g, i) => {
                if (i !== rowIndex) return g;
                const indices = [...g.columnIndices];
                const current = indices[columnIndex];
                indices[columnIndex] = indices[targetSlot];
                indices[targetSlot] = current;
                return { ...g, columnIndices: indices };
            });
            return writeChildRowGroups(doc, loc, nextGroups);
        }
        const match = fieldId.match(/-col-(\d+)$/);
        const colIdx = match ? Number(match[1]) : Number.NaN;
        if (Number.isNaN(colIdx)) return doc;
        return relatedMoveColumn(doc, loc, colIdx, direction);
    }
    if (axis === "horizontal") {
        return groupMoveItemHorizontal(doc, loc, rowIndex, columnIndex, fieldId, direction);
    }
    return groupMoveItemVertical(doc, loc, rowIndex, columnIndex, fieldId, direction);
}

export type CustomBlockRowColumn = {
    colIndex: number;
    colId: string;
    items: LayoutItem[];
    /** Related-list column index when kind is related_list. */
    relatedColumnIndex?: number;
};

export type CustomBlockRowLayout = {
    rowIndex: number;
    rowId: string;
    columnCount: number;
    columns: CustomBlockRowColumn[];
};

export type BlockFieldTarget = {
    blockItemId: string;
    rowIndex: number;
    columnIndex: number;
};

export type AddBlockFieldResult = { ok: true; doc: LayoutDoc; fieldId: string } | { ok: false; error: string };

function childRowGroupColumnCount(group: LayoutEditorChildRowGroup): number {
    return Math.max(1, group.columnCount ?? (group.columnIndices.length || 1));
}

function defaultChildRowGroups(columnCount: number): LayoutEditorChildRowGroup[] {
    if (columnCount <= 1) return [{ columnIndices: [0] }];
    return [{ columnIndices: [0] }, { columnIndices: Array.from({ length: columnCount - 1 }, (_, i) => i + 1) }];
}

function readChildRowGroups(item: LayoutItem): LayoutEditorChildRowGroup[] {
    const fromConfig = readLayoutEditorBlockConfig(item.metadata).childRowGroups;
    if (fromConfig?.length) return fromConfig;
    const count = item.columns?.length ?? 0;
    if (count === 0) return [{ columnIndices: [] }];
    return defaultChildRowGroups(count);
}

function writeChildRowGroups(doc: LayoutDoc, loc: GroupLoc, groups: LayoutEditorChildRowGroup[]): LayoutDoc {
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    const item = next.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === loc.itemId);
    if (!item) return doc;
    item.metadata = writeLayoutEditorBlockConfig(item.metadata, { childRowGroups: groups });
    return next;
}

export function listCustomBlockRowLayout(item: LayoutItem): CustomBlockRowLayout[] {
    if (item.kind === "related_list") {
        const groups = readChildRowGroups(item);
        const columns = item.columns ?? [];
        return groups.map((group, rowIndex) => {
            const columnCount = childRowGroupColumnCount(group);
            return {
                rowIndex,
                rowId: `${item.id}-row-${rowIndex}`,
                columnCount,
                columns: Array.from({ length: columnCount }, (_, slot) => {
                    const colIdx = group.columnIndices[slot];
                    const col = colIdx != null && colIdx >= 0 ? columns[colIdx] : undefined;
                    return {
                        colIndex: slot,
                        colId: `${item.id}-row-${rowIndex}-col-${slot}`,
                        relatedColumnIndex: colIdx != null && colIdx >= 0 ? colIdx : undefined,
                            items: col ?
                            [{
                                id: `${item.id}-col-${colIdx}`,
                                kind: "field" as const,
                                refKey: col.refKey,
                                label: col.label,
                                renderHint: col.renderHint,
                                adornment: col.adornment,
                                editable: col.editable,
                                metadata: col.metadata,
                            }]
                        :   [],
                    };
                }),
            };
        });
    }
    return (item.rows ?? []).map((row, rowIndex) => ({
        rowIndex,
        rowId: row.id,
        columnCount: Math.max(1, row.columns.length),
        columns: row.columns.map((col, colIndex) => ({
            colIndex,
            colId: col.id,
            items: col.items,
        })),
    }));
}

/** @deprecated use listCustomBlockRowLayout */
export function listCustomBlockRows(item: LayoutItem): Array<{ rowIndex: number; rowId: string; columnCount: number; fields: LayoutItem[] }> {
    return listCustomBlockRowLayout(item).map((row) => ({
        rowIndex: row.rowIndex,
        rowId: row.rowId,
        columnCount: row.columnCount,
        fields: row.columns.flatMap((col) => col.items),
    }));
}

export function deleteCustomBlock(doc: LayoutDoc, sectionKey: string, blockItemId: string): LayoutDoc {
    const sIdx = doc.sections.findIndex((s) => s.key === sectionKey);
    if (sIdx < 0) return doc;
    const next = JSON.parse(JSON.stringify(doc)) as LayoutDoc;
    for (const row of next.sections[sIdx]!.rows) {
        for (const col of row.columns) {
            col.items = col.items.filter((it) => it.id !== blockItemId);
        }
    }
    return next;
}
