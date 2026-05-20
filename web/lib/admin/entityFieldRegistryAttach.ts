import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { displayFromFieldValueRow } from "@/lib/admin/typedFieldValues";
import { withDbTiming } from "@/lib/admin/dbQueryTiming";
import {
    attachDrawerFieldPolicyResolution,
    type DrawerFieldDefinitionAttachRow,
} from "@/lib/fields/drawerFieldPolicyAdapter";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

export type { DrawerFieldDefinitionAttachRow } from "@/lib/fields/drawerFieldPolicyAdapter";

export const DRAWER_TYPE_TO_FIELD_ENTITY_TYPE: Record<string, string> = {
    customers: "customer",
    jobs: "job",
    opportunities: "opportunity",
    vendors: "vendor",
    schedules: "schedule",
    persons: "person",
    locations: "location",
};

type AdminClient = ReturnType<typeof createAdminClient>;

/** Populated when org-scoped field_definitions / sections are served without re-query (see attachFieldDefinitionsAndValues). */
export type FieldRegistryAttachMeta = {
    field_registry_process_cache_hit?: boolean;
    field_registry_unstable_attempted?: boolean;
    field_registry_next_cache_hit?: boolean;
    /** Postgres defs snapshot skipped via process LRU or Next unstable_cache snapshot. */
    field_registry_defs_warm?: boolean;
    /** Canonical key string for staged proof / collision checks ({@link fieldRegistryDrawerStableKeyString}). */
    field_registry_stable_cache_key?: string | null;
    /** True when Next `unstable_cache` invocation did not execute the defs fetcher (exclusive with cold Postgres defs). */
    field_registry_combined_cache_hit?: boolean;
    /** Wall time of uncached defs+sections DB fetch inside `resolveFieldDefinitionsAndSectionsForDrawer` inner fetcher only. */
    field_registry_uncached_ms?: number;
    /** Outer wall time resolving defs + sections (includes cache bookkeeping). */
    field_registry_defs_resolve_wall_ms?: number;
    /** Wall time loading + merging entity `field_values` rows after defs attach. */
    field_registry_field_values_wall_ms?: number;
};

const FIELD_REGISTRY_PROCESS_CACHE = new Map<
    string,
    {
        at: number;
        fieldDefs: DrawerFieldDefinitionAttachRow[];
        fieldSections: { section_key: string; label: string; sort_order: number }[];
    }
>();

const FIELD_REGISTRY_PROCESS_TTL_MS = 300_000;

const FIELD_DEFINITIONS_DRAWER_SELECT =
    "id, field_key, field_type, label, section_key, sort_order, is_system, is_visible_in_drawer, is_required, requirement_policy, interaction_policy";
/** Match status_definitions_resolve: isolate-scoped warmup; disabled in test. */
const FIELD_REGISTRY_PROCESS_CACHE_ENABLED = process.env.NODE_ENV !== "test";

const FIELD_REGISTRY_UNSTABLE_TAGS = ["field-definitions-drawer-registry"];

function normalizeFieldRegistryDbEntityType(entityType: string): string {
    const t = entityType.trim().toLowerCase();
    switch (t) {
        case "opportunity":
        case "opportunities":
            return "opportunity";
        case "customer":
        case "customers":
            return "customer";
        case "job":
        case "jobs":
            return "job";
        case "schedule":
        case "schedules":
            return "schedule";
        case "vendor":
        case "vendors":
            return "vendor";
        case "person":
        case "persons":
            return "person";
        case "location":
        case "locations":
            return "location";
        default:
            return entityType.trim();
    }
}

function fieldRegistryStableKey(orgId: string, entityType: string): string[] {
    const canonDb = normalizeFieldRegistryDbEntityType(entityType);
    return ["field-registry-drawer-v2", orgId, canonDb];
}

/** Debug identity for drawer field_definitions cache (`field-registry-drawer-v2` + org + canonical DB entity_type). */
export function fieldRegistryDrawerStableKeyString(orgId: string, drawerSurfaceType: string): string | null {
    const et = DRAWER_TYPE_TO_FIELD_ENTITY_TYPE[drawerSurfaceType];
    const trimmedOrg = String(orgId ?? "").trim();
    if (!et || !trimmedOrg) return null;
    const canon = normalizeFieldRegistryDbEntityType(et);
    return fieldRegistryStableKey(trimmedOrg, et).join(":");
}

async function fetchFieldDefinitionsAndSectionsFromDb(
    orgId: string,
    entityType: string
): Promise<{
    fieldDefs: DrawerFieldDefinitionAttachRow[];
    fieldSections: { section_key: string; label: string; sort_order: number }[];
}> {
    const supabase = createAdminClient();
    const [defRows, sectionRows] = await Promise.all([
        withDbTiming(
            "field_definitions.list_active",
            { orgId, entityType },
            async () => {
                const { data } = await supabase
                    .from("field_definitions")
                    .select(FIELD_DEFINITIONS_DRAWER_SELECT)
                    .eq("org_id", orgId)
                    .eq("entity_type", entityType)
                    .eq("is_active", true)
                    .order("section_key", { ascending: true })
                    .order("sort_order", { ascending: true });
                return data;
            }
        ),
        withDbTiming(
            "field_section_definitions.list",
            { orgId, entityType },
            async () => {
                const { data } = await supabase
                    .from("field_section_definitions")
                    .select("section_key, label, sort_order")
                    .eq("org_id", orgId)
                    .eq("entity_type", entityType)
                    .order("sort_order", { ascending: true });
                return data;
            }
        ),
    ]);
    const fieldDefs = (defRows ?? []) as DrawerFieldDefinitionAttachRow[];
    return {
        fieldDefs,
        fieldSections: (sectionRows ?? []) as { section_key: string; label: string; sort_order: number }[],
    };
}

async function resolveFieldDefinitionsAndSectionsForDrawer(
    orgId: string,
    entityType: string
): Promise<{ fieldDefs: Awaited<ReturnType<typeof fetchFieldDefinitionsAndSectionsFromDb>>["fieldDefs"]; fieldSections: { section_key: string; label: string; sort_order: number }[]; meta: FieldRegistryAttachMeta }> {
    const entityCanon = normalizeFieldRegistryDbEntityType(entityType);
    const procKey = `${orgId}\u0001${entityCanon}`;
    if (FIELD_REGISTRY_PROCESS_CACHE_ENABLED) {
        const warm = FIELD_REGISTRY_PROCESS_CACHE.get(procKey);
        const now = Date.now();
        if (warm && now - warm.at < FIELD_REGISTRY_PROCESS_TTL_MS) {
            return {
                fieldDefs: warm.fieldDefs,
                fieldSections: warm.fieldSections,
                meta: {
                    field_registry_process_cache_hit: true,
                    field_registry_unstable_attempted: false,
                    field_registry_next_cache_hit: false,
                    field_registry_defs_warm: true,
                    /** No Postgres defs query this request — process LRU only (Next data cache untouched). */
                    field_registry_combined_cache_hit: true,
                },
            };
        }
    }

    let fetcherRan = false;
    let fieldRegistryUncachedMs = 0;
    let bundle: {
        fieldDefs: DrawerFieldDefinitionAttachRow[];
        fieldSections: { section_key: string; label: string; sort_order: number }[];
    };
    let unstableAttempted = false;
    const runUncached = async () => {
        fetcherRan = true;
        const uc0 = Date.now();
        const b = await fetchFieldDefinitionsAndSectionsFromDb(orgId, entityCanon);
        fieldRegistryUncachedMs = Date.now() - uc0;
        return b;
    };

    if (typeof unstable_cache === "function" && process.env.NODE_ENV !== "test") {
        unstableAttempted = true;
        bundle = await unstable_cache(runUncached, fieldRegistryStableKey(orgId, entityType), {
            revalidate: 300,
            tags: [...FIELD_REGISTRY_UNSTABLE_TAGS, `field-registry-org:${orgId}`],
        })();
    } else {
        bundle = await runUncached();
    }

    const unstableHit = unstableAttempted && !fetcherRan;
    /** True when defs+sections snapshot came without a Postgres defs query (`unstable_cache` hit). */
    const combinedCacheHit = unstableHit;

    if (FIELD_REGISTRY_PROCESS_CACHE_ENABLED) {
        FIELD_REGISTRY_PROCESS_CACHE.set(procKey, {
            at: Date.now(),
            fieldDefs: bundle.fieldDefs,
            fieldSections: bundle.fieldSections,
        });
    }

    return {
        fieldDefs: bundle.fieldDefs,
        fieldSections: bundle.fieldSections,
        meta: {
            field_registry_process_cache_hit: false,
            field_registry_unstable_attempted: unstableAttempted,
            field_registry_next_cache_hit: unstableHit,
            field_registry_defs_warm: unstableHit,
            field_registry_combined_cache_hit: combinedCacheHit,
            ...(fetcherRan && fieldRegistryUncachedMs >= 0
                ? { field_registry_uncached_ms: fieldRegistryUncachedMs }
                : {}),
        },
    };
}

/** True if the entity row already has a value we should not replace with an empty custom field_values overlay. */
export function hasMeaningfulNativeFieldValue(v: unknown): boolean {
    if (v === undefined) return false;
    if (v === null) return false;
    if (typeof v === "boolean") return true;
    if (typeof v === "number") return !Number.isNaN(v);
    if (typeof v === "string") return v.trim() !== "";
    return true;
}

/**
 * Loads field_definitions for the drawer entity and merges custom (non-system) field_values into `out`.
 * System fields must come from native columns on `out`; field_values rows tied to system definitions are ignored.
 * Org-wide definitions + sections are cached (short process TTL + Next `unstable_cache`); per-record field_values remain live.
 */
export type AttachFieldDefinitionsAndValuesOptions = {
    mergeValues?: boolean;
    /** Card 2 — single layout fetch for opportunity placement-aware `_field_policy_resolved`. */
    layoutConfig?: RecordLayoutConfigJson | null;
};

export async function attachFieldDefinitionsAndValues(
    supabase: AdminClient,
    out: Record<string, unknown>,
    drawerType: string,
    entityId: string,
    options?: AttachFieldDefinitionsAndValuesOptions
): Promise<FieldRegistryAttachMeta> {
    const emptyMeta: FieldRegistryAttachMeta = {};
    const mergeValues = options?.mergeValues !== false;
    const entityType = DRAWER_TYPE_TO_FIELD_ENTITY_TYPE[drawerType];
    if (!entityType) return emptyMeta;
    let orgId: string | null = (out.org_id as string) ?? null;
    if (!orgId && drawerType === "schedules" && out._job) {
        orgId = (out._job as { org_id?: string }).org_id ?? null;
    }
    if (!orgId) return emptyMeta;

    const dbEntityType = normalizeFieldRegistryDbEntityType(entityType);

    const tDefsWall0 = Date.now();
    const { fieldDefs, fieldSections, meta: defsMeta } = await resolveFieldDefinitionsAndSectionsForDrawer(orgId, entityType);
    const defsResolveWallMs = Date.now() - tDefsWall0;

    const stableKey = fieldRegistryDrawerStableKeyString(orgId, drawerType);
    const mergedDefsMeta: FieldRegistryAttachMeta = {
        ...defsMeta,
        field_registry_stable_cache_key: stableKey,
        /** Cold Postgres defs avoided (process LRU or Next snapshot) — aligns staging “warm” dashboards. */
        field_registry_combined_cache_hit:
            !!defsMeta.field_registry_process_cache_hit || !!defsMeta.field_registry_next_cache_hit,
        field_registry_defs_resolve_wall_ms: defsResolveWallMs,
        field_registry_defs_warm:
            defsMeta.field_registry_defs_warm === true ||
            !!defsMeta.field_registry_process_cache_hit ||
            !!defsMeta.field_registry_next_cache_hit,
    };

    out._field_definitions = fieldDefs;
    out._field_sections = fieldSections;
    attachDrawerFieldPolicyResolution(out, drawerType, {
        layoutConfig: drawerType === "opportunities" ? options?.layoutConfig ?? null : undefined,
    });

    if (fieldDefs.length === 0) return mergedDefsMeta;

    const customDefs = fieldDefs.filter((d) => !d.is_system);
    const customDefIds = customDefs.map((d) => d.id);
    if (customDefIds.length === 0 || !mergeValues) return mergedDefsMeta;

    const tFvWall0 = Date.now();
    const fvRows = await withDbTiming(
        "field_values.by_entity",
        { orgId, entityType: dbEntityType, entityId, def_count: customDefIds.length },
        async () => {
            const { data } = await supabase
                .from("field_values")
                .select("field_definition_id, value_text, value_number, value_boolean, value_date, value_json")
                .eq("entity_type", dbEntityType)
                .eq("entity_id", entityId)
                .in("field_definition_id", customDefIds);
            return data;
        }
    );

    type FvRow = {
        field_definition_id: string;
        value_text?: string | null;
        value_number?: number | null;
        value_boolean?: boolean | null;
        value_date?: string | null;
        value_json?: unknown;
    };
    const rowByDefId = new Map(((fvRows ?? []) as FvRow[]).map((r) => [r.field_definition_id, r] as const));

    for (const d of customDefs) {
        const row = rowByDefId.get(d.id);
        const before = out[d.field_key];
        if (row) {
            const applied = displayFromFieldValueRow(d.field_type, row);
            const appliedEmpty = applied === "" || (typeof applied === "string" && applied.trim() === "");
            if (!appliedEmpty) {
                (out as Record<string, unknown>)[d.field_key] = applied;
            } else if (!hasMeaningfulNativeFieldValue(before)) {
                (out as Record<string, unknown>)[d.field_key] = applied;
            }
        } else if (!hasMeaningfulNativeFieldValue(before) && !(d.field_key in out)) {
            (out as Record<string, unknown>)[d.field_key] = "";
        }
    }
    return {
        ...mergedDefsMeta,
        field_registry_field_values_wall_ms: Date.now() - tFvWall0,
    };
}
