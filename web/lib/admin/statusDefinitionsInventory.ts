import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitionsDirect } from "@/lib/admin/statusDefinitionsResolve";
import {
    personStatusAppliesToProfile,
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    PERSON_STATUS_PROFILE_GENERIC,
    type PersonStatusApplicabilityRow,
} from "@/lib/admin/person/personStatusApplicability";
import { personStatusMissingApplicabilityMetadata } from "@/lib/admin/statusSettingsClarity";

export type StatusKeyUsage = {
    status_key: string;
    count: number;
};

export type StatusInventoryLayer = {
    entity_type: string;
    column: string;
    active_definitions: Array<{
        status_key: string;
        status_label: string | null;
        is_active: boolean;
        usage_count: number;
    }>;
    distinct_persisted: StatusKeyUsage[];
    orphan_persisted_keys: StatusKeyUsage[];
    unused_definition_keys: string[];
    missing_applicability_metadata?: string[];
    hidden_from_person_drawer?: string[];
    hidden_from_child_drawer?: string[];
};

export type StatusDefinitionsInventoryReport = {
    org_id: string;
    generated_at: string;
    layers: StatusInventoryLayer[];
    summary: {
        total_orphan_persisted: number;
        total_unused_definitions: number;
        persons_missing_applicability_metadata: number;
        persons_hidden_from_person_drawer: number;
        persons_hidden_from_child_drawer: number;
    };
};

const INVENTORY_LAYERS: Array<{ entity_type: string; table: string; column: string }> = [
    { entity_type: "opportunities", table: "opportunities", column: "status_key" },
    { entity_type: "persons", table: "persons", column: "status_key" },
    {
        entity_type: "opportunity_customer_members",
        table: "opportunity_customer_members",
        column: "outcome_status_key",
    },
    { entity_type: "customer_members", table: "customer_members", column: "status_key" },
];

const INVENTORY_PAGE_SIZE = 2000;

export function compareDefinitionsToPersisted(params: {
    activeDefinitionKeys: Set<string>;
    persistedCounts: Map<string, number>;
}): {
    orphan_persisted_keys: StatusKeyUsage[];
    unused_definition_keys: string[];
} {
    const orphan_persisted_keys: StatusKeyUsage[] = [];
    for (const [status_key, count] of params.persistedCounts.entries()) {
        if (!params.activeDefinitionKeys.has(status_key)) {
            orphan_persisted_keys.push({ status_key, count });
        }
    }
    orphan_persisted_keys.sort((a, b) => b.count - a.count || a.status_key.localeCompare(b.status_key));

    const usedKeys = new Set(params.persistedCounts.keys());
    const unused_definition_keys = [...params.activeDefinitionKeys]
        .filter((key) => !usedKeys.has(key))
        .sort((a, b) => a.localeCompare(b));

    return { orphan_persisted_keys, unused_definition_keys };
}

async function fetchDistinctStatusKeyCounts(
    supabase: SupabaseClient,
    table: string,
    orgId: string,
    column: string
): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    let offset = 0;

    while (true) {
        const { data, error } = await supabase
            .from(table)
            .select(column)
            .eq("org_id", orgId)
            .not(column, "is", null)
            .range(offset, offset + INVENTORY_PAGE_SIZE - 1);

        if (error) {
            throw new Error(`inventory ${table}.${column}: ${error.message}`);
        }

        const rows = data ?? [];
        for (const row of rows) {
            const sk = String((row as unknown as Record<string, unknown>)[column] ?? "").trim();
            if (!sk) continue;
            counts.set(sk, (counts.get(sk) ?? 0) + 1);
        }

        if (rows.length < INVENTORY_PAGE_SIZE) break;
        offset += INVENTORY_PAGE_SIZE;
    }

    return counts;
}

function analyzePersonDefinitions(
    defs: Array<PersonStatusApplicabilityRow & { status_key: string; is_active: boolean }>
): Pick<
    StatusInventoryLayer,
    "missing_applicability_metadata" | "hidden_from_person_drawer" | "hidden_from_child_drawer"
> {
    const missing_applicability_metadata: string[] = [];
    const hidden_from_person_drawer: string[] = [];
    const hidden_from_child_drawer: string[] = [];

    for (const def of defs) {
        if (personStatusMissingApplicabilityMetadata(def.metadata)) {
            missing_applicability_metadata.push(def.status_key);
        }
        if (!def.is_active) continue;
        if (!personStatusAppliesToProfile(def, PERSON_STATUS_PROFILE_GENERIC)) {
            hidden_from_person_drawer.push(def.status_key);
        }
        if (!personStatusAppliesToProfile(def, PERSON_STATUS_PROFILE_CHILD_LIFECYCLE)) {
            hidden_from_child_drawer.push(def.status_key);
        }
    }

    return {
        missing_applicability_metadata: missing_applicability_metadata.sort(),
        hidden_from_person_drawer: hidden_from_person_drawer.sort(),
        hidden_from_child_drawer: hidden_from_child_drawer.sort(),
    };
}

export async function runStatusDefinitionsInventory(
    supabase: SupabaseClient,
    orgId: string
): Promise<StatusDefinitionsInventoryReport> {
    const layers: StatusInventoryLayer[] = [];

    for (const layer of INVENTORY_LAYERS) {
        const defs = await fetchEffectiveStatusDefinitionsDirect(supabase, orgId, layer.entity_type, {
            activeOnly: true,
        });
        const activeDefinitionKeys = new Set(defs.map((d) => d.status_key));
        const persistedCounts = await fetchDistinctStatusKeyCounts(
            supabase,
            layer.table,
            orgId,
            layer.column
        );
        const { orphan_persisted_keys, unused_definition_keys } = compareDefinitionsToPersisted({
            activeDefinitionKeys,
            persistedCounts,
        });

        const distinct_persisted = [...persistedCounts.entries()]
            .map(([status_key, count]) => ({ status_key, count }))
            .sort((a, b) => b.count - a.count || a.status_key.localeCompare(b.status_key));

        const inventoryLayer: StatusInventoryLayer = {
            entity_type: layer.entity_type,
            column: layer.column,
            active_definitions: defs.map((d) => ({
                status_key: d.status_key,
                status_label: d.status_label,
                is_active: d.is_active,
                usage_count: persistedCounts.get(d.status_key) ?? 0,
            })),
            distinct_persisted,
            orphan_persisted_keys,
            unused_definition_keys,
        };

        if (layer.entity_type === "persons") {
            Object.assign(
                inventoryLayer,
                analyzePersonDefinitions(
                    defs.map((d) => ({
                        status_key: d.status_key,
                        metadata: d.metadata,
                        is_active: d.is_active,
                    }))
                )
            );
        }

        layers.push(inventoryLayer);
    }

    const personsLayer = layers.find((l) => l.entity_type === "persons");

    return {
        org_id: orgId,
        generated_at: new Date().toISOString(),
        layers,
        summary: {
            total_orphan_persisted: layers.reduce((n, l) => n + l.orphan_persisted_keys.length, 0),
            total_unused_definitions: layers.reduce((n, l) => n + l.unused_definition_keys.length, 0),
            persons_missing_applicability_metadata:
                personsLayer?.missing_applicability_metadata?.length ?? 0,
            persons_hidden_from_person_drawer: personsLayer?.hidden_from_person_drawer?.length ?? 0,
            persons_hidden_from_child_drawer: personsLayer?.hidden_from_child_drawer?.length ?? 0,
        },
    };
}
