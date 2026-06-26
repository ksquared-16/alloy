/**
 * Lead Summary card blueprint — configurable widget slots in layout `lead_summary` section.
 */

import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    LAYOUT_GRID_COLUMNS,
    type LayoutCondition,
    type LayoutDoc,
    type LayoutItem,
    type LayoutSection,
} from "@/lib/layout/layoutV2";

export const LEAD_SUMMARY_BLUEPRINT_KEY = "lead_summary" as const;

export type LeadSummaryCardDensity = "compact" | "standard" | "expanded";
export type LeadSummaryCardSpan = "half" | "full";

export type LeadSummarySlotKey =
    | "attention"
    | "current_work"
    | "tour_summary"
    | "children_list"
    | "opportunity.status"
    | "opportunity.location_name"
    | "person.primary_contact_name";

export type LeadSummarySlotConfig = {
    key: LeadSummarySlotKey;
    label: string;
    enabled: boolean;
    optional: boolean;
    density: LeadSummaryCardDensity;
    span: LeadSummaryCardSpan;
    visibleWhen?: LayoutCondition | null;
};

export const LEAD_SUMMARY_BLUEPRINT_SLOTS: ReadonlyArray<{
    key: LeadSummarySlotKey;
    label: string;
    optional: boolean;
    defaultEnabled: boolean;
}> = [
    { key: "attention", label: "Attention", optional: false, defaultEnabled: true },
    { key: "current_work", label: "Current Work", optional: false, defaultEnabled: true },
    { key: "tour_summary", label: "Tour / Event", optional: true, defaultEnabled: true },
    { key: "children_list", label: "Children", optional: true, defaultEnabled: true },
    { key: "opportunity.status", label: "Status", optional: true, defaultEnabled: false },
    { key: "opportunity.location_name", label: "Location", optional: true, defaultEnabled: false },
    { key: "person.primary_contact_name", label: "Primary contact", optional: true, defaultEnabled: false },
];

const DENSITY_COLUMN_WIDTH: Record<LeadSummaryCardDensity, number> = {
    compact: LAYOUT_GRID_COLUMNS / 4,
    standard: LAYOUT_GRID_COLUMNS / 3,
    expanded: LAYOUT_GRID_COLUMNS / 2,
};

const SPAN_COLUMN_WIDTH: Record<LeadSummaryCardSpan, number> = {
    half: LAYOUT_GRID_COLUMNS / 2,
    full: LAYOUT_GRID_COLUMNS,
};

function slotColumnWidth(slot: LeadSummarySlotConfig): number {
    if (slot.span === "full") return SPAN_COLUMN_WIDTH.full;
    return DENSITY_COLUMN_WIDTH[slot.density] ?? DENSITY_COLUMN_WIDTH.standard;
}

function isWidgetSlot(key: LeadSummarySlotKey): boolean {
    return !key.includes(".");
}

function buildSlotItem(slot: LeadSummarySlotConfig, base: string): LayoutItem {
    if (isWidgetSlot(slot.key)) {
        return {
            id: `${base}-w-${slot.key}`,
            kind: "widget_placeholder",
            refKey: slot.key,
            label: slot.label,
            widget: {
                widgetKey: `opportunities.${slot.key}`,
                displayMode: slot.density === "compact" ? "compact" : "summary",
                note: `${slot.label} widget`,
            },
            ...(slot.visibleWhen ? { visibleWhen: slot.visibleWhen } : {}),
        };
    }

    return {
        id: `${base}-f-${slot.key.replace(/\./g, "_")}`,
        kind: "field",
        refKey: slot.key,
        label: slot.label,
        renderHint: "text",
        ...(slot.visibleWhen ? { visibleWhen: slot.visibleWhen } : {}),
    };
}

export function defaultLeadSummarySlotConfigs(): LeadSummarySlotConfig[] {
    return LEAD_SUMMARY_BLUEPRINT_SLOTS.map((slot) => ({
        key: slot.key,
        label: slot.label,
        optional: slot.optional,
        enabled: slot.defaultEnabled,
        density: "standard" as const,
        span: "half" as const,
        visibleWhen: null,
    }));
}

export function findLeadSummarySection(doc: LayoutDoc): LayoutSection | null {
    return doc.sections.find((s) => s.key === LEAD_SUMMARY_BLUEPRINT_KEY) ?? null;
}

export function readLeadSummarySlotConfigs(doc: LayoutDoc): LeadSummarySlotConfig[] {
    const section = findLeadSummarySection(doc);
    if (!section?.rows.length) return defaultLeadSummarySlotConfigs();

    const defaults = new Map(defaultLeadSummarySlotConfigs().map((s) => [s.key, s]));
    const found = new Map<LeadSummarySlotKey, LeadSummarySlotConfig>();

    for (const row of section.rows) {
        for (const col of row.columns) {
            for (const item of col.items) {
                const key = itemRefToSlotKey(item);
                if (!key) continue;
                const base = defaults.get(key);
                if (!base) continue;
                found.set(key, {
                    ...base,
                    enabled: true,
                    density: inferDensityFromColumn(col.width, item),
                    span: col.width >= LAYOUT_GRID_COLUMNS ? "full" : "half",
                    visibleWhen: item.visibleWhen ?? null,
                });
            }
        }
    }

    return LEAD_SUMMARY_BLUEPRINT_SLOTS.map((slot) => {
        const existing = found.get(slot.key);
        if (existing) return existing;
        const base = defaults.get(slot.key)!;
        return { ...base, enabled: false };
    });
}

function itemRefToSlotKey(item: LayoutItem): LeadSummarySlotKey | null {
    if (item.kind === "widget_placeholder") {
        const widgetKey = item.widget?.widgetKey?.replace(/^opportunities\./, "") ?? item.refKey;
        if (LEAD_SUMMARY_BLUEPRINT_SLOTS.some((s) => s.key === widgetKey)) {
            return widgetKey as LeadSummarySlotKey;
        }
    }
    if (item.kind === "field" && LEAD_SUMMARY_BLUEPRINT_SLOTS.some((s) => s.key === item.refKey)) {
        return item.refKey as LeadSummarySlotKey;
    }
    return null;
}

function inferDensityFromColumn(width: number, item: LayoutItem): LeadSummaryCardDensity {
    if (width >= LAYOUT_GRID_COLUMNS) return "expanded";
    if (width <= LAYOUT_GRID_COLUMNS / 4) return "compact";
    if (item.widget?.displayMode === "compact") return "compact";
    return "standard";
}

export function applyLeadSummarySlotConfigs(doc: LayoutDoc, slots: readonly LeadSummarySlotConfig[]): LayoutDoc {
    const enabled = slots.filter((s) => s.enabled);
    const base = `opportunities-lead-${LEAD_SUMMARY_BLUEPRINT_KEY}`;
    const columns = enabled.map((slot, index) => ({
        id: `${base}-c${index}`,
        width: slotColumnWidth(slot),
        items: [buildSlotItem(slot, `${base}-c${index}`)],
    }));

    const nextSection: LayoutSection = {
        id: `${base}-section`,
        key: LEAD_SUMMARY_BLUEPRINT_KEY,
        title: "Lead Summary",
        collapsible: true,
        defaultExpanded: true,
        rows: columns.length ?
            [{ id: `${base}-r0`, columns }]
        :   [],
        metadata: {
            card_blueprint_key: LEAD_SUMMARY_BLUEPRINT_KEY,
        },
    };

    const otherSections = doc.sections.filter((s) => s.key !== LEAD_SUMMARY_BLUEPRINT_KEY);
    return {
        ...doc,
        sections: [nextSection, ...otherSections],
    };
}

export function seedLeadSummaryBlueprintLayoutDoc(): LayoutDoc {
    const doc = buildLeadDrawerDefaultDoc();
    return applyLeadSummarySlotConfigs(doc, defaultLeadSummarySlotConfigs());
}

export function swapLeadSummarySlot(
    slots: LeadSummarySlotConfig[],
    index: number,
    nextKey: LeadSummarySlotKey,
): LeadSummarySlotConfig[] {
    const catalog = LEAD_SUMMARY_BLUEPRINT_SLOTS.find((s) => s.key === nextKey);
    if (!catalog) return slots;
    return slots.map((slot, i) =>
        i === index ?
            {
                ...slot,
                key: nextKey,
                label: catalog.label,
                optional: catalog.optional,
                enabled: true,
            }
        :   slot,
    );
}
