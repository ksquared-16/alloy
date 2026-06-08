/**
 * FK-safe cleanup for waitlist demo batch (`waitlist_demo_v1`).
 * Only deletes rows tagged with demo_batch_key / demo_seed_package for the org.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    WAITLIST_DEMO_BATCH_KEY,
    WAITLIST_DEMO_SEED_PACKAGE,
} from "@/lib/orchestration/placement/waitlistDemoMarkers";

export type WaitlistDemoCleanupCounts = Record<string, number>;

export type WaitlistDemoCleanupResult = {
    dry_run: boolean;
    org_id: string;
    demo_batch_key: string;
    counts: WaitlistDemoCleanupCounts;
    demo_opportunity_ids: string[];
    demo_customer_ids: string[];
};

function demoMetaOrFilter(): string {
    return `metadata->>demo_batch_key.eq.${WAITLIST_DEMO_BATCH_KEY},metadata->>demo_seed_package.eq.${WAITLIST_DEMO_SEED_PACKAGE}`;
}

async function selectDemoIds(
    supabase: SupabaseClient,
    orgId: string,
    table: "opportunities" | "customers" | "persons" | "locations"
): Promise<string[]> {
    const { data, error } = await supabase
        .from(table)
        .select("id")
        .eq("org_id", orgId)
        .or(demoMetaOrFilter());
    if (error) throw new Error(`[waitlist-demo cleanup select ${table}] ${error.message}`);
    return (data ?? []).map((r) => (r as { id: string }).id).filter(Boolean);
}

async function countDeleteByIds(
    supabase: SupabaseClient,
    table: string,
    idColumn: string,
    ids: string[],
    execute: boolean,
    extraEq?: Record<string, string>
): Promise<number> {
    if (ids.length === 0) return 0;
    if (execute) {
        let q = supabase.from(table).delete().in(idColumn, ids);
        for (const [k, v] of Object.entries(extraEq ?? {})) {
            q = q.eq(k, v);
        }
        const { data, error } = await q.select("id");
        if (error) throw new Error(`[waitlist-demo cleanup delete ${table}] ${error.message}`);
        return (data ?? []).length;
    }
    let q = supabase.from(table).select("id", { count: "exact", head: true }).in(idColumn, ids);
    for (const [k, v] of Object.entries(extraEq ?? {})) {
        q = q.eq(k, v);
    }
    const { count, error } = await q;
    if (error) throw new Error(`[waitlist-demo cleanup count ${table}] ${error.message}`);
    return count ?? 0;
}

async function countDeleteByFilter(
    supabase: SupabaseClient,
    table: string,
    orgId: string,
    execute: boolean
): Promise<number> {
    if (execute) {
        const { data, error } = await supabase
            .from(table)
            .delete()
            .eq("org_id", orgId)
            .or(demoMetaOrFilter())
            .select("id");
        if (error) throw new Error(`[waitlist-demo cleanup delete ${table}] ${error.message}`);
        return (data ?? []).length;
    }
    const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .or(demoMetaOrFilter());
    if (error) throw new Error(`[waitlist-demo cleanup count ${table}] ${error.message}`);
    return count ?? 0;
}

/**
 * Removes all rows owned by `waitlist_demo_v1` for the org.
 * When `execute` is false, returns counts only (dry run).
 */
export async function runWaitlistDemoCleanup(
    supabase: SupabaseClient,
    orgId: string,
    execute: boolean
): Promise<WaitlistDemoCleanupResult> {
    const counts: WaitlistDemoCleanupCounts = {};
    const demoOpportunityIds = await selectDemoIds(supabase, orgId, "opportunities");
    const demoCustomerIds = await selectDemoIds(supabase, orgId, "customers");

    let demoCandidateIds: string[] = [];
    if (demoOpportunityIds.length > 0) {
        const { data: candRows, error: candErr } = await supabase
            .from("placement_candidates")
            .select("id")
            .eq("org_id", orgId)
            .in("opportunity_id", demoOpportunityIds);
        if (candErr) throw new Error(candErr.message);
        demoCandidateIds = (candRows ?? []).map((r) => (r as { id: string }).id);
    }

    counts.placement_overrides = await countDeleteByIds(
        supabase,
        "placement_overrides",
        "placement_candidate_id",
        demoCandidateIds,
        execute,
        { org_id: orgId }
    );

    if (demoOpportunityIds.length > 0) {
        counts.placement_candidates = await countDeleteByIds(
            supabase,
            "placement_candidates",
            "opportunity_id",
            demoOpportunityIds,
            execute,
            { org_id: orgId }
        );
        if (execute) {
            const { data, error } = await supabase
                .from("activity_log")
                .delete()
                .eq("entity_type", "opportunities")
                .in("entity_id", demoOpportunityIds)
                .select("id");
            if (error) throw new Error(`[waitlist-demo cleanup delete activity_log] ${error.message}`);
            counts.activity_log = (data ?? []).length;
        } else {
            const { count, error } = await supabase
                .from("activity_log")
                .select("id", { count: "exact", head: true })
                .eq("entity_type", "opportunities")
                .in("entity_id", demoOpportunityIds);
            if (error) throw new Error(`[waitlist-demo cleanup count activity_log] ${error.message}`);
            counts.activity_log = count ?? 0;
        }
        counts.opportunity_customer_members = await countDeleteByIds(
            supabase,
            "opportunity_customer_members",
            "opportunity_id",
            demoOpportunityIds,
            execute,
            { org_id: orgId }
        );
    } else {
        counts.placement_candidates = 0;
        counts.activity_log = 0;
        counts.opportunity_customer_members = 0;
    }

    counts.opportunities = await countDeleteByFilter(supabase, "opportunities", orgId, execute);

    counts.customer_persons = await countDeleteByIds(
        supabase,
        "customer_persons",
        "customer_id",
        demoCustomerIds,
        execute,
        { org_id: orgId }
    );
    counts.customer_members = await countDeleteByIds(
        supabase,
        "customer_members",
        "customer_id",
        demoCustomerIds,
        execute,
        { org_id: orgId }
    );

    counts.customers = await countDeleteByFilter(supabase, "customers", orgId, execute);
    counts.persons = await countDeleteByFilter(supabase, "persons", orgId, execute);

    counts.locations_units = await countDelete(
        supabase,
        orgId,
        execute,
        "unit"
    );
    counts.locations_sites = await countDelete(
        supabase,
        orgId,
        execute,
        "site"
    );

    return {
        dry_run: !execute,
        org_id: orgId,
        demo_batch_key: WAITLIST_DEMO_BATCH_KEY,
        counts,
        demo_opportunity_ids: demoOpportunityIds,
        demo_customer_ids: demoCustomerIds,
    };
}

async function countDelete(
    supabase: SupabaseClient,
    orgId: string,
    execute: boolean,
    locationType: "unit" | "site"
): Promise<number> {
    if (execute) {
        const { data, error } = await supabase
            .from("locations")
            .delete()
            .eq("org_id", orgId)
            .eq("location_type", locationType)
            .or(demoMetaOrFilter())
            .select("id");
        if (error) throw new Error(`[waitlist-demo cleanup delete locations/${locationType}] ${error.message}`);
        return (data ?? []).length;
    }
    const { count, error } = await supabase
        .from("locations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("location_type", locationType)
        .or(demoMetaOrFilter());
    if (error) throw new Error(`[waitlist-demo cleanup count locations/${locationType}] ${error.message}`);
    return count ?? 0;
}
