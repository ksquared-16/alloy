/**
 * Narrow discount redemption list FK pools for dept/site restricted admins (avoid full-org id scans).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    accessScopeRestrictsData,
    applyRecordScopeConstraintsToQuery,
    narrowJobIdsForScheduleList,
    resolveRecordScopeConstraints,
} from "@/lib/admin/accessScope";

export type DiscountRedemptionFkPools = {
    customerIds: string[];
    jobIds: string[];
    opportunityIds: string[];
    contactIds: string[];
};

/** `null` — caller uses unrestricted full-org FK scans (legacy path). */
export async function resolveDiscountRedemptionFkPoolsForRestrictedAdmin(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions
): Promise<DiscountRedemptionFkPools | null> {
    if (!accessScopeRestrictsData(dim)) return null;

    const BATCH = 500;
    const customers = new Set<string>();
    const contacts = new Set<string>();

    const jobIdsResult = await narrowJobIdsForScheduleList(supabase, orgId, dim, null);
    const jobIds =
        jobIdsResult === "none" ? [] : jobIdsResult === "all" ? ([] as string[]) : [...new Set(jobIdsResult)];

    for (let i = 0; i < jobIds.length; i += BATCH) {
        const slice = jobIds.slice(i, i + BATCH);
        const { data } = await supabase.from("jobs").select("customer_id").eq("org_id", orgId).in("id", slice).not("customer_id", "is", null);
        for (const r of data ?? []) {
            const cid = (r as { customer_id?: string | null }).customer_id;
            if (cid) customers.add(cid);
        }
    }

    let opportunityIds: string[] = [];
    const c = await resolveRecordScopeConstraints(supabase, orgId, dim);
    if (!c.impossible) {
        let oppQ = supabase.from("opportunities").select("id, customer_id, primary_contact_id").eq("org_id", orgId);
        oppQ = applyRecordScopeConstraintsToQuery(oppQ, c);
        const { data: opps, error } = await oppQ.limit(10000);
        if (!error) {
            const oppRows = (opps ?? []) as { id: string; customer_id?: string | null; primary_contact_id?: string | null }[];
            opportunityIds = [...new Set(oppRows.map((x) => x.id).filter(Boolean))];
            const primaryContactIds: string[] = [];
            for (const row of oppRows) {
                if (row.customer_id) customers.add(row.customer_id);
                if (row.primary_contact_id) primaryContactIds.push(row.primary_contact_id);
            }
            if (primaryContactIds.length) {
                const uniqContacts = [...new Set(primaryContactIds)];
                for (let i = 0; i < uniqContacts.length; i += BATCH) {
                    const slice = uniqContacts.slice(i, i + BATCH);
                    const { data: crow } = await supabase.from("contacts").select("id").eq("org_id", orgId).in("id", slice);
                    for (const r of crow ?? []) contacts.add((r as { id: string }).id);
                }
            }
        }
    }

    const custArr = [...customers];
    for (let i = 0; i < custArr.length; i += BATCH) {
        const slice = custArr.slice(i, i + BATCH);
        const { data } = await supabase.from("contacts").select("id").eq("org_id", orgId).in("customer_id", slice);
        for (const r of data ?? []) contacts.add((r as { id: string }).id);
    }

    return {
        customerIds: custArr,
        jobIds,
        opportunityIds,
        contactIds: [...contacts],
    };
}
