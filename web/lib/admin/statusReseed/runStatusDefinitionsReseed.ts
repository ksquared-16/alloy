import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitionsDirect } from "@/lib/admin/statusDefinitionsResolve";
import { runStatusDefinitionsInventory } from "@/lib/admin/statusDefinitionsInventory";
import {
    OPPORTUNITY_LEGACY_STATUS_BACKFILL_TO_OPEN,
    PERSON_LEGACY_STATUS_BACKFILL_TO_PRE_ENROLLED,
    STATUS_RESEED_OCM_ENROLLMENT_LEGACY_KEYS,
    STATUS_RESEED_OCM_ENROLLMENT_STATUSES,
    STATUS_RESEED_OPPORTUNITY_CASE_STATUSES,
    STATUS_RESEED_OPPORTUNITY_LEGACY_KEYS,
    STATUS_RESEED_PERSON_LEGACY_KEYS,
    STATUS_RESEED_PERSON_MVP_STATUSES,
    type StatusReseedRow,
} from "@/lib/admin/statusReseed/statusMvpCatalog";
import { DEFAULT_LEAD_CASE_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { PERSON_LEGACY_STATUS_BACKFILL_MAP } from "@/lib/admin/statusReseed/statusMvpCatalog";

export type StatusReseedOptions = {
    orgId: string;
    execute: boolean;
    backfill: boolean;
    deactivateLegacy: boolean;
};

export type StatusReseedLayerResult = {
    entity_type: string;
    upserted: number;
    deactivated: number;
    inserted: number;
    updated: number;
};

export type StatusReseedResult = {
    org_id: string;
    dry_run: boolean;
    layers: StatusReseedLayerResult[];
    backfill: {
        opportunities: number;
        persons: number;
    } | null;
    inventory_before: Awaited<ReturnType<typeof runStatusDefinitionsInventory>> | null;
    inventory_after: Awaited<ReturnType<typeof runStatusDefinitionsInventory>> | null;
};

type OrgStatusRow = {
    id: string;
    org_id: string | null;
    entity_type: string;
    status_key: string;
    status_label: string | null;
    sort_order: number;
    is_active: boolean;
    metadata: Record<string, unknown> | null;
};

async function loadOrgStatusRows(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string
): Promise<OrgStatusRow[]> {
    const { data, error } = await supabase
        .from("status_definitions")
        .select("id, org_id, entity_type, status_key, status_label, sort_order, is_active, metadata")
        .eq("org_id", orgId)
        .eq("entity_type", entityType);
    if (error) throw new Error(`load org status rows (${entityType}): ${error.message}`);
    return (data ?? []) as OrgStatusRow[];
}

async function upsertApprovedStatuses(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    approved: StatusReseedRow[],
    execute: boolean
): Promise<Pick<StatusReseedLayerResult, "upserted" | "inserted" | "updated">> {
    const existing = await loadOrgStatusRows(supabase, orgId, entityType);
    const byKey = new Map(existing.map((r) => [r.status_key, r]));
    let inserted = 0;
    let updated = 0;

    for (const row of approved) {
        const current = byKey.get(row.status_key);
        const payload = {
            status_label: row.status_label,
            sort_order: row.sort_order,
            is_active: true,
            metadata: row.metadata ?? { seed_source: "status_mvp_reseed_v1" },
        };

        if (!current) {
            inserted++;
            if (execute) {
                const { error } = await supabase.from("status_definitions").insert({
                    org_id: orgId,
                    entity_type: entityType,
                    status_key: row.status_key,
                    is_system: false,
                    industry_key: null,
                    ...payload,
                });
                if (error) throw new Error(`insert ${entityType}/${row.status_key}: ${error.message}`);
            }
            continue;
        }

        updated++;
        if (execute) {
            const { error } = await supabase
                .from("status_definitions")
                .update(payload)
                .eq("id", current.id)
                .eq("org_id", orgId);
            if (error) throw new Error(`update ${entityType}/${row.status_key}: ${error.message}`);
        }
    }

    return { upserted: approved.length, inserted, updated };
}

async function deactivateLegacyKeys(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    legacyKeys: readonly string[],
    execute: boolean
): Promise<number> {
    if (legacyKeys.length === 0) return 0;

    const existing = await loadOrgStatusRows(supabase, orgId, entityType);
    const existingKeys = new Set(existing.map((r) => r.status_key));
    let deactivated = 0;

    for (const key of legacyKeys) {
        const row = existing.find((r) => r.status_key === key);
        if (row) {
            if (row.is_active) deactivated++;
            if (execute && row.is_active) {
                const { error } = await supabase
                    .from("status_definitions")
                    .update({ is_active: false })
                    .eq("id", row.id)
                    .eq("org_id", orgId);
                if (error) throw new Error(`deactivate ${entityType}/${key}: ${error.message}`);
            }
            continue;
        }

        deactivated++;
        if (execute) {
            const { error } = await supabase.from("status_definitions").insert({
                org_id: orgId,
                entity_type: entityType,
                status_key: key,
                status_label: key,
                sort_order: 9999,
                is_active: false,
                is_system: false,
                industry_key: null,
                metadata: {
                    seed_source: "status_mvp_reseed_v1",
                    deactivated_by: "runStatusDefinitionsReseed",
                },
            });
            if (error) throw new Error(`insert inactive override ${entityType}/${key}: ${error.message}`);
        }
    }

    // Also deactivate effective-only industry defaults not in org rows
    const effective = await fetchEffectiveStatusDefinitionsDirect(supabase, orgId, entityType, {
        activeOnly: false,
    });
    for (const def of effective) {
        if (!legacyKeys.includes(def.status_key as (typeof legacyKeys)[number])) continue;
        if (existingKeys.has(def.status_key)) continue;
        deactivated++;
        if (execute) {
            const { error } = await supabase.from("status_definitions").insert({
                org_id: orgId,
                entity_type: entityType,
                status_key: def.status_key,
                status_label: def.status_label ?? def.status_key,
                sort_order: def.sort_order ?? 9999,
                is_active: false,
                is_system: false,
                industry_key: null,
                metadata: {
                    seed_source: "status_mvp_reseed_v1",
                    deactivated_by: "runStatusDefinitionsReseed",
                },
            });
            if (error && error.code !== "23505") {
                throw new Error(`insert inactive effective override ${entityType}/${def.status_key}: ${error.message}`);
            }
        }
    }

    return deactivated;
}

async function backfillOpportunityStatuses(
    supabase: SupabaseClient,
    orgId: string,
    execute: boolean
): Promise<number> {
    const keys = [...OPPORTUNITY_LEGACY_STATUS_BACKFILL_TO_OPEN];
    if (!execute) {
        const { count } = await supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .in("status_key", keys);
        return count ?? 0;
    }

    const { data, error } = await supabase
        .from("opportunities")
        .update({ status_key: DEFAULT_LEAD_CASE_STATUS_KEY })
        .eq("org_id", orgId)
        .in("status_key", keys)
        .select("id");
    if (error) throw new Error(`backfill opportunities: ${error.message}`);
    return data?.length ?? 0;
}

async function backfillPersonStatuses(
    supabase: SupabaseClient,
    orgId: string,
    execute: boolean
): Promise<number> {
    let total = 0;
    for (const [fromKey, toKey] of Object.entries(PERSON_LEGACY_STATUS_BACKFILL_MAP)) {
        if (!execute) {
            const { count } = await supabase
                .from("persons")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId)
                .eq("status_key", fromKey);
            total += count ?? 0;
            continue;
        }
        const { data, error } = await supabase
            .from("persons")
            .update({ status_key: toKey })
            .eq("org_id", orgId)
            .eq("status_key", fromKey)
            .select("id");
        if (error) throw new Error(`backfill persons ${fromKey}→${toKey}: ${error.message}`);
        total += data?.length ?? 0;
    }
    return total;
}

export async function runStatusDefinitionsReseed(
    supabase: SupabaseClient,
    options: StatusReseedOptions
): Promise<StatusReseedResult> {
    const { orgId, execute, backfill, deactivateLegacy } = options;

    const inventory_before = await runStatusDefinitionsInventory(supabase, orgId);

    const layers: StatusReseedLayerResult[] = [];

    const oppUpsert = await upsertApprovedStatuses(
        supabase,
        orgId,
        "opportunities",
        STATUS_RESEED_OPPORTUNITY_CASE_STATUSES,
        execute
    );
    const oppDeactivate =
        deactivateLegacy ?
            await deactivateLegacyKeys(
                supabase,
                orgId,
                "opportunities",
                STATUS_RESEED_OPPORTUNITY_LEGACY_KEYS,
                execute
            )
        :   0;
    layers.push({
        entity_type: "opportunities",
        ...oppUpsert,
        deactivated: oppDeactivate,
    });

    const personUpsert = await upsertApprovedStatuses(
        supabase,
        orgId,
        "persons",
        STATUS_RESEED_PERSON_MVP_STATUSES,
        execute
    );
    const personDeactivate =
        deactivateLegacy ?
            await deactivateLegacyKeys(
                supabase,
                orgId,
                "persons",
                STATUS_RESEED_PERSON_LEGACY_KEYS,
                execute
            )
        :   0;
    layers.push({
        entity_type: "persons",
        ...personUpsert,
        deactivated: personDeactivate,
    });

    const ocmUpsert = await upsertApprovedStatuses(
        supabase,
        orgId,
        "opportunity_customer_members",
        STATUS_RESEED_OCM_ENROLLMENT_STATUSES,
        execute
    );
    const ocmDeactivate =
        deactivateLegacy ?
            await deactivateLegacyKeys(
                supabase,
                orgId,
                "opportunity_customer_members",
                STATUS_RESEED_OCM_ENROLLMENT_LEGACY_KEYS,
                execute
            )
        :   0;
    layers.push({
        entity_type: "opportunity_customer_members",
        ...ocmUpsert,
        deactivated: ocmDeactivate,
    });

    let backfillResult: StatusReseedResult["backfill"] = null;
    if (backfill) {
        backfillResult = {
            opportunities: await backfillOpportunityStatuses(supabase, orgId, execute),
            persons: await backfillPersonStatuses(supabase, orgId, execute),
        };
    }

    const inventory_after =
        execute ? await runStatusDefinitionsInventory(supabase, orgId) : inventory_before;

    return {
        org_id: orgId,
        dry_run: !execute,
        layers,
        backfill: backfillResult,
        inventory_before,
        inventory_after,
    };
}

export async function summarizeEffectiveStatusKeys(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string
): Promise<string[]> {
    const rows = await fetchEffectiveStatusDefinitionsDirect(supabase, orgId, entityType, {
        activeOnly: true,
    });
    return rows.map((r) => r.status_key).sort();
}
