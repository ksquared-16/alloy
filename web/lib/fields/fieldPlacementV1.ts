/**
 * Layout field placement v1 — stored on `record_drawer_layouts.config_json.field_placements_v1`.
 * Card 0: parse/normalize only; no persistence or UI.
 */

import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import {
    parseFieldInteractionPolicy,
    type FieldInteractionPolicyV1,
} from "@/lib/fields/fieldInteractionPolicy";
import {
    parseFieldRequirementPolicy,
    type FieldRequirementPolicyV1,
} from "@/lib/fields/fieldRequirementPolicy";

export const FIELD_PLACEMENT_VERSION = 1 as const;

/** v1 surface scope for opportunity workflow drawer body fields. */
export const FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW = "drawer_overview" as const;

export type FieldBehaviorSurfaceV1 = typeof FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW;

export type FieldPlacementSurfaceBehaviorV1 = {
    requirement?: FieldRequirementPolicyV1;
    interaction?: FieldInteractionPolicyV1;
};

export type FieldPlacementV1 = {
    field_key: string;
    section_key?: string;
    sort_order?: number;
    surfaces: {
        drawer_overview?: FieldPlacementSurfaceBehaviorV1;
    };
};

export type ParsedFieldPlacementsResult = {
    /** Valid placements indexed by field_key (last duplicate wins). */
    byFieldKey: Map<string, FieldPlacementV1>;
    /** Count of input rows skipped due to validation errors. */
    skippedCount: number;
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
    return x != null && typeof x === "object" && !Array.isArray(x);
}

function parseOptionalString(x: unknown): string | undefined {
    if (typeof x !== "string") return undefined;
    const t = x.trim();
    return t || undefined;
}

function parseOptionalSortOrder(x: unknown): number | undefined {
    if (typeof x === "number" && !Number.isNaN(x)) return x;
    if (typeof x === "string" && x.trim() !== "") {
        const n = Number(x);
        if (!Number.isNaN(n)) return n;
    }
    return undefined;
}

function parseSurfaceBehavior(raw: unknown): FieldPlacementSurfaceBehaviorV1 | undefined {
    if (!isPlainObject(raw)) return undefined;
    const out: FieldPlacementSurfaceBehaviorV1 = {};

    if (raw.requirement !== undefined && raw.requirement !== null) {
        const req = parseFieldRequirementPolicy(raw.requirement);
        if (req.ok) out.requirement = req.value;
    }

    if (raw.interaction !== undefined && raw.interaction !== null) {
        const int = parseFieldInteractionPolicy(raw.interaction);
        if (int.ok) out.interaction = int.value;
    }

    if (out.requirement === undefined && out.interaction === undefined) return undefined;
    return out;
}

function parseSurfaces(raw: unknown): FieldPlacementV1["surfaces"] | undefined {
    if (!isPlainObject(raw)) return undefined;
    const drawer_overview = parseSurfaceBehavior(raw[FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW]);
    if (!drawer_overview) return undefined;
    return { drawer_overview };
}

/** Parse one placement row; returns null when row must be skipped. */
export function parseFieldPlacementRow(raw: unknown): FieldPlacementV1 | null {
    if (!isPlainObject(raw)) return null;
    const field_key = parseOptionalString(raw.field_key);
    if (!field_key) return null;

    const surfaces = parseSurfaces(raw.surfaces);
    if (!surfaces?.drawer_overview) return null;

    const placement: FieldPlacementV1 = {
        field_key,
        surfaces,
    };

    const section_key = parseOptionalString(raw.section_key);
    if (section_key) placement.section_key = section_key;

    const sort_order = parseOptionalSortOrder(raw.sort_order);
    if (sort_order !== undefined) placement.sort_order = sort_order;

    return placement;
}

/**
 * Parse `field_placements_v1` from layout config. Never throws.
 * Malformed array or entries → skipped; returns empty map on total failure.
 */
export function parseFieldPlacementsFromLayoutConfig(
    config: RecordLayoutConfigJson | null | undefined
): ParsedFieldPlacementsResult {
    const byFieldKey = new Map<string, FieldPlacementV1>();
    let skippedCount = 0;

    const raw = config?.field_placements_v1;
    if (raw === undefined || raw === null) {
        return { byFieldKey, skippedCount: 0 };
    }
    if (!Array.isArray(raw)) {
        return { byFieldKey, skippedCount: 1 };
    }

    for (const item of raw) {
        const parsed = parseFieldPlacementRow(item);
        if (!parsed) {
            skippedCount += 1;
            continue;
        }
        byFieldKey.set(parsed.field_key, parsed);
    }

    return { byFieldKey, skippedCount };
}

/** Read drawer_overview behavior for a field from parsed placements. */
export function getDrawerOverviewPlacementBehavior(
    placements: ParsedFieldPlacementsResult,
    fieldKey: string
): FieldPlacementSurfaceBehaviorV1 | null {
    const row = placements.byFieldKey.get(fieldKey.trim());
    return row?.surfaces.drawer_overview ?? null;
}
