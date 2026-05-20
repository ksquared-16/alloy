/**
 * Opportunity workflow v1 — merge field placement behavior into layout config_json.
 * Card 1: write path only; does not mutate field_definitions.
 */

import {
    buildSimpleInteractionPolicy,
    buildSimpleRequirementPolicy,
    type FieldPolicyInteractionPreset,
    type FieldPolicyRequirementPreset,
} from "@/lib/fields/fieldPolicySettingsUi";
import {
    parseFieldPlacementsFromLayoutConfig,
    type FieldPlacementV1,
} from "@/lib/fields/fieldPlacementV1";
import { resolveDrawerFieldPolicy } from "@/lib/fields/drawerFieldPolicyAdapter";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

export type FieldPlacementBehaviorUpdate = {
    field_key: string;
    requirement_preset?: FieldPolicyRequirementPreset;
    interaction_preset?: FieldPolicyInteractionPreset;
};

export type OpportunityFieldPlacementCatalogRow = {
    field_key: string;
    is_system: boolean;
    is_active?: boolean;
};

const REQUIREMENT_PRESETS = new Set<FieldPolicyRequirementPreset>(["optional", "required", "required_on_save"]);
const INTERACTION_PRESETS = new Set<FieldPolicyInteractionPreset>(["editable", "read_only"]);

function isActiveCatalogRow(row: OpportunityFieldPlacementCatalogRow): boolean {
    return row.is_active !== false;
}

function parsePreset(
    raw: unknown,
    allowed: Set<string>
): string | null {
    if (typeof raw !== "string") return null;
    const t = raw.trim() as FieldPolicyRequirementPreset;
    return allowed.has(t) ? t : null;
}

/** Validate one update row; does not throw. */
export function validateFieldPlacementBehaviorUpdate(
    update: FieldPlacementBehaviorUpdate,
    catalogByKey: Map<string, OpportunityFieldPlacementCatalogRow>
): { ok: true } | { ok: false; error: string } {
    const field_key = update.field_key?.trim() ?? "";
    if (!field_key) return { ok: false, error: "Each update requires field_key" };

    const row = catalogByKey.get(field_key);
    if (!row || !isActiveCatalogRow(row)) {
        return { ok: false, error: `Unknown or inactive field_key: ${field_key}` };
    }

    const hasReq = update.requirement_preset !== undefined;
    const hasInt = update.interaction_preset !== undefined;
    if (!hasReq && !hasInt) {
        return {
            ok: false,
            error: `Update for "${field_key}" requires requirement_preset and/or interaction_preset`,
        };
    }

    if (hasReq) {
        const preset = parsePreset(update.requirement_preset, REQUIREMENT_PRESETS);
        if (!preset) {
            return {
                ok: false,
                error: `Invalid requirement_preset for "${field_key}" (optional, required, required_on_save)`,
            };
        }
        const adapter = resolveDrawerFieldPolicy("opportunity", {
            field_key,
            is_system: row.is_system,
        });
        if (!adapter?.requirementSupported) {
            return {
                ok: false,
                error: `Field "${field_key}" does not support layout requirement behavior`,
            };
        }
    }

    if (hasInt) {
        const preset = parsePreset(update.interaction_preset, INTERACTION_PRESETS);
        if (!preset) {
            return {
                ok: false,
                error: `Invalid interaction_preset for "${field_key}" (editable, read_only)`,
            };
        }
        const adapter = resolveDrawerFieldPolicy("opportunity", {
            field_key,
            is_system: row.is_system,
        });
        if (!adapter?.interactionSupported) {
            return {
                ok: false,
                error: `Field "${field_key}" does not support layout editability behavior`,
            };
        }
    }

    return { ok: true };
}

export function validateFieldPlacementBehaviorUpdates(
    updates: FieldPlacementBehaviorUpdate[],
    catalog: OpportunityFieldPlacementCatalogRow[]
): { ok: true } | { ok: false; error: string } {
    if (!Array.isArray(updates) || updates.length === 0) {
        return { ok: false, error: "updates must be a non-empty array" };
    }

    const catalogByKey = new Map<string, OpportunityFieldPlacementCatalogRow>();
    for (const row of catalog) {
        const key = row.field_key.trim();
        if (key) catalogByKey.set(key, row);
    }

    const seen = new Set<string>();
    for (const raw of updates) {
        const field_key = String(raw.field_key ?? "").trim();
        if (!field_key) return { ok: false, error: "Each update requires field_key" };
        if (seen.has(field_key)) {
            return { ok: false, error: `Duplicate field_key in updates: ${field_key}` };
        }
        seen.add(field_key);

        const normalized: FieldPlacementBehaviorUpdate = {
            field_key,
            ...(raw.requirement_preset !== undefined
                ? { requirement_preset: raw.requirement_preset }
                : {}),
            ...(raw.interaction_preset !== undefined
                ? { interaction_preset: raw.interaction_preset }
                : {}),
        };

        const v = validateFieldPlacementBehaviorUpdate(normalized, catalogByKey);
        if (!v.ok) return v;
    }

    return { ok: true };
}

function mergeOnePlacementRow(
    existing: FieldPlacementV1 | undefined,
    update: FieldPlacementBehaviorUpdate
): FieldPlacementV1 {
    const field_key = update.field_key.trim();
    const priorOverview = existing?.surfaces.drawer_overview ?? {};

    const drawer_overview = {
        ...priorOverview,
        ...(update.requirement_preset !== undefined
            ? { requirement: buildSimpleRequirementPolicy(update.requirement_preset) }
            : {}),
        ...(update.interaction_preset !== undefined
            ? {
                  interaction: buildSimpleInteractionPolicy(
                      update.interaction_preset,
                      "opportunity",
                      field_key
                  ),
              }
            : {}),
    };

    const row: FieldPlacementV1 = {
        field_key,
        surfaces: { drawer_overview },
    };

    if (existing?.section_key) row.section_key = existing.section_key;
    if (existing?.sort_order !== undefined) row.sort_order = existing.sort_order;

    return row;
}

/** Preserve prior array order; append new keys alphabetically. */
function placementsMapToArray(
    previousOrder: string[],
    byFieldKey: Map<string, FieldPlacementV1>
): FieldPlacementV1[] {
    const out: FieldPlacementV1[] = [];
    const seen = new Set<string>();

    for (const key of previousOrder) {
        const row = byFieldKey.get(key);
        if (row) {
            out.push(row);
            seen.add(key);
        }
    }

    const extras = [...byFieldKey.keys()].filter((k) => !seen.has(k)).sort((a, b) => a.localeCompare(b));
    for (const key of extras) {
        out.push(byFieldKey.get(key)!);
    }

    return out;
}

function previousPlacementKeyOrder(config: RecordLayoutConfigJson): string[] {
    const raw = config.field_placements_v1;
    if (!Array.isArray(raw)) return [];
    const order: string[] = [];
    for (const item of raw) {
        if (item != null && typeof item === "object" && !Array.isArray(item)) {
            const key = String((item as { field_key?: unknown }).field_key ?? "").trim();
            if (key) order.push(key);
        }
    }
    return order;
}

/**
 * Merge behavior updates into layout config. Preserves all non-placement keys.
 * Normalizes malformed existing `field_placements_v1` (invalid rows dropped).
 */
export function mergeOpportunityWorkflowV1FieldPlacementUpdates(
    baseConfig: RecordLayoutConfigJson,
    updates: FieldPlacementBehaviorUpdate[],
    catalog: OpportunityFieldPlacementCatalogRow[]
): { ok: true; config: RecordLayoutConfigJson } | { ok: false; error: string } {
    const validated = validateFieldPlacementBehaviorUpdates(updates, catalog);
    if (!validated.ok) return validated;

    const parsed = parseFieldPlacementsFromLayoutConfig(baseConfig);
    const byFieldKey = new Map(parsed.byFieldKey);
    const priorOrder = previousPlacementKeyOrder(baseConfig);

    for (const update of updates) {
        const key = update.field_key.trim();
        const existing = byFieldKey.get(key);
        byFieldKey.set(key, mergeOnePlacementRow(existing, update));
    }

    const field_placements_v1 = placementsMapToArray(priorOrder, byFieldKey);

    return {
        ok: true,
        config: {
            ...baseConfig,
            field_placements_v1,
        },
    };
}
