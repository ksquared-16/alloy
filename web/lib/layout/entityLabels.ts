/**
 * Layout V2 — client-side entity-label lookup.
 *
 * The Layout config + proof surfaces live in an isolated route group and do not
 * sit under the admin EntityLabelsProvider, so they fetch effective labels via
 * the existing /api/admin/entity-labels endpoint and fall back to a humanized
 * form of the raw entity_type key when no configured label exists.
 *
 * Read-only. Not used by any live runtime renderer.
 */

import { fieldEntityKey } from "./entityKeys";

export type EntityLabel = { singular: string; plural: string };
export type EntityLabelMap = Record<string, EntityLabel>;

/** "service_plan_templates" → "Service Plan Templates" (fallback only). */
export function humanizeEntityType(entityType: string): string {
    return entityType
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/**
 * Prefer the configured label; fall back to a humanized key.
 *
 * Looks up by the canonical (plural) key first, then by the singular
 * field-entity alias (in case labels for this entity are keyed singular), then
 * humanizes — so a configured label resolves regardless of key form.
 */
export function entityTypeLabel(map: EntityLabelMap, entityType: string, form: "singular" | "plural" = "plural"): string {
    const row = map[entityType] ?? map[fieldEntityKey(entityType)];
    const configured = row ? (form === "plural" ? row.plural : row.singular) : undefined;
    return (configured && configured.trim()) || humanizeEntityType(entityType);
}

type EffectiveRow = { entity_type?: string; singular?: string | null; plural?: string | null };

/**
 * Fetch the org's effective entity labels. Returns an empty map on any failure
 * (callers then fall back to humanized keys).
 */
export async function fetchEntityLabelMap(): Promise<EntityLabelMap> {
    try {
        const res = await fetch("/api/admin/entity-labels");
        if (!res.ok) return {};
        const json = (await res.json().catch(() => ({}))) as { effective?: EffectiveRow[] };
        const map: EntityLabelMap = {};
        for (const row of json.effective ?? []) {
            if (!row.entity_type) continue;
            map[row.entity_type] = {
                singular: row.singular?.trim() || humanizeEntityType(row.entity_type),
                plural: row.plural?.trim() || humanizeEntityType(row.entity_type),
            };
        }
        return map;
    } catch {
        return {};
    }
}
