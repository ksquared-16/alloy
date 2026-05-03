import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { displayFromFieldValueRow } from "@/lib/admin/typedFieldValues";
import { withDbTiming } from "@/lib/admin/dbQueryTiming";

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
    field_registry_combined_cache_hit?: boolean;
};

const FIELD_REGISTRY_PROCESS_CACHE = new Map<
    string,
    {
        at: number;
        fieldDefs: {
            id: string;
            field_key: string;
            field_type: string;
            label: string | null;
            section_key: string | null;
            sort_order: number;
            is_system: boolean;
            is_visible_in_drawer: boolean;
        }[];
        fieldSections: { section_key: string; label: string; sort_order: number }[];
    }
>();

const FIELD_REGISTRY_PROCESS_TTL_MS = 90_000;
/** Match status_definitions_resolve: isolate-scoped warmup; disabled in test. */
const FIELD_REGISTRY_PROCESS_CACHE_ENABLED = process.env.NODE_ENV !== "test";

const FIELD_REGISTRY_UNSTABLE_TAGS = ["field-definitions-drawer-registry"];

function fieldRegistryStableKey(orgId: string, entityType: string): string[] {
    return ["field-registry-drawer-v1", orgId, entityType];
}

async function fetchFieldDefinitionsAndSectionsFromDb(
    orgId: string,
    entityType: string
): Promise<{
    fieldDefs: {
        id: string;
        field_key: string;
        field_type: string;
        label: string | null;
        section_key: string | null;
        sort_order: number;
        is_system: boolean;
        is_visible_in_drawer: boolean;
    }[];
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
                    .select("id, field_key, field_type, label, section_key, sort_order, is_system, is_visible_in_drawer")
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
    const fieldDefs = (defRows ?? []) as {
        id: string;
        field_key: string;
        field_type: string;
        label: string | null;
        section_key: string | null;
        sort_order: number;
        is_system: boolean;
        is_visible_in_drawer: boolean;
    }[];
    return {
        fieldDefs,
        fieldSections: (sectionRows ?? []) as { section_key: string; label: string; sort_order: number }[],
    };
}

async function resolveFieldDefinitionsAndSectionsForDrawer(
    orgId: string,
    entityType: string
): Promise<{ fieldDefs: Awaited<ReturnType<typeof fetchFieldDefinitionsAndSectionsFromDb>>["fieldDefs"]; fieldSections: { section_key: string; label: string; sort_order: number }[]; meta: FieldRegistryAttachMeta }> {
    const procKey = `${orgId}\u0001${entityType}`;
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
                    field_registry_combined_cache_hit: true,
                },
            };
        }
    }

    let fetcherRan = false;
    let bundle: {
        fieldDefs: {
            id: string;
            field_key: string;
            field_type: string;
            label: string | null;
            section_key: string | null;
            sort_order: number;
            is_system: boolean;
            is_visible_in_drawer: boolean;
        }[];
        fieldSections: { section_key: string; label: string; sort_order: number }[];
    };
    let unstableAttempted = false;
    const runUncached = async () => {
        fetcherRan = true;
        return fetchFieldDefinitionsAndSectionsFromDb(orgId, entityType);
    };

    if (typeof unstable_cache === "function" && process.env.NODE_ENV !== "test") {
        unstableAttempted = true;
        bundle = await unstable_cache(runUncached, fieldRegistryStableKey(orgId, entityType), {
            revalidate: 90,
            tags: [...FIELD_REGISTRY_UNSTABLE_TAGS, `field-registry-org:${orgId}`],
        })();
    } else {
        bundle = await runUncached();
    }

    const unstableHit = unstableAttempted && !fetcherRan;
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
            field_registry_combined_cache_hit: combinedCacheHit,
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
export async function attachFieldDefinitionsAndValues(
    supabase: AdminClient,
    out: Record<string, unknown>,
    drawerType: string,
    entityId: string,
    options?: { mergeValues?: boolean }
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

    const { fieldDefs, fieldSections, meta } = await resolveFieldDefinitionsAndSectionsForDrawer(orgId, entityType);
    out._field_definitions = fieldDefs;
    out._field_sections = fieldSections;

    if (fieldDefs.length === 0) return meta;

    const customDefs = fieldDefs.filter((d) => !d.is_system);
    const customDefIds = customDefs.map((d) => d.id);
    if (customDefIds.length === 0 || !mergeValues) return meta;

    const fvRows = await withDbTiming(
        "field_values.by_entity",
        { orgId, entityType, entityId, def_count: customDefIds.length },
        async () => {
            const { data } = await supabase
                .from("field_values")
                .select("field_definition_id, value_text, value_number, value_boolean, value_date, value_json")
                .eq("entity_type", entityType)
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
    return meta;
}
