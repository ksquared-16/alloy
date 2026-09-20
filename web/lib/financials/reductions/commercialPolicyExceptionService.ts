import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * COMMERCIAL POLICY EXCEPTIONS — the one authority.
 *
 * "This otherwise-valid commercial policy is intentionally excluded for this specific commercial
 * relationship, for this effective window, by this operator, for this reason."
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────────────────────────
 *
 * Not a second discount engine. It answers exactly one question — which policies this commercial
 * relationship is excluded from on a date — and hands that answer to
 * `resolveFinancialReductions`, which is the only thing that decides whether a reduction applies.
 * The forecast and `applyFinancialReductions` both call that same resolver, so a forecast cannot
 * promise a discount the application path will withhold.
 *
 * Not a Boolean on an assignment. `discount_enabled = false` would say "no discounts here" about
 * every policy at once, for all time, with nobody's name on it, and would silently suppress any
 * policy authored later.
 *
 * Not a history editor. An exception governs eligibility over an effective window; a reduction
 * already posted stays posted. Ending one supersedes rather than deleting, so what was in force
 * at a past date remains answerable.
 *
 * ── THE RELATIONSHIP KEY ──────────────────────────────────────────────────────────────────────
 *
 * `opportunity_customer_member_id` — the same through-line `enrollment_pricing_terms` uses, so an
 * exception is scoped to exactly the thing an accepted price is scoped to.
 */

export type CommercialPolicyException = {
    id: string;
    policyId: string;
    opportunityCustomerMemberId: string;
    customerMemberId: string;
    effectiveStart: string;
    effectiveEnd: string | null;
    reason: string;
    createdBy: string | null;
    createdAt: string;
    supersedesExceptionId: string | null;
    supersededAt: string | null;
};

export type ExceptionRefusalCode =
    | "reason_required"
    | "relationship_required"
    | "policy_required"
    | "dates_out_of_order"
    | "assignment_not_found"
    | "policy_not_found"
    | "db_error";

export type ExceptionResult =
    | { ok: true; exception: CommercialPolicyException; superseded: string | null }
    | { ok: false; code: ExceptionRefusalCode; message: string };

/*
 * ── THE GENERATED TYPES DO NOT KNOW THIS TABLE YET ────────────────────────────────────────────
 *
 * Supabase types are generated from a database, and `20260924120000` has been applied to the
 * local certification stack only — the deployed schema follows staging lineage, so the table
 * cannot exist there until this candidate is promoted. Until the types are regenerated after that,
 * the client types every row from this table as `GenericStringError[]` and the reads below cast
 * through `unknown`.
 *
 * Recorded rather than hidden: this cast disappears the moment the types catch up, and it is the
 * one place in this file where the compiler is not checking the shape. `toException` is therefore
 * defensive about every field it reads.
 */
const TABLE = "commercial_policy_exceptions";

const COLUMNS =
    "id, policy_id, opportunity_customer_member_id, customer_member_id, effective_start, "
    + "effective_end, reason, created_by, created_at, supersedes_exception_id, superseded_at";

function toException(row: Record<string, unknown>): CommercialPolicyException {
    return {
        id: String(row.id),
        policyId: String(row.policy_id),
        opportunityCustomerMemberId: String(row.opportunity_customer_member_id),
        customerMemberId: String(row.customer_member_id),
        effectiveStart: String(row.effective_start),
        effectiveEnd: row.effective_end != null ? String(row.effective_end) : null,
        reason: String(row.reason ?? ""),
        createdBy: row.created_by != null ? String(row.created_by) : null,
        createdAt: String(row.created_at),
        supersedesExceptionId: row.supersedes_exception_id != null ? String(row.supersedes_exception_id) : null,
        supersededAt: row.superseded_at != null ? String(row.superseded_at) : null,
    };
}

/**
 * Is this exception in force on this date?
 *
 * Boundaries are INCLUSIVE, matching the table's own `effective_end >= effective_start` check and
 * the effective-dating discipline every other assignment-history table here uses. A superseded row
 * is never in force whatever its dates say: supersession is how history is kept, not how it is
 * ended twice.
 */
export function exceptionAppliesOn(exception: CommercialPolicyException, onDate: string): boolean {
    if (exception.supersededAt) return false;
    if (exception.effectiveStart > onDate) return false;
    if (exception.effectiveEnd && exception.effectiveEnd < onDate) return false;
    return true;
}

/**
 * The policies this commercial relationship is excluded from on a date.
 *
 * Returned as ids because that is what the resolver needs — it already holds the policies. Fails
 * closed: a read that could not run must not be reported as "no exceptions", which would silently
 * grant a discount somebody deliberately withheld.
 */
export async function readExcludedPolicyIds(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityCustomerMemberId: string; onDate: string },
): Promise<string[]> {
    const { data, error } = await supabase
        .from(TABLE)
        .select(COLUMNS)
        .eq("org_id", args.orgId)
        .eq("opportunity_customer_member_id", args.opportunityCustomerMemberId)
        .is("superseded_at", null);
    if (error) throw new Error(`commercial policy exceptions could not be read (${error.message.trim()})`);
    return ((data ?? []) as unknown as Array<Record<string, unknown>>)
        .map(toException)
        .filter((e) => exceptionAppliesOn(e, args.onDate))
        .map((e) => e.policyId);
}

/** Every exception on a relationship, newest first — live and superseded, because history is the point. */
export async function readExceptionHistory(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityCustomerMemberId: string },
): Promise<CommercialPolicyException[]> {
    const { data, error } = await supabase
        .from(TABLE)
        .select(COLUMNS)
        .eq("org_id", args.orgId)
        .eq("opportunity_customer_member_id", args.opportunityCustomerMemberId)
        .order("effective_start", { ascending: false });
    if (error) throw new Error(`commercial policy exceptions could not be read (${error.message.trim()})`);
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toException);
}

/**
 * Create an exception, superseding any live one for the same policy and relationship.
 *
 * ── INTEGRITY IS CHECKED HERE AND ENFORCED BENEATH ────────────────────────────────────────────
 *
 * The service refuses an incoherent ask early so an operator gets a sentence rather than a
 * constraint violation. The database's `enforce_commercial_policy_exception_org_parity` trigger is
 * the backstop that a second writer cannot skip — these are not duplicates of one rule, they are a
 * courtesy and a guarantee.
 */
export async function createPolicyException(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        policyId: string;
        opportunityCustomerMemberId: string;
        effectiveStart: string;
        effectiveEnd?: string | null;
        reason: string;
        actorUserId: string | null;
    },
): Promise<ExceptionResult> {
    const reason = (args.reason ?? "").trim();
    if (!reason) {
        return {
            ok: false,
            code: "reason_required",
            message: "An exception to commercial policy must say why. Give the reason it does not apply here.",
        };
    }
    if (!args.policyId?.trim()) return { ok: false, code: "policy_required", message: "Name the policy being excepted." };
    if (!args.opportunityCustomerMemberId?.trim()) {
        return { ok: false, code: "relationship_required", message: "Name the assignment this exception is for." };
    }
    const effectiveEnd = args.effectiveEnd?.trim() || null;
    if (effectiveEnd && effectiveEnd < args.effectiveStart) {
        return { ok: false, code: "dates_out_of_order", message: "The exception cannot end before it starts." };
    }

    /* The subject is the assignment's own child — read, never taken from the caller. */
    const { data: ocm, error: ocmError } = await supabase
        .from("opportunity_customer_members")
        .select("id, org_id, customer_member_id")
        .eq("org_id", args.orgId)
        .eq("id", args.opportunityCustomerMemberId)
        .maybeSingle();
    if (ocmError) return { ok: false, code: "db_error", message: ocmError.message };
    const assignment = ocm as { id: string; org_id: string; customer_member_id: string | null } | null;
    if (!assignment) {
        return { ok: false, code: "assignment_not_found", message: "That assignment is not in this organization." };
    }

    const { data: policy, error: policyError } = await supabase
        .from("commercial_policies")
        .select("id, org_id")
        .eq("org_id", args.orgId)
        .eq("id", args.policyId)
        .maybeSingle();
    if (policyError) return { ok: false, code: "db_error", message: policyError.message };
    if (!policy) return { ok: false, code: "policy_not_found", message: "That policy is not in this organization." };

    /* A live exception for the same policy and relationship is SUPERSEDED, never edited. */
    const { data: liveRows, error: liveError } = await supabase
        .from(TABLE)
        .select(COLUMNS)
        .eq("org_id", args.orgId)
        .eq("policy_id", args.policyId)
        .eq("opportunity_customer_member_id", args.opportunityCustomerMemberId)
        .is("superseded_at", null);
    if (liveError) return { ok: false, code: "db_error", message: liveError.message };
    const live = ((liveRows ?? []) as unknown as Array<Record<string, unknown>>).map(toException)[0] ?? null;

    const { data: inserted, error: insertError } = await supabase
        .from(TABLE)
        .insert({
            org_id: args.orgId,
            policy_id: args.policyId,
            opportunity_customer_member_id: args.opportunityCustomerMemberId,
            customer_member_id: assignment.customer_member_id,
            effective_start: args.effectiveStart,
            effective_end: effectiveEnd,
            reason,
            created_by: args.actorUserId,
            supersedes_exception_id: live?.id ?? null,
        })
        .select(COLUMNS)
        .single();
    if (insertError) return { ok: false, code: "db_error", message: insertError.message };

    if (live) {
        const { error: supersedeError } = await supabase
            .from(TABLE)
            .update({ superseded_at: new Date().toISOString() })
            .eq("org_id", args.orgId)
            .eq("id", live.id);
        if (supersedeError) return { ok: false, code: "db_error", message: supersedeError.message };
    }
    return { ok: true, exception: toException(inserted as unknown as Record<string, unknown>), superseded: live?.id ?? null };
}

/**
 * End a live exception, so the policy may apply again from the following day.
 *
 * `effective_end` is set rather than the row deleted, and `ended_at`/`ended_by` record who stopped
 * it. An exception that was in force in September must still be answerable in December.
 */
export async function endPolicyException(
    supabase: SupabaseClient,
    args: { orgId: string; exceptionId: string; effectiveEnd: string; actorUserId: string | null },
): Promise<ExceptionResult> {
    const { data, error } = await supabase
        .from(TABLE)
        .update({ effective_end: args.effectiveEnd, ended_at: new Date().toISOString(), ended_by: args.actorUserId })
        .eq("org_id", args.orgId)
        .eq("id", args.exceptionId)
        .is("superseded_at", null)
        .select(COLUMNS)
        .maybeSingle();
    if (error) return { ok: false, code: "db_error", message: error.message };
    if (!data) {
        return { ok: false, code: "assignment_not_found", message: "That exception is not live on this organization." };
    }
    return { ok: true, exception: toException(data as unknown as Record<string, unknown>), superseded: null };
}
