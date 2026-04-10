/**
 * Strict validation for `record_overview_layouts.config` (writes + agent v1).
 * Lenient read path remains `parseOverviewLayoutConfig` in overviewLayoutV0.ts.
 */

import type { OverviewLayoutBandV0, OverviewLayoutConfigV0 } from "./overviewLayoutV0";

const TOP_LEVEL = new Set(["version", "bands", "header_keys", "relationship_group_keys"]);

const BAND_KEYS = new Set([
    "summary",
    "people",
    "operational",
    "financial",
    "relationships",
    "service_property",
]);

function normalizeItemKind(kind: unknown): "system_field" | "custom_field" | "section" | null {
    if (kind === "field") return "system_field";
    if (kind === "system_field" || kind === "custom_field" || kind === "section") {
        return kind;
    }
    return null;
}

/** Relationship groups currently emitted by job RRS (`buildRelationshipGroups`). */
export const JOB_OVERVIEW_RELATIONSHIP_GROUP_KEYS = new Set(["primary_customer_person", "customer_account"]);

export type OverviewLayoutConfigStrictResult =
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; error: string };

function extraKeys(obj: Record<string, unknown>, allowed: Set<string>): string | undefined {
    for (const k of Object.keys(obj)) {
        if (!allowed.has(k)) return k;
    }
    return undefined;
}

/** Stored `config` jsonb: missing or non-integer `version` → 0 (optimistic concurrency). */
export function getOverviewLayoutConfigStoredVersion(raw: unknown): number {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return 0;
    const v = (raw as Record<string, unknown>).version;
    return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 0;
}

/**
 * Strict parse for persistence: rejects unknown keys, requires `version` ≥ 1.
 * `relationship_group_keys` (if present) must ⊆ JOB_OVERVIEW_RELATIONSHIP_GROUP_KEYS (job overview v1).
 */
export function parseOverviewLayoutConfigStrict(raw: unknown): OverviewLayoutConfigStrictResult {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "config must be a JSON object" };
    }
    const o = raw as Record<string, unknown>;
    const bad = extraKeys(o, TOP_LEVEL);
    if (bad) return { ok: false, error: `unknown key: ${bad}` };

    if (typeof o.version !== "number" || !Number.isInteger(o.version) || o.version < 1) {
        return { ok: false, error: "config.version must be an integer >= 1" };
    }

    if (!Array.isArray(o.header_keys)) {
        return { ok: false, error: "header_keys must be an array" };
    }
    const header_keys: string[] = [];
    for (const x of o.header_keys) {
        if (typeof x !== "string" || !x.trim()) {
            return { ok: false, error: "header_keys must be non-empty strings" };
        }
        const t = x.trim();
        if (!/^[a-z0-9_:]+$/.test(t)) {
            return { ok: false, error: `invalid header_keys entry: ${t}` };
        }
        header_keys.push(t);
    }

    if (!Array.isArray(o.bands)) {
        return { ok: false, error: "bands must be an array" };
    }

    const bandsOut: OverviewLayoutBandV0[] = [];
    const seenBand = new Set<string>();

    for (let i = 0; i < o.bands.length; i++) {
        const b = o.bands[i];
        if (b == null || typeof b !== "object" || Array.isArray(b)) {
            return { ok: false, error: `bands[${i}] must be an object` };
        }
        const br = b as Record<string, unknown>;
        const bkBad = extraKeys(br, new Set(["band_key", "enabled", "items"]));
        if (bkBad) return { ok: false, error: `bands[${i}]: unknown key: ${bkBad}` };

        const bk = br.band_key;
        if (typeof bk !== "string" || !BAND_KEYS.has(bk)) {
            return { ok: false, error: `bands[${i}]: invalid band_key` };
        }
        if (seenBand.has(bk)) {
            return { ok: false, error: `duplicate band_key: ${bk}` };
        }
        seenBand.add(bk);

        if (br.enabled !== true && br.enabled !== false) {
            return { ok: false, error: `bands[${i}]: enabled must be a boolean` };
        }
        const enabled = br.enabled;

        if (!Array.isArray(br.items)) {
            return { ok: false, error: `bands[${i}].items must be an array` };
        }

        const items: OverviewLayoutBandV0["items"] = [];
        for (let j = 0; j < br.items.length; j++) {
            const it = br.items[j];
            if (it == null || typeof it !== "object" || Array.isArray(it)) {
                return { ok: false, error: `bands[${i}].items[${j}] must be an object` };
            }
            const ir = it as Record<string, unknown>;
            const ikBad = extraKeys(ir, new Set(["kind", "key", "hint"]));
            if (ikBad) return { ok: false, error: `bands[${i}].items[${j}]: unknown key: ${ikBad}` };

            const finalKind = normalizeItemKind(ir.kind);
            if (!finalKind) {
                return { ok: false, error: `bands[${i}].items[${j}]: invalid kind` };
            }

            const key = ir.key;
            if (typeof key !== "string" || !key.trim()) {
                return { ok: false, error: `bands[${i}].items[${j}]: key required` };
            }

            let hint: { span?: 1 | 2 | 3 } | undefined;
            if (ir.hint !== undefined) {
                if (ir.hint == null || typeof ir.hint !== "object" || Array.isArray(ir.hint)) {
                    return { ok: false, error: `bands[${i}].items[${j}]: hint must be an object` };
                }
                const hr = ir.hint as Record<string, unknown>;
                const hBad = extraKeys(hr, new Set(["span"]));
                if (hBad) return { ok: false, error: `bands[${i}].items[${j}].hint: unknown key: ${hBad}` };
                const sp = hr.span;
                if (sp !== undefined && sp !== 1 && sp !== 2 && sp !== 3) {
                    return { ok: false, error: `bands[${i}].items[${j}].hint.span must be 1, 2, or 3` };
                }
                if (sp !== undefined) hint = { span: sp as 1 | 2 | 3 };
            }

            items.push({ kind: finalKind, key: key.trim(), hint });
        }

        bandsOut.push({
            band_key: bk as OverviewLayoutBandV0["band_key"],
            enabled,
            items,
        });
    }

    let relationship_group_keys: string[] | undefined;
    if (o.relationship_group_keys !== undefined) {
        if (!Array.isArray(o.relationship_group_keys)) {
            return { ok: false, error: "relationship_group_keys must be an array" };
        }
        const rel: string[] = [];
        for (const x of o.relationship_group_keys) {
            if (typeof x !== "string" || !x.trim()) {
                return { ok: false, error: "relationship_group_keys must be non-empty strings" };
            }
            const t = x.trim();
            if (!JOB_OVERVIEW_RELATIONSHIP_GROUP_KEYS.has(t)) {
                return {
                    ok: false,
                    error: `relationship_group_keys must be one of: ${[...JOB_OVERVIEW_RELATIONSHIP_GROUP_KEYS].join(", ")}`,
                };
            }
            rel.push(t);
        }
        if (rel.length) relationship_group_keys = rel;
    }

    const semantic: OverviewLayoutConfigV0 = {
        header_keys,
        bands: bandsOut,
    };
    if (relationship_group_keys?.length) {
        semantic.relationship_group_keys = relationship_group_keys;
    }

    const out: Record<string, unknown> = {
        version: o.version,
        header_keys: semantic.header_keys,
        bands: semantic.bands.map((band) => ({
            band_key: band.band_key,
            enabled: band.enabled,
            items: band.items.map((it) => {
                const row: Record<string, unknown> = { kind: it.kind, key: it.key };
                if (it.hint !== undefined) row.hint = it.hint;
                return row;
            }),
        })),
    };
    if (semantic.relationship_group_keys?.length) {
        out.relationship_group_keys = semantic.relationship_group_keys;
    }

    return { ok: true, value: out };
}

export const overviewLayoutConfigStrictSchema = {
    parseStrict: parseOverviewLayoutConfigStrict,
    getStoredVersion: getOverviewLayoutConfigStoredVersion,
} as const;
