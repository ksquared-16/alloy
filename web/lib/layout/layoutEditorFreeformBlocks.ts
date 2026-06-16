/**
 * Layout editor — freeform block and row builder operations (Phase 5.9).
 */

import {
    addItem,
    groupAddItem,
    groupAddRow,
    groupRemoveRow,
    makeFieldItem,
    makeId,
    relatedAddColumn,
    type GroupLoc,
} from "@/lib/layout/builderOps";
import type { LayoutCatalogField } from "@/lib/layout/fieldCatalog";
import type { LayoutDoc, LayoutItem, LayoutRow } from "@/lib/layout/layoutV2";
import { LAYOUT_GRID_COLUMNS } from "@/lib/layout/layoutV2";
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
    type LayoutEditorDataContext,
} from "@/lib/layout/layoutEditorBlockConfig";
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
    const refKey = blockRefKeyForType(blockType);
    const visibilityRule = defaultBlockVisibilityRule(blockType === "contact_card" ? "contact_card" : blockType, role);
    const metadata = writeLayoutEditorBlockConfig(
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
            metadata,
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

    if (patch.title !== undefined) item.label = patch.title.trim();
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
    let next = groupAddRow(doc, loc, columnCount);
    const item = next.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    const rowId = item?.rows?.[item.rows.length - 1]?.id;
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
): { ok: true; doc: LayoutDoc } | { ok: false; error: string } {
    if (!isAllowedOpportunityDrawerFieldRefKey(field.refKey)) {
        return { ok: false, error: `"${field.refKey}" is not allowed on the opportunity drawer.` };
    }
    const loc = findLayoutBlockLocation(doc, blockItemId);
    if (!loc) return { ok: false, error: "Block not found." };
    const item = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === blockItemId);
    if (item?.kind === "related_list") {
        return {
            ok: true,
            doc: relatedAddColumn(doc, loc, {
                label: field.fieldLabel,
                refKey: field.refKey,
                width: "medium",
                renderHint: field.fieldType === "status" ? "status" : field.fieldType === "date" ? "date" : "text",
            }),
        };
    }
    if (item?.kind !== "field_group") return { ok: false, error: "Add field is supported on layout blocks only." };
    const fieldItem = makeFieldItem(field.refKey, field.fieldLabel, field.fieldType);
    return { ok: true, doc: groupAddItem(doc, loc, rowIndex, columnIndex, fieldItem) };
}

export function listCustomBlockRows(item: LayoutItem): Array<{ rowIndex: number; rowId: string; columnCount: number; fields: LayoutItem[] }> {
    if (item.kind === "related_list") {
        return [
            {
                rowIndex: 0,
                rowId: `${item.id}-columns`,
                columnCount: Math.max(1, item.columns?.length ?? 1),
                fields: (item.columns ?? []).map((col, idx) => ({
                    id: `${item.id}-col-${idx}`,
                    kind: "field" as const,
                    refKey: col.refKey,
                    label: col.label,
                })),
            },
        ];
    }
    return (item.rows ?? []).map((row, rowIndex) => ({
        rowIndex,
        rowId: row.id,
        columnCount: Math.max(1, row.columns.length),
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
