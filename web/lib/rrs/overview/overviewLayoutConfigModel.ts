/**
 * Pure overview layout config model (no DB). Safe for client bundles.
 */

import type { ResolvedFieldDescriptor } from "@/lib/rrs/types";

/** Item kind in DB JSON; `field` is an alias for generic overview slots (maps to system_field internally). */
export type OverviewLayoutItemKindV0 = "system_field" | "custom_field" | "section" | "field";

/** One band in overview config JSON (v0). */
export type OverviewLayoutBandV0 = {
    band_key: "summary" | "people" | "operational" | "financial" | "relationships" | "service_property";
    enabled: boolean;
    items: Array<{
        kind: "system_field" | "custom_field" | "section";
        key: string;
        hint?: { span?: 1 | 2 | 3 };
    }>;
};

/** Parsed overview layout `config` column (v0). */
export type OverviewLayoutConfigV0 = {
    bands: OverviewLayoutBandV0[];
    header_keys: string[];
    /** When set, only these relationship groups are included on overview. */
    relationship_group_keys?: string[];
};

const DEFAULT_OVERVIEW_LAYOUT: OverviewLayoutConfigV0 = {
    header_keys: ["title", "status_key", "_customer_name", "_primary_person_name", "_work_unit_label"],
    bands: [
        {
            band_key: "summary",
            enabled: true,
            items: [
                { kind: "system_field", key: "scheduled_at" },
                { kind: "system_field", key: "_next_schedule" },
                { kind: "system_field", key: "_location_label" },
            ],
        },
        {
            band_key: "people",
            enabled: true,
            items: [{ kind: "system_field", key: "_primary_person_name" }],
        },
        {
            band_key: "financial",
            enabled: true,
            items: [
                { kind: "system_field", key: "display_total_cents" },
                { kind: "system_field", key: "_discount_applied" },
            ],
        },
        { band_key: "operational", enabled: false, items: [] },
        { band_key: "relationships", enabled: false, items: [] },
    ],
};

function isBandKey(s: string): s is OverviewLayoutBandV0["band_key"] {
    return ["summary", "people", "operational", "financial", "relationships", "service_property"].includes(s);
}

function normalizeItemKind(kind: string | undefined): "system_field" | "custom_field" | "section" | null {
    if (kind === "field") return "system_field";
    if (kind === "system_field" || kind === "custom_field" || kind === "section") return kind;
    return null;
}

/** Best-effort parse of DB jsonb; invalid shapes fall back to defaults. */
export function parseOverviewLayoutConfig(raw: unknown): OverviewLayoutConfigV0 {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return structuredClone(DEFAULT_OVERVIEW_LAYOUT);
    }
    const o = raw as Record<string, unknown>;
    const header_keys = Array.isArray(o.header_keys)
        ? o.header_keys.filter((x) => typeof x === "string")
        : DEFAULT_OVERVIEW_LAYOUT.header_keys;
    const relRaw = o.relationship_group_keys;
    const relationship_group_keys = Array.isArray(relRaw)
        ? relRaw.filter((x): x is string => typeof x === "string" && x.trim() !== "")
        : undefined;

    const bandsIn = Array.isArray(o.bands) ? o.bands : [];
    const bands: OverviewLayoutBandV0[] = [];
    for (const b of bandsIn) {
        if (b == null || typeof b !== "object" || Array.isArray(b)) continue;
        const bk = (b as { band_key?: string }).band_key;
        if (!bk || !isBandKey(bk)) continue;
        const enabled = Boolean((b as { enabled?: boolean }).enabled);
        const itemsRaw = Array.isArray((b as { items?: unknown }).items) ? (b as { items: unknown[] }).items : [];
        const items: OverviewLayoutBandV0["items"] = [];
        for (const it of itemsRaw) {
            if (it == null || typeof it !== "object") continue;
            const nk = normalizeItemKind((it as { kind?: string }).kind);
            const key = (it as { key?: string }).key;
            if (!nk || typeof key !== "string" || !key.trim()) continue;
            items.push({ kind: nk, key: key.trim(), hint: undefined });
        }
        bands.push({ band_key: bk, enabled, items });
    }
    if (bands.length === 0) return structuredClone(DEFAULT_OVERVIEW_LAYOUT);
    const base: OverviewLayoutConfigV0 = { header_keys, bands };
    if (relationship_group_keys?.length) {
        base.relationship_group_keys = relationship_group_keys;
    }
    return base;
}

export function getDefaultOverviewLayoutConfig(): OverviewLayoutConfigV0 {
    return structuredClone(DEFAULT_OVERVIEW_LAYOUT);
}

/** Keys allowed in overview fields (header + enabled band items). */
export function collectOverviewFieldKeys(layout: OverviewLayoutConfigV0): Set<string> {
    const s = new Set<string>(layout.header_keys);
    for (const b of layout.bands) {
        if (!b.enabled) continue;
        for (const it of b.items) {
            s.add(it.key);
        }
    }
    return s;
}

/**
 * Order for flat `fields[]` on overview: header first, then bands in array order; first occurrence wins (no duplicates).
 */
export function getOrderedOverviewFieldKeys(layout: OverviewLayoutConfigV0): string[] {
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const k of layout.header_keys) {
        const t = typeof k === "string" ? k.trim() : "";
        if (!t || seen.has(t)) continue;
        seen.add(t);
        ordered.push(t);
    }
    for (const b of layout.bands) {
        if (!b.enabled) continue;
        for (const it of b.items) {
            const t = it.key.trim();
            if (!t || seen.has(t)) continue;
            seen.add(t);
            ordered.push(t);
        }
    }
    return ordered;
}

/** Filter and order overview fields to match layout; drops keys not present in layout or missing descriptors. */
export function orderAndFilterOverviewFields(
    fields: ResolvedFieldDescriptor[],
    layout: OverviewLayoutConfigV0
): ResolvedFieldDescriptor[] {
    const allow = collectOverviewFieldKeys(layout);
    const byKey = new Map(fields.map((f) => [f.key, f]));
    const out: ResolvedFieldDescriptor[] = [];
    for (const k of getOrderedOverviewFieldKeys(layout)) {
        if (!allow.has(k)) continue;
        const f = byKey.get(k);
        if (f) out.push(f);
    }
    return out;
}
