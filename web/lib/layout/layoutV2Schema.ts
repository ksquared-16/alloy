/**
 * Layout V2 — validation & parsing (no external deps).
 *
 * Validates an untrusted value (e.g. a JSONB `doc` from the DB or a request
 * body) into a typed {@link LayoutDoc}. Validation runs at the API/persistence
 * boundary ONLY; the renderer trusts already-validated docs (see design doc,
 * "Performance implications").
 *
 * Enforces the non-negotiable constraints:
 *  - Fixed depth: Layout → Section → Row → Column → Item (no arbitrary nesting).
 *  - `field_group` may contain a single flat level of `field` items only.
 *  - Closed enums for surface, item kind, render hint.
 *  - No styling/color fields (any unknown keys are dropped, not surfaced).
 *  - Integer grid widths within [1, 12].
 */

import { collectDeprecatedRefKeyWarnings, collectRefKeysFromLayoutDoc } from "./layoutRefKeyAliases";
import {
    LAYOUT_DOC_FORMAT_VERSION,
    LAYOUT_GRID_COLUMNS,
    isLayoutAdornmentActionEntity,
    isLayoutAdornmentIcon,
    isLayoutColumnWidth,
    isLayoutConditionType,
    isLayoutItemKind,
    isLayoutRenderHint,
    isLayoutSurface,
    isLayoutWidthBehavior,
    type LayoutCollectionColumn,
    type LayoutColumn,
    type LayoutCondition,
    type LayoutDoc,
    type LayoutFieldAdornment,
    type LayoutItem,
    type LayoutRow,
    type LayoutSection,
} from "./layoutV2";
import { resolveSurfaceLayoutKeyFromDoc, type SurfaceLayoutKey } from "./surfaceLayoutRegistry";
import { validateLayoutDocForSurface } from "./validateLayoutDocForSurface";

export interface LayoutValidationResult {
    ok: boolean;
    doc: LayoutDoc | null;
    errors: string[];
    /** Non-fatal issues (e.g. row width > 12). The doc still parses. */
    warnings: string[];
    /** Set when surface-scoped validation runs. */
    surfaceKey?: SurfaceLayoutKey | null;
}

export type ParseLayoutDocOptions = {
    /** When set, run surface registry validation for this surface. */
    surfaceKey?: SurfaceLayoutKey | null;
    /** When true (default false), infer surface from entityType + surface after structural parse. */
    inferSurfaceKey?: boolean;
};

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
    return typeof v === "string" ? v : undefined;
}

function asBool(v: unknown): boolean | undefined {
    return typeof v === "boolean" ? v : undefined;
}

/** Validate and normalize an untrusted value into a LayoutDoc. */
export function parseLayoutDoc(input: unknown, options?: ParseLayoutDocOptions): LayoutValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const seenIds = new Set<string>();

    const requireId = (raw: unknown, path: string): string => {
        const id = asString(raw);
        if (!id) {
            errors.push(`${path}: missing string "id"`);
            return "";
        }
        if (seenIds.has(id)) {
            errors.push(`${path}: duplicate id "${id}"`);
        }
        seenIds.add(id);
        return id;
    };

    if (!isObject(input)) {
        return { ok: false, doc: null, errors: ["root: layout doc must be an object"], warnings };
    }

    const surface = input.surface;
    if (!isLayoutSurface(surface)) {
        errors.push(`root: invalid surface (expected one of drawer|queue)`);
    }

    const entityType = asString(input.entityType);
    if (!entityType) errors.push(`root: missing string "entityType"`);

    const rawSections = Array.isArray(input.sections) ? input.sections : [];
    if (!Array.isArray(input.sections)) errors.push(`root: "sections" must be an array`);

    const parseCondition = (raw: unknown, path: string): LayoutCondition | undefined => {
        if (raw === undefined || raw === null) return undefined;
        if (!isObject(raw)) {
            errors.push(`${path}.visibleWhen: must be an object`);
            return undefined;
        }
        if (!isLayoutConditionType(raw.type)) {
            errors.push(`${path}.visibleWhen: invalid type "${String(raw.type)}"`);
            return undefined;
        }
        const cpath = asString(raw.path);
        if (!cpath) {
            errors.push(`${path}.visibleWhen: missing string "path"`);
            return undefined;
        }
        const cond: LayoutCondition = { type: raw.type, path: cpath };
        const value = asString(raw.value);
        if (value !== undefined) cond.value = value;
        if (raw.type === "equals" && cond.value === undefined) {
            errors.push(`${path}.visibleWhen: "equals" requires a string "value"`);
            return undefined;
        }
        if (raw.type === "count_gt" && cond.value === undefined) {
            errors.push(`${path}.visibleWhen: "count_gt" requires a string "value"`);
            return undefined;
        }
        return cond;
    };

    const parseAdornment = (raw: unknown, path: string): LayoutFieldAdornment | undefined => {
        if (raw === undefined || raw === null) return undefined;
        if (!isObject(raw)) {
            errors.push(`${path}.adornment: must be an object`);
            return undefined;
        }
        if (!isLayoutAdornmentIcon(raw.icon)) {
            errors.push(`${path}.adornment: invalid icon "${String(raw.icon)}"`);
            return undefined;
        }
        const position = raw.position === "right" ? "right" : "left";
        const adornment: LayoutFieldAdornment = { position, icon: raw.icon };
        if (isObject(raw.action)) {
            if (raw.action.type !== "open_drawer") {
                errors.push(`${path}.adornment.action: only "open_drawer" is supported`);
                return undefined;
            }
            if (!isLayoutAdornmentActionEntity(raw.action.entity)) {
                errors.push(`${path}.adornment.action: invalid entity "${String(raw.action.entity)}"`);
                return undefined;
            }
            adornment.action = { type: "open_drawer", entity: raw.action.entity };
            const idPath = asString(raw.action.idPath);
            if (idPath) adornment.action.idPath = idPath;
        }
        return adornment;
    };

    const parseItem = (raw: unknown, path: string, allowGroup: boolean): LayoutItem | null => {
        if (!isObject(raw)) {
            errors.push(`${path}: item must be an object`);
            return null;
        }
        const id = requireId(raw.id, path);
        const kind = raw.kind;
        if (!isLayoutItemKind(kind)) {
            errors.push(`${path}: invalid item kind "${String(raw.kind)}"`);
            return null;
        }
        if (kind === "field_group" && !allowGroup) {
            errors.push(`${path}: nested field_group is not allowed (no arbitrary nesting)`);
            return null;
        }
        const refKey = asString(raw.refKey);
        if (!refKey) errors.push(`${path}: missing string "refKey"`);

        const item: LayoutItem = { id, kind, refKey: refKey ?? "" };

        const label = asString(raw.label);
        if (label !== undefined) item.label = label;

        if (raw.renderHint !== undefined) {
            if (isLayoutRenderHint(raw.renderHint)) item.renderHint = raw.renderHint;
            else errors.push(`${path}: invalid renderHint "${String(raw.renderHint)}"`);
        }

        const editable = asBool(raw.editable);
        if (editable !== undefined) item.editable = editable;
        const locked = asBool(raw.locked);
        if (locked !== undefined) item.locked = locked;

        if (isObject(raw.linkTarget)) {
            const idField = asString(raw.linkTarget.idField);
            const linkEntity = asString(raw.linkTarget.entityType);
            if (idField && linkEntity) item.linkTarget = { idField, entityType: linkEntity };
        }

        if (kind === "field_group") {
            const rawItems = Array.isArray(raw.items) ? raw.items : [];
            // A field_group holds a single flat level of "field" items only.
            item.items = rawItems
                .map((c, ci) => parseItem(c, `${path}.items[${ci}]`, /* allowGroup */ false))
                .filter((c): c is LayoutItem => c !== null && c.kind === "field");
            // Controlled subgrid (column-in-column): rows → columns → field items
            // (no nested field_group allowed, enforced via allowGroupItems=false).
            if (Array.isArray(raw.rows)) {
                item.rows = raw.rows
                    .map((r, ri) => parseRow(r, `${path}.rows[${ri}]`, /* allowGroupItems */ false))
                    .filter((r): r is LayoutRow => r !== null);
            }
        }

        if (kind === "related_list") {
            if (isObject(raw.related)) {
                const re = asString(raw.related.entityType);
                if (re) item.related = { entityType: re, filterKey: asString(raw.related.filterKey) };
            }
            const source = asString(raw.source);
            if (source !== undefined) item.source = source;
            const displayMode = asString(raw.displayMode);
            if (displayMode !== undefined) item.displayMode = displayMode;
            if (Array.isArray(raw.columns)) {
                const cols: LayoutCollectionColumn[] = [];
                raw.columns.forEach((c, ci) => {
                    if (!isObject(c)) {
                        errors.push(`${path}.columns[${ci}]: must be an object`);
                        return;
                    }
                    const colRef = asString(c.refKey);
                    if (!colRef) {
                        errors.push(`${path}.columns[${ci}]: missing string "refKey"`);
                        return;
                    }
                    const col: LayoutCollectionColumn = { label: asString(c.label) ?? colRef, refKey: colRef };
                    if (isLayoutColumnWidth(c.width)) col.width = c.width;
                    if (isLayoutWidthBehavior(c.widthBehavior)) col.widthBehavior = c.widthBehavior;
                    if (c.renderHint !== undefined && isLayoutRenderHint(c.renderHint)) col.renderHint = c.renderHint;
                    const ce = asBool(c.editable);
                    if (ce !== undefined) col.editable = ce;
                    const cad = parseAdornment(c.adornment, `${path}.columns[${ci}]`);
                    if (cad) col.adornment = cad;
                    const ctpl = asString(c.template);
                    if (ctpl !== undefined) col.template = ctpl;
                    const ccond = parseCondition(c.visibleWhen, `${path}.columns[${ci}]`);
                    if (ccond) col.visibleWhen = ccond;
                    if (isObject(c.metadata)) col.metadata = c.metadata;
                    cols.push(col);
                });
                item.columns = cols;
            }
        }

        if (kind === "widget_placeholder" && isObject(raw.widget)) {
            const wk = asString(raw.widget.widgetKey);
            if (wk) item.widget = { widgetKey: wk, note: asString(raw.widget.note), displayMode: asString(raw.widget.displayMode) };
            else errors.push(`${path}: widget_placeholder requires widget.widgetKey`);
        }

        const sourceEntity = asString(raw.sourceEntity);
        if (sourceEntity !== undefined) item.sourceEntity = sourceEntity;

        const template = asString(raw.template);
        if (template !== undefined) item.template = template;

        if (isLayoutWidthBehavior(raw.widthBehavior)) item.widthBehavior = raw.widthBehavior;

        const adornment = parseAdornment(raw.adornment, path);
        if (adornment) item.adornment = adornment;

        const itemCond = parseCondition(raw.visibleWhen, path);
        if (itemCond) item.visibleWhen = itemCond;

        if (isObject(raw.metadata)) item.metadata = raw.metadata;

        return item;
    };

    const parseColumn = (raw: unknown, path: string, allowGroupItems = true): LayoutColumn | null => {
        if (!isObject(raw)) {
            errors.push(`${path}: column must be an object`);
            return null;
        }
        const id = requireId(raw.id, path);
        let width = typeof raw.width === "number" ? Math.round(raw.width) : LAYOUT_GRID_COLUMNS;
        if (width < 1 || width > LAYOUT_GRID_COLUMNS) {
            warnings.push(`${path}: width ${width} clamped to [1, ${LAYOUT_GRID_COLUMNS}]`);
            width = Math.max(1, Math.min(LAYOUT_GRID_COLUMNS, width));
        }
        const rawItems = Array.isArray(raw.items) ? raw.items : [];
        const items = rawItems
            .map((it, ii) => parseItem(it, `${path}.items[${ii}]`, allowGroupItems))
            .filter((it): it is LayoutItem => it !== null);
        return { id, width, items };
    };

    const parseRow = (raw: unknown, path: string, allowGroupItems = true): LayoutRow | null => {
        if (!isObject(raw)) {
            errors.push(`${path}: row must be an object`);
            return null;
        }
        const id = requireId(raw.id, path);
        const rawCols = Array.isArray(raw.columns) ? raw.columns : [];
        const columns = rawCols
            .map((c, ci) => parseColumn(c, `${path}.columns[${ci}]`, allowGroupItems))
            .filter((c): c is LayoutColumn => c !== null);
        const widthSum = columns.reduce((s, c) => s + c.width, 0);
        if (widthSum > LAYOUT_GRID_COLUMNS) {
            warnings.push(`${path}: column widths sum to ${widthSum} (> ${LAYOUT_GRID_COLUMNS}); will wrap`);
        }
        const row: LayoutRow = { id, columns };
        const rowCond = parseCondition(raw.visibleWhen, path);
        if (rowCond) row.visibleWhen = rowCond;
        return row;
    };

    const parseSection = (raw: unknown, path: string): LayoutSection | null => {
        if (!isObject(raw)) {
            errors.push(`${path}: section must be an object`);
            return null;
        }
        const id = requireId(raw.id, path);
        const key = asString(raw.key) ?? "";
        if (!key) errors.push(`${path}: missing string "key"`);
        const title = asString(raw.title) ?? key;
        const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
        const rows = rawRows
            .map((r, ri) => parseRow(r, `${path}.rows[${ri}]`))
            .filter((r): r is LayoutRow => r !== null);
        const section: LayoutSection = { id, key, title, rows };
        const collapsible = asBool(raw.collapsible);
        if (collapsible !== undefined) section.collapsible = collapsible;
        const defaultExpanded = asBool(raw.defaultExpanded);
        if (defaultExpanded !== undefined) section.defaultExpanded = defaultExpanded;
        const secCond = parseCondition(raw.visibleWhen, path);
        if (secCond) section.visibleWhen = secCond;
        if (isObject(raw.metadata)) section.metadata = raw.metadata as Record<string, unknown>;
        return section;
    };

    const sections = rawSections
        .map((s, si) => parseSection(s, `sections[${si}]`))
        .filter((s): s is LayoutSection => s !== null);

    if (errors.length > 0) {
        return { ok: false, doc: null, errors, warnings };
    }

    const doc: LayoutDoc = {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: surface as LayoutDoc["surface"],
        entityType: entityType as string,
        sections,
    };
    if (isObject(input.metadata)) doc.metadata = input.metadata;

    warnings.push(...collectDeprecatedRefKeyWarnings(collectRefKeysFromLayoutDoc(doc)));

    const shouldValidateSurface = options?.surfaceKey !== undefined || options?.inferSurfaceKey === true;
    if (!shouldValidateSurface) {
        return { ok: true, doc, errors, warnings };
    }

    const surfaceKey =
        options?.surfaceKey !== undefined ? options.surfaceKey : resolveSurfaceLayoutKeyFromDoc(doc);
    const surfaceResult = validateLayoutDocForSurface(doc, surfaceKey);
    if (!surfaceResult.ok) {
        return {
            ok: false,
            doc: null,
            errors: [...errors, ...surfaceResult.errors],
            warnings,
            surfaceKey: surfaceResult.surfaceKey,
        };
    }

    return { ok: true, doc, errors, warnings, surfaceKey: surfaceResult.surfaceKey };
}

/** Throwing variant for code paths that have already guaranteed validity. */
export function parseLayoutDocOrThrow(input: unknown): LayoutDoc {
    const res = parseLayoutDoc(input);
    if (!res.ok || !res.doc) {
        throw new Error(`Invalid LayoutDoc: ${res.errors.join("; ")}`);
    }
    return res.doc;
}
