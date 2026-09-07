/**
 * AUTHORING WHO IS RESPONSIBLE — and superseding it without rewriting what already happened.
 *
 * An arrangement is never edited. Recording a new one for a scope CLOSES the one it replaces on the
 * day before the successor starts and links the two, so the division that governed March is still
 * readable in June. The database refuses overlapping active windows outright
 * (`financial_responsibility_arrangements_no_overlap`), so this closes the predecessor first and
 * lets the constraint be the authority on whether the result is coherent.
 *
 * Every party named here is a canonical `persons` row IN THIS ORG, checked server-side. A party id
 * from another tenant is refused rather than stored — an arrangement is the one place in Financials
 * where a foreign id would quietly make a stranger responsible for a family's money.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ResponsibilityError } from "@/lib/financials/responsibility/responsibilityService";

export type ShareInput = {
    responsiblePartyId: string;
    method: "percentage" | "fixed" | "remainder";
    percentBasisPoints?: number | null;
    amountCents?: number | null;
    priority?: number | null;
};

export type ConfigureArrangementInput = {
    orgId: string;
    customerId: string;
    /** One child, or null for the whole account. */
    customerMemberId?: string | null;
    opportunityCustomerMemberId?: string | null;
    effectiveStart: string;
    effectiveEnd?: string | null;
    shares: ShareInput[];
    sourceKey?: string | null;
    sourceReference?: string | null;
    actorUserId: string | null;
};

function isDate(v: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** The day before `date`, for closing a predecessor cleanly against an open successor. */
function dayBefore(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

export async function configureResponsibilityArrangement(
    supabase: SupabaseClient,
    input: ConfigureArrangementInput,
): Promise<{ arrangementId: string; supersededId: string | null; shares: number }> {
    if (!isDate(input.effectiveStart)) {
        throw new ResponsibilityError("invalid_effective_start", "Name the date this arrangement starts.");
    }
    if (input.effectiveEnd && !isDate(input.effectiveEnd)) {
        throw new ResponsibilityError("invalid_effective_end", "The end date must be a real date.");
    }
    if (!Array.isArray(input.shares) || input.shares.length === 0) {
        throw new ResponsibilityError("no_shares", "An arrangement must name at least one responsible party.");
    }

    // ── CONFIGURATION IS VALIDATED BEFORE ANYONE IS MADE RESPONSIBLE ────────────────────────
    let remainderCount = 0;
    let percentTotal = 0;
    const seen = new Set<string>();
    for (const s of input.shares) {
        if (!s.responsiblePartyId) throw new ResponsibilityError("missing_party", "Every share must name a person.");
        if (seen.has(s.responsiblePartyId)) {
            throw new ResponsibilityError("duplicate_party", "A person may hold only one share in an arrangement.");
        }
        seen.add(s.responsiblePartyId);
        if (s.method === "percentage") {
            const bp = Number(s.percentBasisPoints);
            if (!Number.isInteger(bp) || bp < 0 || bp > 10_000) {
                throw new ResponsibilityError("invalid_percentage", "A percentage share is 0–10000 basis points.");
            }
            percentTotal += bp;
        } else if (s.method === "fixed") {
            const cents = Number(s.amountCents);
            if (!Number.isInteger(cents) || cents < 0) {
                throw new ResponsibilityError("invalid_amount", "A fixed share is a whole, non-negative number of cents.");
            }
        } else if (s.method === "remainder") {
            remainderCount += 1;
        } else {
            throw new ResponsibilityError("invalid_method", `Unknown share method: ${String(s.method)}.`);
        }
    }
    if (percentTotal > 10_000) {
        throw new ResponsibilityError("percentage_over_100", `The shares total ${percentTotal / 100}%.`);
    }
    if (remainderCount > 1) {
        throw new ResponsibilityError("multiple_remainders", "Only one party can take the remainder.");
    }

    /*
     * THE PARTIES ARE REAL, AND THEY ARE THIS ORG'S. Checked here rather than trusted from the
     * payload: a `persons` id from another tenant would otherwise become a stranger with a
     * contractual claim on this family's money, and the foreign key alone would not notice.
     */
    const partyIds = [...seen];
    const { data: personRows, error: personError } = await supabase
        .from("persons")
        .select("id")
        .eq("org_id", input.orgId)
        .in("id", partyIds);
    if (personError) throw new ResponsibilityError("db_error", personError.message);
    const known = new Set(((personRows ?? []) as Array<{ id: string }>).map((p) => p.id));
    const unknown = partyIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
        throw new ResponsibilityError(
            "unknown_party",
            `Not a person in this organisation: ${unknown.join(", ")}.`,
        );
    }

    // The account must be this org's too, for the same reason.
    const { data: customerRow, error: customerError } = await supabase
        .from("customers").select("id").eq("org_id", input.orgId).eq("id", input.customerId).maybeSingle();
    if (customerError) throw new ResponsibilityError("db_error", customerError.message);
    if (!customerRow) throw new ResponsibilityError("unknown_account", "No such account in this organisation.");

    // ── CLOSE THE PREDECESSOR, THEN OPEN THE SUCCESSOR ──────────────────────────────────────
    const { data: priorRows, error: priorError } = await supabase
        .from("financial_responsibility_arrangements")
        .select("id, effective_start, effective_end, customer_member_id")
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .eq("state", "active");
    if (priorError) throw new ResponsibilityError("db_error", priorError.message);
    /*
     * THE SAME SCOPE, compared in TypeScript rather than in a filter. PostgREST's `.is()` takes only
     * null/true/false, so "this child, or the whole account" cannot be expressed as one predicate —
     * and getting it wrong would supersede an account-wide arrangement when a child-specific one was
     * meant, silently moving every other child's money.
     */
    const prior = ((priorRows ?? []) as Array<{
        id: string;
        effective_start: string;
        effective_end: string | null;
        customer_member_id: string | null;
    }>)
        .filter((p) => (p.customer_member_id ?? null) === (input.customerMemberId ?? null))
        .filter((p) => !p.effective_end || p.effective_end >= input.effectiveStart)[0] ?? null;

    let supersededId: string | null = null;
    if (prior) {
        if (prior.effective_start >= input.effectiveStart) {
            // A successor must start after its predecessor; otherwise "which one governs March" has
            // two answers and the exclusion constraint would refuse the pair anyway.
            throw new ResponsibilityError(
                "predecessor_starts_later",
                "An arrangement already in force starts on or after this date. Supersede it from a later date.",
            );
        }
        const { error: closeError } = await supabase
            .from("financial_responsibility_arrangements")
            .update({ effective_end: dayBefore(input.effectiveStart), updated_by: input.actorUserId, updated_at: new Date().toISOString() })
            .eq("org_id", input.orgId)
            .eq("id", prior.id);
        if (closeError) throw new ResponsibilityError("db_error", closeError.message);
        supersededId = prior.id;
    }

    const { data: created, error: createError } = await supabase
        .from("financial_responsibility_arrangements")
        .insert({
            org_id: input.orgId,
            customer_id: input.customerId,
            customer_member_id: input.customerMemberId ?? null,
            opportunity_customer_member_id: input.opportunityCustomerMemberId ?? null,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            state: "active",
            source_key: input.sourceKey ?? null,
            source_reference: input.sourceReference ?? null,
            supersedes_id: supersededId,
            created_by: input.actorUserId,
            updated_by: input.actorUserId,
        })
        .select("id")
        .single();
    if (createError) {
        // The exclusion constraint speaks for itself: two active windows for one scope overlap.
        if ((createError as { code?: string }).code === "23P01") {
            throw new ResponsibilityError(
                "overlapping_arrangement",
                "Another arrangement is already in force for this scope over part of that window.",
            );
        }
        throw new ResponsibilityError("db_error", createError.message);
    }
    const arrangementId = (created as { id: string }).id;

    const { error: shareError } = await supabase.from("financial_responsibility_shares").insert(
        input.shares.map((s) => ({
            org_id: input.orgId,
            arrangement_id: arrangementId,
            responsible_party_type: "person",
            responsible_party_id: s.responsiblePartyId,
            method: s.method,
            percent_basis_points: s.method === "percentage" ? Number(s.percentBasisPoints) : null,
            amount_cents: s.method === "fixed" ? Number(s.amountCents) : null,
            priority: s.priority == null ? 100 : Number(s.priority),
            created_by: input.actorUserId,
        })),
    );
    if (shareError) throw new ResponsibilityError("db_error", shareError.message);

    if (supersededId) {
        await supabase
            .from("financial_responsibility_arrangements")
            .update({ superseded_by_id: arrangementId })
            .eq("org_id", input.orgId)
            .eq("id", supersededId);
    }

    return { arrangementId, supersededId, shares: input.shares.length };
}
