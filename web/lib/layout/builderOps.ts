/**
 * Layout V2 — pure doc operations for the Layout Builder (Layout Builder V1).
 *
 * Each function takes a LayoutDoc and returns a NEW LayoutDoc (immutable), so
 * the builder can do field/row/column placement without hand-editing JSON.
 * Pure + deterministic structure → unit-testable. New element ids use a short
 * random suffix (client-side); tests assert structure/uniqueness, not ids.
 */

import {
    LAYOUT_GRID_COLUMNS,
    type LayoutColumn,
    type LayoutCondition,
    type LayoutDoc,
    type LayoutFieldAdornment,
    type LayoutItem,
    type LayoutSection,
} from "./layoutV2";

let _seq = 0;
export function makeId(prefix: string): string {
    _seq += 1;
    return `${prefix}-${_seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function clone(doc: LayoutDoc): LayoutDoc {
    return JSON.parse(JSON.stringify(doc)) as LayoutDoc;
}

/** Column widths for a 1/2/3-column row (clamped to 1..3). */
export function columnWidths(count: number): number[] {
    const n = Math.max(1, Math.min(3, Math.round(count)));
    if (n === 1) return [LAYOUT_GRID_COLUMNS];
    if (n === 2) return [LAYOUT_GRID_COLUMNS / 2, LAYOUT_GRID_COLUMNS / 2];
    return [LAYOUT_GRID_COLUMNS / 3, LAYOUT_GRID_COLUMNS / 3, LAYOUT_GRID_COLUMNS / 3];
}

function emptyColumns(count: number): LayoutColumn[] {
    return columnWidths(count).map((width) => ({ id: makeId("col"), width, items: [] }));
}

// --- sections ---------------------------------------------------------------
export function addSection(doc: LayoutDoc): LayoutDoc {
    const next = clone(doc);
    const n = next.sections.length + 1;
    next.sections.push({
        id: makeId("sec"),
        key: `section_${n}`,
        title: `New section ${n}`,
        collapsible: true,
        defaultExpanded: true,
        rows: [{ id: makeId("row"), columns: emptyColumns(2) }],
    });
    return next;
}
export function removeSection(doc: LayoutDoc, sIdx: number): LayoutDoc {
    const next = clone(doc);
    next.sections.splice(sIdx, 1);
    return next;
}
export function moveSection(doc: LayoutDoc, sIdx: number, dir: -1 | 1): LayoutDoc {
    const next = clone(doc);
    const t = sIdx + dir;
    if (t < 0 || t >= next.sections.length) return doc;
    [next.sections[sIdx], next.sections[t]] = [next.sections[t], next.sections[sIdx]];
    return next;
}
export function patchSection(doc: LayoutDoc, sIdx: number, patch: Partial<LayoutSection>): LayoutDoc {
    const next = clone(doc);
    next.sections[sIdx] = { ...next.sections[sIdx], ...patch };
    return next;
}

// --- rows -------------------------------------------------------------------
export function addRow(doc: LayoutDoc, sIdx: number, columnCount = 2): LayoutDoc {
    const next = clone(doc);
    next.sections[sIdx].rows.push({ id: makeId("row"), columns: emptyColumns(columnCount) });
    return next;
}
export function removeRow(doc: LayoutDoc, sIdx: number, rIdx: number): LayoutDoc {
    const next = clone(doc);
    next.sections[sIdx].rows.splice(rIdx, 1);
    return next;
}
export function moveRow(doc: LayoutDoc, sIdx: number, rIdx: number, dir: -1 | 1): LayoutDoc {
    const next = clone(doc);
    const rows = next.sections[sIdx].rows;
    const t = rIdx + dir;
    if (t < 0 || t >= rows.length) return doc;
    [rows[rIdx], rows[t]] = [rows[t], rows[rIdx]];
    return next;
}

/** Change a row's column count, redistributing existing items contiguously. */
export function setRowColumnCount(doc: LayoutDoc, sIdx: number, rIdx: number, count: number): LayoutDoc {
    const next = clone(doc);
    const row = next.sections[sIdx].rows[rIdx];
    const items = row.columns.flatMap((c) => c.items);
    const widths = columnWidths(count);
    const n = widths.length;
    const cols: LayoutColumn[] = widths.map((width) => ({ id: makeId("col"), width, items: [] }));
    // contiguous distribution, even chunks
    const per = Math.ceil(items.length / n) || 0;
    items.forEach((item, i) => {
        const target = per > 0 ? Math.min(n - 1, Math.floor(i / per)) : 0;
        cols[target].items.push(item);
    });
    row.columns = cols;
    return next;
}

// --- items ------------------------------------------------------------------
export function addItem(doc: LayoutDoc, sIdx: number, rIdx: number, cIdx: number, item: LayoutItem): LayoutDoc {
    const next = clone(doc);
    next.sections[sIdx].rows[rIdx].columns[cIdx].items.push(item);
    return next;
}
export function removeItem(doc: LayoutDoc, sIdx: number, rIdx: number, cIdx: number, itemId: string): LayoutDoc {
    const next = clone(doc);
    const col = next.sections[sIdx].rows[rIdx].columns[cIdx];
    col.items = col.items.filter((it) => it.id !== itemId);
    return next;
}
export function moveItemVertical(doc: LayoutDoc, sIdx: number, rIdx: number, cIdx: number, itemId: string, dir: -1 | 1): LayoutDoc {
    const next = clone(doc);
    const items = next.sections[sIdx].rows[rIdx].columns[cIdx].items;
    const i = items.findIndex((it) => it.id === itemId);
    const t = i + dir;
    if (i < 0 || t < 0 || t >= items.length) return doc;
    [items[i], items[t]] = [items[t], items[i]];
    return next;
}
/** Move an item to the adjacent column (append at end). */
export function moveItemHorizontal(doc: LayoutDoc, sIdx: number, rIdx: number, cIdx: number, itemId: string, dir: -1 | 1): LayoutDoc {
    const next = clone(doc);
    const cols = next.sections[sIdx].rows[rIdx].columns;
    const t = cIdx + dir;
    if (t < 0 || t >= cols.length) return doc;
    const i = cols[cIdx].items.findIndex((it) => it.id === itemId);
    if (i < 0) return doc;
    const [moved] = cols[cIdx].items.splice(i, 1);
    cols[t].items.push(moved);
    return next;
}
export function patchItem(
    doc: LayoutDoc,
    sIdx: number,
    rIdx: number,
    cIdx: number,
    itemId: string,
    patch: Partial<LayoutItem>,
): LayoutDoc {
    const next = clone(doc);
    const col = next.sections[sIdx].rows[rIdx].columns[cIdx];
    col.items = col.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
    return next;
}
export function setItemCondition(
    doc: LayoutDoc,
    sIdx: number,
    rIdx: number,
    cIdx: number,
    itemId: string,
    cond: LayoutCondition | undefined,
): LayoutDoc {
    const next = clone(doc);
    const col = next.sections[sIdx].rows[rIdx].columns[cIdx];
    col.items = col.items.map((it) => {
        if (it.id !== itemId) return it;
        const copy = { ...it };
        if (cond) copy.visibleWhen = cond;
        else delete copy.visibleWhen;
        return copy;
    });
    return next;
}

export function setItemAdornment(
    doc: LayoutDoc,
    sIdx: number,
    rIdx: number,
    cIdx: number,
    itemId: string,
    adornment: LayoutFieldAdornment | undefined,
): LayoutDoc {
    const next = clone(doc);
    const col = next.sections[sIdx].rows[rIdx].columns[cIdx];
    col.items = col.items.map((it) => {
        if (it.id !== itemId) return it;
        const copy = { ...it };
        if (adornment) copy.adornment = adornment;
        else delete copy.adornment;
        return copy;
    });
    return next;
}

/** Build a field LayoutItem from a catalog field. */
export function makeFieldItem(refKey: string, label: string, fieldType: string, sourceEntity?: string): LayoutItem {
    const renderHint =
        fieldType === "date"
            ? "date"
            : fieldType === "datetime"
              ? "datetime"
              : fieldType === "phone"
                ? "phone"
                : fieldType === "money"
                  ? "money"
                  : fieldType === "status"
                    ? "status"
                    : fieldType === "boolean"
                      ? "primary_yes_no"
                      : "text";
    const item: LayoutItem = { id: makeId("item"), kind: "field", refKey, label, renderHint, editable: true };
    if (sourceEntity) item.sourceEntity = sourceEntity;
    return item;
}

/** Build a widget_placeholder LayoutItem from a catalog widget. */
export function makeWidgetItem(widgetKey: string, label: string, displayMode?: string): LayoutItem {
    return {
        id: makeId("item"),
        kind: "widget_placeholder",
        refKey: widgetKey,
        label,
        widget: { widgetKey: `opportunities.${widgetKey}`, displayMode, note: `${label} widget` },
    };
}

export type ItemCoords = { sIdx: number; rIdx: number; cIdx: number };

// ---------------------------------------------------------------------------
// field_group subgrid ops (column-in-column editing)
// A group lives at (sIdx,rIdx,cIdx,itemId); its subgrid is group.rows.
// ---------------------------------------------------------------------------
export type GroupLoc = { sIdx: number; rIdx: number; cIdx: number; itemId: string };

function groupOf(doc: LayoutDoc, loc: GroupLoc): LayoutItem | undefined {
    const g = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((it) => it.id === loc.itemId);
    if (g && !Array.isArray(g.rows)) g.rows = [];
    return g;
}

/** Add an empty field_group (block) with one 2-column subgrid row to a column. */
export function addGroup(doc: LayoutDoc, sIdx: number, rIdx: number, cIdx: number): LayoutDoc {
    const next = clone(doc);
    next.sections[sIdx].rows[rIdx].columns[cIdx].items.push({
        id: makeId("grp"),
        kind: "field_group",
        refKey: "block",
        label: "Block",
        rows: [{ id: makeId("row"), columns: emptyColumns(2) }],
    });
    return next;
}
export function groupAddRow(doc: LayoutDoc, loc: GroupLoc, columnCount = 2): LayoutDoc {
    const next = clone(doc);
    groupOf(next, loc)?.rows!.push({ id: makeId("row"), columns: emptyColumns(columnCount) });
    return next;
}
export function groupRemoveRow(doc: LayoutDoc, loc: GroupLoc, gr: number): LayoutDoc {
    const next = clone(doc);
    groupOf(next, loc)?.rows!.splice(gr, 1);
    return next;
}
export function groupMoveRow(doc: LayoutDoc, loc: GroupLoc, gr: number, dir: -1 | 1): LayoutDoc {
    const next = clone(doc);
    const rows = groupOf(next, loc)?.rows;
    if (!rows) return doc;
    const t = gr + dir;
    if (t < 0 || t >= rows.length) return doc;
    [rows[gr], rows[t]] = [rows[t], rows[gr]];
    return next;
}
export function groupSetRowColumnCount(doc: LayoutDoc, loc: GroupLoc, gr: number, count: number): LayoutDoc {
    const next = clone(doc);
    const row = groupOf(next, loc)?.rows?.[gr];
    if (!row) return doc;
    const items = row.columns.flatMap((c) => c.items);
    const widths = columnWidths(count);
    const n = widths.length;
    const cols: LayoutColumn[] = widths.map((width) => ({ id: makeId("col"), width, items: [] }));
    const per = Math.ceil(items.length / n) || 0;
    items.forEach((item, i) => cols[per > 0 ? Math.min(n - 1, Math.floor(i / per)) : 0].items.push(item));
    row.columns = cols;
    return next;
}
export function groupAddItem(doc: LayoutDoc, loc: GroupLoc, gr: number, gc: number, item: LayoutItem): LayoutDoc {
    const next = clone(doc);
    groupOf(next, loc)?.rows?.[gr]?.columns[gc]?.items.push(item);
    return next;
}
export function groupRemoveItem(doc: LayoutDoc, loc: GroupLoc, gr: number, gc: number, itemId: string): LayoutDoc {
    const next = clone(doc);
    const col = groupOf(next, loc)?.rows?.[gr]?.columns[gc];
    if (col) col.items = col.items.filter((it) => it.id !== itemId);
    return next;
}
export function groupMoveItemVertical(doc: LayoutDoc, loc: GroupLoc, gr: number, gc: number, itemId: string, dir: -1 | 1): LayoutDoc {
    const next = clone(doc);
    const items = groupOf(next, loc)?.rows?.[gr]?.columns[gc]?.items;
    if (!items) return doc;
    const i = items.findIndex((it) => it.id === itemId);
    const t = i + dir;
    if (i < 0 || t < 0 || t >= items.length) return doc;
    [items[i], items[t]] = [items[t], items[i]];
    return next;
}
export function groupPatchItem(doc: LayoutDoc, loc: GroupLoc, gr: number, gc: number, itemId: string, patch: Partial<LayoutItem>): LayoutDoc {
    const next = clone(doc);
    const col = groupOf(next, loc)?.rows?.[gr]?.columns[gc];
    if (col) col.items = col.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
    return next;
}
