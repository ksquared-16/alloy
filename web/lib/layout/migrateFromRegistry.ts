/**
 * Layout V2 — migration utility (Deliverable E).
 *
 * Converts the hardcoded Layer-0 registry in `web/lib/entityPresentation.ts`
 * into Layout V2 documents, so an org can be bootstrapped with layouts that are
 * byte-for-byte faithful to today's presentation. This is the ONLY coupling
 * between Layout V2 and the legacy registry, and it is read-only — it never
 * mutates the registry (which must remain intact as the resolution fallback).
 *
 * Determinism: all ids are derived from the (entityType, surface, path), so the
 * same registry always produces the same document (golden-snapshot friendly).
 */

import {
    getEntityPresentation,
    type EntityDrawerFieldConfig,
    type EntityDrawerSectionConfig,
    type EntityPresentationType,
    type EntityTableColumnConfig,
} from "@/lib/entityPresentation";
import {
    LAYOUT_DOC_FORMAT_VERSION,
    LAYOUT_GRID_COLUMNS,
    type LayoutColumn,
    type LayoutDoc,
    type LayoutItem,
    type LayoutRenderHint,
    type LayoutRow,
    type LayoutSection,
    type LayoutSurface,
} from "./layoutV2";

/**
 * All entity types known to the registry. The `Record<EntityPresentationType,…>`
 * shape forces a compile error here if the registry union gains a new member,
 * so this list can never silently drift out of sync.
 */
const ALL_TYPES_PRESENCE: Record<EntityPresentationType, true> = {
    customers: true,
    locations: true,
    opportunities: true,
    subscriptions: true,
    jobs: true,
    schedules: true,
    payments: true,
    documents: true,
    vendors: true,
    contacts: true,
    customer_members: true,
    persons: true,
    workflows: true,
    discount_redemptions: true,
    service_offerings: true,
    service_plan_templates: true,
    addons: true,
};

export const ALL_ENTITY_PRESENTATION_TYPES = Object.keys(ALL_TYPES_PRESENCE) as EntityPresentationType[];

function slug(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64) || "x";
}

function id(...parts: (string | number)[]): string {
    return parts.map((p) => (typeof p === "number" ? String(p) : slug(p))).join("-");
}

function fieldItem(
    base: string,
    f: EntityDrawerFieldConfig,
): LayoutItem {
    const item: LayoutItem = {
        id: id(base, "item", f.key),
        kind: "field",
        refKey: f.key,
        label: f.label,
    };
    if (f.renderHint) item.renderHint = f.renderHint as LayoutRenderHint;
    if (f.editable !== undefined) item.editable = f.editable;
    if (f.locked !== undefined) item.locked = f.locked;
    if (f.linkTarget) item.linkTarget = { idField: f.linkTarget.idField, entityType: f.linkTarget.entityType };
    return item;
}

/**
 * Greedy pack drawer fields into rows of a `gridCols`-wide track (1 or 2).
 * A span-2 field takes the full width; span-1 takes half (in a 2-col section).
 * This reproduces the wrapping behavior of the existing CSS-grid section.
 */
function packFieldsIntoRows(
    base: string,
    fields: EntityDrawerFieldConfig[],
    gridCols: 1 | 2,
): LayoutRow[] {
    const cellWidth = gridCols === 2 ? LAYOUT_GRID_COLUMNS / 2 : LAYOUT_GRID_COLUMNS; // 6 or 12
    const rows: LayoutRow[] = [];
    let current: LayoutColumn[] = [];
    let used = 0;
    let rowIdx = 0;

    const flush = () => {
        if (current.length > 0) {
            rows.push({ id: id(base, "row", rowIdx), columns: current });
            rowIdx += 1;
            current = [];
            used = 0;
        }
    };

    for (const f of fields) {
        const span = f.span === 2 || gridCols === 1 ? LAYOUT_GRID_COLUMNS : cellWidth;
        if (used + span > LAYOUT_GRID_COLUMNS) flush();
        const colIdx = current.length;
        current.push({
            id: id(base, "row", rowIdx, "col", colIdx),
            width: span,
            items: [fieldItem(id(base, "row", rowIdx, "col", colIdx), f)],
        });
        used += span;
        if (used >= LAYOUT_GRID_COLUMNS) flush();
    }
    flush();
    return rows;
}

function drawerSection(entityType: string, sec: EntityDrawerSectionConfig, index: number): LayoutSection {
    const base = id(entityType, "drawer", "sec", sec.key || `s${index}`);
    const gridCols: 1 | 2 = sec.gridCols === 2 ? 2 : 1;
    const rows: LayoutRow[] = [];

    if (sec.subsections && sec.subsections.length > 0) {
        // Each subsection becomes a full-width field_group item (a labeled cluster).
        sec.subsections.forEach((sub, si) => {
            const groupBase = id(base, "grp", sub.title || `g${si}`);
            const group: LayoutItem = {
                id: id(groupBase, "item"),
                kind: "field_group",
                refKey: slug(sub.title || `group_${si}`),
                label: sub.title,
                items: sub.fields.map((f) => fieldItem(groupBase, f)),
            };
            rows.push({
                id: id(base, "row", `sub${si}`),
                columns: [{ id: id(base, "row", `sub${si}`, "col", 0), width: LAYOUT_GRID_COLUMNS, items: [group] }],
            });
        });
    } else if (sec.fields && sec.fields.length > 0) {
        rows.push(...packFieldsIntoRows(base, sec.fields, gridCols));
    } else {
        // Empty section in the registry == a hardcoded widget block (e.g. Jobs
        // pricing breakdown). Represent it as a widget placeholder so it can be
        // positioned without trying to generalize the widget itself.
        rows.push({
            id: id(base, "row", 0),
            columns: [
                {
                    id: id(base, "row", 0, "col", 0),
                    width: LAYOUT_GRID_COLUMNS,
                    items: [
                        {
                            id: id(base, "item", "widget"),
                            kind: "widget_placeholder",
                            refKey: sec.key,
                            label: sec.title,
                            widget: { widgetKey: `${entityType}.${sec.key}`, note: "Hardcoded widget block (migrated as placeholder)" },
                        },
                    ],
                },
            ],
        });
    }

    const out: LayoutSection = {
        id: base,
        key: sec.key || `section_${index}`,
        title: sec.title,
        rows,
    };
    if (sec.collapsible !== undefined) out.collapsible = sec.collapsible;
    if (sec.defaultExpanded !== undefined) out.defaultExpanded = sec.defaultExpanded;
    return out;
}

/** Convert one entity's drawer overview (+ related modules) to a LayoutDoc. */
export function drawerLayoutFromRegistry(entityType: EntityPresentationType): LayoutDoc {
    const cfg = getEntityPresentation(entityType);
    const sections: LayoutSection[] = (cfg.drawer.overviewSections ?? []).map((sec, i) =>
        drawerSection(entityType, sec, i),
    );

    // Related modules become a trailing "Related" section of related_list items.
    const related = cfg.drawer.relatedModules ?? [];
    if (related.length > 0) {
        const base = id(entityType, "drawer", "sec", "related");
        const rows: LayoutRow[] = related.map((m, i) => ({
            id: id(base, "row", i),
            columns: [
                {
                    id: id(base, "row", i, "col", 0),
                    width: LAYOUT_GRID_COLUMNS,
                    items: [
                        {
                            id: id(base, "item", m.key),
                            kind: "related_list",
                            refKey: m.key,
                            label: m.label,
                            related: { entityType: m.entityType, filterKey: m.filterKey },
                            ...(m.locked !== undefined ? { locked: m.locked } : {}),
                        },
                    ],
                },
            ],
        }));
        sections.push({ id: base, key: "related", title: "Related", collapsible: true, defaultExpanded: false, rows });
    }

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "drawer",
        entityType,
        sections,
        metadata: {
            layoutMode: cfg.drawer.layoutMode ?? 1,
            tabs: cfg.drawer.tabs,
            source: "entityPresentation.ts",
        },
    };
}

function tableColumnItem(entityType: string, c: EntityTableColumnConfig, index: number): LayoutItem {
    const item: LayoutItem = {
        id: id(entityType, "queue", "col", c.key || `c${index}`),
        kind: "field",
        refKey: c.key,
        label: c.label,
    };
    if (c.renderHint) item.renderHint = c.renderHint as LayoutRenderHint;
    if (c.locked !== undefined) item.locked = c.locked;
    item.metadata = { sortable: Boolean(c.sortable) };
    return item;
}

/** Convert one entity's queue/table to a LayoutDoc (single section of ordered columns). */
export function queueLayoutFromRegistry(entityType: EntityPresentationType): LayoutDoc {
    const cfg = getEntityPresentation(entityType);
    const base = id(entityType, "queue", "sec", "table");
    const items = cfg.table.columns.map((c, i) => tableColumnItem(entityType, c, i));
    const section: LayoutSection = {
        id: base,
        key: "table",
        title: "Columns",
        rows: [
            {
                id: id(base, "row", 0),
                columns: [{ id: id(base, "row", 0, "col", 0), width: LAYOUT_GRID_COLUMNS, items }],
            },
        ],
    };
    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "queue",
        entityType,
        sections: [section],
        metadata: {
            defaultSort: cfg.table.defaultSort ?? null,
            source: "entityPresentation.ts",
        },
    };
}

/** Convenience: build a doc for any supported surface. */
export function layoutDocFromRegistry(entityType: EntityPresentationType, surface: LayoutSurface): LayoutDoc {
    return surface === "queue" ? queueLayoutFromRegistry(entityType) : drawerLayoutFromRegistry(entityType);
}
