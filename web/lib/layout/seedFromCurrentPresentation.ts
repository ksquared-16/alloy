/**
 * Layout V2 — seed a layout doc from the CURRENT staging presentation.
 *
 * For the opportunities/Leads proof, "Create draft from default" should mirror
 * what the live opportunity drawer and work-unit queue actually render today —
 * NOT the older generic `entityPresentation.ts` registry. This module reads the
 * current presentation sources (read-only) and converts them into a Layout V2
 * document:
 *
 *  - Drawer: the effective record-drawer layout (record_drawer_layouts /
 *    record_layouts config_json) + the org's opportunity field_definitions,
 *    run through the existing `buildEffectiveDrawerLayoutPreview()` builder
 *    (fidelity "opportunity_runtime_mirror"). Field sections become field rows;
 *    injected/static blocks (tuition, children, status, rails) become widget
 *    placeholders.
 *  - Queue: the org's opportunity `work_units.queue_definition.ui.row_preview`
 *    (ordered crm-compact fields + labels). Fields become ordered columns;
 *    row actions become a widget placeholder.
 *
 * It imports staging modules ONLY as read-only source references — it does not
 * modify the live drawer, queue, work-unit, or VM runtime, and nothing here is
 * wired into production rendering. Returns null when no current source exists,
 * so the caller falls back to the registry converter.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildEffectiveDrawerLayoutPreview,
    type DrawerLayoutPreviewSection,
    type PreviewFieldDef,
} from "@/lib/recordChrome/effectiveDrawerLayoutPreview";
import { fetchEffectiveRecordDrawerLayout } from "@/lib/admin/effectiveRecordDrawerLayout";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";
import { getQueueRowPreviewFieldLabel, getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { fieldEntityKey } from "./entityKeys";
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

// ---------------------------------------------------------------------------
// shared id + helpers (deterministic, mirrors migrateFromRegistry)
// ---------------------------------------------------------------------------
function slug(input: string): string {
    return (
        input
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 64) || "x"
    );
}
function id(...parts: (string | number)[]): string {
    return parts.map((p) => (typeof p === "number" ? String(p) : slug(p))).join("-");
}
function humanize(key: string): string {
    return key
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function hintForFieldType(t: string | undefined): LayoutRenderHint {
    switch (t) {
        case "date":
            return "date";
        case "datetime":
            return "datetime";
        case "phone":
            return "phone";
        case "boolean":
            return "primary_yes_no";
        default:
            return "text";
    }
}

/** Known opportunity relationship fields render as drawer links. */
function oppLinkOverride(fieldKey: string): { renderHint: LayoutRenderHint; linkTarget: LayoutItem["linkTarget"] } | null {
    switch (fieldKey) {
        case "primary_person_id":
            return { renderHint: "link", linkTarget: { idField: "primary_person_id", entityType: "persons" } };
        case "location_id":
            return { renderHint: "link", linkTarget: { idField: "location_id", entityType: "locations" } };
        case "primary_contact_id":
            return { renderHint: "link", linkTarget: { idField: "primary_contact_id", entityType: "contacts" } };
        case "customer_id":
            return { renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } };
        default:
            return null;
    }
}

// ---------------------------------------------------------------------------
// DRAWER
// ---------------------------------------------------------------------------
function fieldItem(base: string, key: string, fieldByKey: Map<string, PreviewFieldDef>): LayoutItem {
    const def = fieldByKey.get(key);
    const link = oppLinkOverride(key);
    const item: LayoutItem = {
        id: id(base, "item", key),
        kind: "field",
        refKey: key,
        label: def?.label?.trim() || humanize(key),
        renderHint: link?.renderHint ?? hintForFieldType(def?.field_type),
        editable: true,
    };
    if (link?.linkTarget) item.linkTarget = link.linkTarget;
    return item;
}

function packFieldRows(base: string, keys: string[], fieldByKey: Map<string, PreviewFieldDef>): LayoutRow[] {
    const half = LAYOUT_GRID_COLUMNS / 2;
    const rows: LayoutRow[] = [];
    let cols: LayoutColumn[] = [];
    let rowIdx = 0;
    const flush = () => {
        if (cols.length) {
            rows.push({ id: id(base, "row", rowIdx), columns: cols });
            rowIdx += 1;
            cols = [];
        }
    };
    for (const key of keys) {
        const colIdx = cols.length;
        cols.push({
            id: id(base, "row", rowIdx, "col", colIdx),
            width: half,
            items: [fieldItem(id(base, "row", rowIdx, "col", colIdx), key, fieldByKey)],
        });
        if (cols.length === 2) flush();
    }
    flush();
    return rows;
}

/** A non-field block (tuition, children, status, rails) → widget placeholder. */
function widgetSectionRow(base: string, sec: DrawerLayoutPreviewSection): LayoutRow {
    return {
        id: id(base, "row", 0),
        columns: [
            {
                id: id(base, "row", 0, "col", 0),
                width: LAYOUT_GRID_COLUMNS,
                items: [
                    {
                        id: id(base, "item", "widget"),
                        kind: "widget_placeholder",
                        refKey: sec.section_key,
                        label: sec.title,
                        widget: {
                            widgetKey: `opportunities.${sec.section_key}`,
                            note: sec.detail || `Runtime block (${sec.kind}) — not a simple field grid`,
                        },
                    },
                ],
            },
        ],
    };
}

function convertPreviewSection(
    sec: DrawerLayoutPreviewSection,
    index: number,
    fieldByKey: Map<string, PreviewFieldDef>,
): LayoutSection {
    const base = id("opportunities", "drawer", "sec", sec.section_key || `s${index}`);
    const hasFields = Array.isArray(sec.field_keys) && sec.field_keys.length > 0;
    const isFieldKind = sec.kind === "workflow_virtual" || sec.kind === "field_section_ref";
    const rows = hasFields && isFieldKind ? packFieldRows(base, sec.field_keys as string[], fieldByKey) : [widgetSectionRow(base, sec)];
    return {
        id: base,
        key: sec.section_key || `section_${index}`,
        title: sec.title || humanize(sec.section_key || `Section ${index + 1}`),
        collapsible: true,
        defaultExpanded: index === 0,
        rows,
    };
}

/**
 * Build a faithful opportunity drawer LayoutDoc from the current presentation.
 * Returns null if no field definitions / preview sections exist (→ registry fallback).
 */
export async function seedOpportunityDrawerDoc(supabase: SupabaseClient, orgId: string): Promise<LayoutDoc | null> {
    const fieldEntity = fieldEntityKey("opportunities"); // "opportunity"

    const eff = await fetchEffectiveRecordDrawerLayout(supabase, orgId, fieldEntity);
    const config = eff.ok && eff.layout ? eff.layout.config_json : {};

    const { data: fdRows } = await supabase
        .from("field_definitions")
        .select("field_key, field_type, label, section_key, sort_order, is_visible_in_drawer")
        .eq("org_id", orgId)
        .eq("entity_type", fieldEntity)
        .eq("is_active", true);

    const fieldDefs: PreviewFieldDef[] = (fdRows ?? []).map((r) => ({
        field_key: String((r as { field_key: string }).field_key),
        field_type: String((r as { field_type?: string }).field_type ?? "text"),
        label: (r as { label?: string | null }).label ?? null,
        section_key: (r as { section_key?: string | null }).section_key ?? null,
        sort_order: Number((r as { sort_order?: number }).sort_order ?? 100),
        is_visible_in_drawer: (r as { is_visible_in_drawer?: boolean }).is_visible_in_drawer ?? true,
    }));

    if (fieldDefs.length === 0) return null;

    const { data: fsRows } = await supabase
        .from("field_section_definitions")
        .select("section_key, label")
        .eq("org_id", orgId)
        .eq("entity_type", fieldEntity);
    const fieldSectionLabels: Record<string, string> = {};
    for (const r of fsRows ?? []) {
        const k = (r as { section_key?: string }).section_key;
        const l = (r as { label?: string }).label;
        if (k && l) fieldSectionLabels[k] = l;
    }

    const bundle = buildEffectiveDrawerLayoutPreview({
        presentationEntityType: "opportunities",
        config,
        fieldDefinitions: fieldDefs,
        fieldSectionLabels,
    });
    if (!bundle.sections.length) return null;

    const fieldByKey = new Map(fieldDefs.map((f) => [f.field_key, f]));
    const sections = bundle.sections.map((sec, i) => convertPreviewSection(sec, i, fieldByKey));

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "drawer",
        entityType: "opportunities",
        sections,
        metadata: {
            seededFrom: "current_presentation",
            fidelity: bundle.fidelity,
            drawerSource: eff.ok && eff.layout ? eff.layout.source : "field_catalog",
        },
    };
}

// ---------------------------------------------------------------------------
// QUEUE
// ---------------------------------------------------------------------------
function queueRenderHint(field: string): LayoutRenderHint {
    switch (field) {
        case "status":
            return "status";
        case "phone":
            return "phone";
        case "start_date":
        case "tour_date":
            return "date";
        default:
            return "text";
    }
}

/**
 * Build a faithful opportunity queue LayoutDoc from the current work-unit queue
 * row_preview config. Returns null if no opportunity queue_definition exists.
 */
export async function seedOpportunityQueueDoc(supabase: SupabaseClient, orgId: string): Promise<LayoutDoc | null> {
    const { data: wuRows } = await supabase
        .from("work_units")
        .select("id, name, queue_definition")
        .eq("org_id", orgId);

    let ui: ReturnType<typeof getQueueUiConfig> | null = null;
    for (const wu of wuRows ?? []) {
        const raw = (wu as { queue_definition?: unknown }).queue_definition;
        if (!raw || typeof raw !== "object") continue;
        try {
            const def = validateQueueDefinition(raw);
            if (def.entity_type === "opportunity") {
                ui = getQueueUiConfig(def);
                break;
            }
        } catch {
            // not a valid v1 queue definition; skip
        }
    }
    if (!ui || !ui.row_preview.fields.length) return null;

    const base = id("opportunities", "queue", "sec", "row_preview");
    const items: LayoutItem[] = ui.row_preview.fields.map((f, i) => ({
        id: id(base, "item", f, i),
        kind: "field",
        refKey: f,
        label: getQueueRowPreviewFieldLabel(ui!, f),
        renderHint: queueRenderHint(f),
        metadata: { sortable: false, variant: ui!.row_preview.variant },
    }));

    // Row actions (call/email/orchestrator/etc.) are not field columns → widget placeholder.
    if (ui.row_preview.actions.length) {
        items.push({
            id: id(base, "item", "actions"),
            kind: "widget_placeholder",
            refKey: "row_actions",
            label: "Row actions",
            widget: {
                widgetKey: "opportunities.queue.row_actions",
                note: `Quick actions: ${ui.row_preview.actions.join(", ")}`,
            },
        });
    }

    const section: LayoutSection = {
        id: base,
        key: "row_preview",
        title: "Queue row (work-unit card)",
        rows: [{ id: id(base, "row", 0), columns: [{ id: id(base, "row", 0, "col", 0), width: LAYOUT_GRID_COLUMNS, items }] }],
    };

    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "queue",
        entityType: "opportunities",
        sections: [section],
        metadata: {
            seededFrom: "current_presentation",
            variant: ui.row_preview.variant,
            note: "Mirrors work-unit queue row_preview fields; the live card also renders fact-group layout + actions (widget).",
        },
    };
}

/**
 * Seed a layout doc from the current presentation for a supported
 * (entityType, surface). Returns null when no newer source exists, so the
 * caller falls back to the registry converter.
 */
export async function seedLayoutDocFromCurrent(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    surface: LayoutSurface,
): Promise<LayoutDoc | null> {
    if (entityType !== "opportunities") return null;
    try {
        return surface === "drawer"
            ? await seedOpportunityDrawerDoc(supabase, orgId)
            : await seedOpportunityQueueDoc(supabase, orgId);
    } catch {
        return null;
    }
}
