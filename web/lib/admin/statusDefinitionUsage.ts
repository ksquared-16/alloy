/**
 * Targeted existence checks — whether a status_key is referenced on live entity rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    OPERATOR_STATUS_CATEGORY_REGISTRY,
    type StatusCategoryRegistryEntry,
} from "@/lib/admin/statusCategoryRegistry";
import { logDbTiming } from "@/lib/admin/dbQueryTiming";

export type StatusDefinitionUsageHit = {
    table: string;
    column: string;
};

function registryEntryForEntityType(entityType: string): StatusCategoryRegistryEntry | null {
    const normalized = entityType.trim().toLowerCase();
    return (
        OPERATOR_STATUS_CATEGORY_REGISTRY.find(
            (e) => e.entity_type.toLowerCase() === normalized,
        ) ?? null
    );
}

/** Indexed existence check (limit 1) for the authoritative table/column when known. */
export async function checkStatusDefinitionRecordUsage(params: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: string;
    statusKey: string;
}): Promise<StatusDefinitionUsageHit | null> {
    const t0 = Date.now();
    const statusKey = params.statusKey.trim();
    if (!statusKey) return null;

    const entry = registryEntryForEntityType(params.entityType);
    if (!entry) {
        logDbTiming("status_definitions.usage_check_skipped", Date.now() - t0, {
            orgId: params.orgId,
            entityType: params.entityType,
            reason: "no_registry_entry",
        });
        return null;
    }

    const { table, column } = entry.authoritative;
    const { data, error } = await params.supabase
        .from(table)
        .select("id")
        .eq("org_id", params.orgId)
        .eq(column, statusKey)
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    logDbTiming("status_definitions.usage_check", Date.now() - t0, {
        orgId: params.orgId,
        entityType: params.entityType,
        statusKey,
        table,
        inUse: Boolean(data),
    });

    return data ? { table, column } : null;
}

/** Transition rules referencing this status key (org-scoped). */
export async function checkStatusDefinitionTransitionRuleUsage(params: {
    supabase: SupabaseClient;
    orgId: string;
    statusKey: string;
}): Promise<boolean> {
    const t0 = Date.now();
    const statusKey = params.statusKey.trim();
    if (!statusKey) return false;

    const { data, error } = await params.supabase
        .from("status_transition_rules")
        .select("id")
        .eq("org_id", params.orgId)
        .eq("is_active", true)
        .or(`from_status_key.eq.${statusKey},to_status_key.eq.${statusKey}`)
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    logDbTiming("status_definitions.transition_rule_usage_check", Date.now() - t0, {
        orgId: params.orgId,
        statusKey,
        inUse: Boolean(data),
    });

    return Boolean(data);
}

export async function isStatusDefinitionInUse(params: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: string;
    statusKey: string;
}): Promise<{ inUse: boolean; hits: StatusDefinitionUsageHit[] }> {
    const hits: StatusDefinitionUsageHit[] = [];
    const recordHit = await checkStatusDefinitionRecordUsage(params);
    if (recordHit) hits.push(recordHit);
    const ruleHit = await checkStatusDefinitionTransitionRuleUsage({
        supabase: params.supabase,
        orgId: params.orgId,
        statusKey: params.statusKey,
    });
    if (ruleHit) {
        hits.push({ table: "status_transition_rules", column: "from_status_key|to_status_key" });
    }
    return { inUse: hits.length > 0, hits };
}
