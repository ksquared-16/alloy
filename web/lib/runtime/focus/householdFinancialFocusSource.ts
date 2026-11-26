import "server-only";

/**
 * BP V2 Slice 6 — DOES THIS FINANCIAL SOURCE BELONG TO THIS HOUSEHOLD, NOW?
 *
 * A Billing Work View row carries the financial item that put the household in the view (a charge, or a
 * collection attempt the provider confirmed). Opening the household hands that item to the existing
 * Financials card as a focus request, and this is the authoritative check the card itself does not make:
 * the item must exist in the actor's org, belong to THIS household (its billable source is the household
 * account, or an enrollment agreement of this household), and the actor must hold `fin.read`.
 *
 * Lookups only — no amount, balance or state is computed. A source that fails any check is reported by
 * status and nothing about it is returned, so a stale or foreign id cannot disclose another household's
 * money. The record's own visibility (site scope) was already decided by the record route.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";

export type HouseholdFinancialFocusKind = "charge" | "collection_attempt";

export type HouseholdFinancialFocus =
    | { kind: HouseholdFinancialFocusKind; id: string; status: "forbidden" | "not_found" | "other_household" | "unsupported" }
    | { kind: "charge"; id: string; status: "ok"; label: string | null; chargeStatus: string | null }
    /** `recognized`: Financials has since turned the collection into a canonical payment. */
    | { kind: "collection_attempt"; id: string; status: "ok"; recognized: boolean; processorState: string | null };

const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");

async function householdOfSource(
    supabase: SupabaseClient,
    orgId: string,
    sourceType: string | null,
    sourceId: string | null,
): Promise<string | null> {
    if (sourceType === "customer") return t(sourceId) || null;
    if (sourceType !== "enrollment_agreement" || !sourceId) return null;
    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("id", sourceId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return t((data as { customer_id?: string | null } | null)?.customer_id) || null;
}

export async function resolveHouseholdFinancialFocus(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null; householdId: string; kind: string; id: string },
    deps: { assertRead?: typeof assertFinancialsReadAllowed } = {},
): Promise<HouseholdFinancialFocus | null> {
    const id = t(args.id);
    const kind = t(args.kind);
    if (!id || !kind) return null;
    if (kind !== "charge" && kind !== "collection_attempt") return { kind: kind as HouseholdFinancialFocusKind, id, status: "unsupported" };
    const read = await (deps.assertRead ?? assertFinancialsReadAllowed)({ supabase, orgId: args.orgId, userId: args.userId });
    if (!read.ok) return { kind, id, status: "forbidden" };

    if (kind === "charge") {
        const { data, error } = await supabase
            .from("charges")
            .select("id, billable_source_type, billable_source_id, status, description")
            .eq("org_id", args.orgId)
            .eq("id", id)
            .maybeSingle();
        if (error) throw new Error(error.message);
        const row = data as { billable_source_type: string | null; billable_source_id: string | null; status: string | null; description: string | null } | null;
        if (!row) return { kind, id, status: "not_found" };
        const owner = await householdOfSource(supabase, args.orgId, row.billable_source_type, row.billable_source_id);
        if (owner !== args.householdId) return { kind, id, status: "other_household" };
        return { kind, id, status: "ok", label: t(row.description) || null, chargeStatus: row.status };
    }

    const { data, error } = await supabase
        .from("payment_collection_attempts")
        .select("id, billable_source_type, billable_source_id, processor_state, canonical_payment_id")
        .eq("org_id", args.orgId)
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as { billable_source_type: string | null; billable_source_id: string | null; processor_state: string | null; canonical_payment_id: string | null } | null;
    if (!row) return { kind, id, status: "not_found" };
    const owner = await householdOfSource(supabase, args.orgId, row.billable_source_type, row.billable_source_id);
    if (owner !== args.householdId) return { kind, id, status: "other_household" };
    return { kind, id, status: "ok", recognized: Boolean(row.canonical_payment_id), processorState: row.processor_state };
}
