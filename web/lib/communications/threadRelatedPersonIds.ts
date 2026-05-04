/**
 * Card 26 — Person ids tied to opportunities / jobs / customers for canonical thread union queries.
 * Person-first only (no contacts). Used by threads API and SMS drawer eligibility.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";

export type AdminSupabase = ReturnType<typeof createAdminClient>;

/** Deduplicated person UUIDs scoped to org + entity; bounded by slice at call site when querying PostgREST. */
export async function fetchRelatedPersonIdsForCommunicationsDrawer(
    supabase: AdminSupabase,
    orgId: string,
    entityType: string,
    entityId: string
): Promise<string[]> {
    const pidSet = new Set<string>();

    if (entityType === "opportunities") {
        const { data: opp } = await supabase
            .from("opportunities")
            .select("primary_person_id")
            .eq("id", entityId)
            .eq("org_id", orgId)
            .maybeSingle();
        const primaryPid =
            opp && typeof (opp as { primary_person_id?: string }).primary_person_id === "string"
                ? String((opp as { primary_person_id: string }).primary_person_id).trim()
                : null;
        if (primaryPid) pidSet.add(primaryPid);

        const { data: opRows } = await supabase
            .from("opportunity_persons")
            .select("person_id")
            .eq("org_id", orgId)
            .eq("opportunity_id", entityId);
        for (const r of (opRows ?? []) as { person_id?: string | null }[]) {
            const pid = r.person_id != null ? String(r.person_id).trim() : "";
            if (pid) pidSet.add(pid);
        }
        return [...pidSet];
    }

    if (entityType === "jobs") {
        const { data: job } = await supabase
            .from("jobs")
            .select("primary_person_id, customer_id, opportunity_id")
            .eq("id", entityId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!job) return [];

        const primaryPidRaw = (job as { primary_person_id?: string | null }).primary_person_id;
        const customerId = (job as { customer_id?: string | null }).customer_id;
        const oppId = (job as { opportunity_id?: string | null }).opportunity_id;
        const primaryPid = typeof primaryPidRaw === "string" && primaryPidRaw.trim() ? primaryPidRaw.trim() : null;

        if (customerId) {
            const { data: cpRows } = await supabase
                .from("customer_persons")
                .select("person_id")
                .eq("org_id", orgId)
                .eq("customer_id", customerId);
            for (const r of (cpRows ?? []) as { person_id?: string | null }[]) {
                const pid = r.person_id != null ? String(r.person_id).trim() : "";
                if (pid) pidSet.add(pid);
            }
        }
        if (oppId) {
            const { data: oppRows } = await supabase
                .from("opportunity_persons")
                .select("person_id")
                .eq("org_id", orgId)
                .eq("opportunity_id", oppId);
            for (const r of (oppRows ?? []) as { person_id?: string | null }[]) {
                const pid = r.person_id != null ? String(r.person_id).trim() : "";
                if (pid) pidSet.add(pid);
            }
        }
        if (primaryPid) pidSet.add(primaryPid);
        return [...pidSet];
    }

    if (entityType === "customers") {
        const { data: cpRows } = await supabase
            .from("customer_persons")
            .select("person_id")
            .eq("org_id", orgId)
            .eq("customer_id", entityId);
        for (const r of (cpRows ?? []) as { person_id?: string | null }[]) {
            const pid = r.person_id != null ? String(r.person_id).trim() : "";
            if (pid) pidSet.add(pid);
        }
        return [...pidSet];
    }

    return [];
}
