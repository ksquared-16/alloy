/**
 * Server-side ensure-OCM — the same "link a household child member to an opportunity"
 * logic the `POST /api/admin/opportunity-customer-members` route performs, callable
 * from other server code (e.g. the Scheduling propose path) without an HTTP round-trip.
 *
 * A lead-stage inquiry child may not have an opportunity_customer_member row yet; a
 * proposed schedule needs one to hold the desired schedule intent. This ensures it:
 * returns the existing OCM id when present, else creates the link (validating the
 * child belongs to the opportunity's customer account and is an active child), and
 * returns the id — mirroring the route so behavior stays identical.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type EnsureOcmResult =
    | { ok: true; ocmId: string; created: boolean }
    | { ok: false; error: string; status: number };

export async function ensureOpportunityCustomerMember(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    customerMemberId: string
): Promise<EnsureOcmResult> {
    if (!opportunityId || !customerMemberId) {
        return { ok: false, error: "opportunity_id and customer_member_id are required", status: 400 };
    }

    // Both records must exist in this org and share the same customer account.
    const { data: opp } = await supabase
        .from("opportunities")
        .select("customer_id")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    const { data: member } = await supabase
        .from("customer_members")
        .select("customer_id, relationship, is_active")
        .eq("id", customerMemberId)
        .eq("org_id", orgId)
        .maybeSingle();

    const oppCustomerId = (opp as { customer_id?: string | null } | null)?.customer_id ?? null;
    const memberCustomerId = (member as { customer_id?: string | null } | null)?.customer_id ?? null;
    if (!oppCustomerId || !memberCustomerId || oppCustomerId !== memberCustomerId) {
        return { ok: false, error: "Child member must belong to the opportunity customer account", status: 400 };
    }

    const rel = String((member as { relationship?: string | null })?.relationship ?? "")
        .trim()
        .toLowerCase();
    if (rel !== "child" || (member as { is_active?: boolean | null })?.is_active !== true) {
        return { ok: false, error: "Member must be an active child", status: 400 };
    }

    // Idempotent: return the existing link if one already exists.
    const { data: existing } = await supabase
        .from("opportunity_customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId)
        .eq("customer_member_id", customerMemberId)
        .maybeSingle();
    if (existing?.id) return { ok: true, ocmId: String(existing.id), created: false };

    const { data, error } = await supabase
        .from("opportunity_customer_members")
        .insert({
            org_id: orgId,
            opportunity_id: opportunityId,
            customer_member_id: customerMemberId,
        })
        .select("id")
        .single();
    if (error || !data?.id) {
        return { ok: false, error: error?.message ?? "Could not link child to the opportunity", status: 400 };
    }
    return { ok: true, ocmId: String(data.id), created: true };
}
