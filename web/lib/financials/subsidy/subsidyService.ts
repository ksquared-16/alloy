/**
 * SUBSIDY, END TO END — authorization, claim, remittance, variance.
 *
 * Every write here is bounded by two rules the approved decision made explicit. Nothing in this
 * file reduces what a family owes: Thread 8 is the only thing that moves outstanding, and agency
 * money reaches it as an ordinary payment with the agency recorded as the payer. And nothing here
 * resolves a shortfall by itself: when less arrives than was claimed, a variance is written in the
 * open and stays there until an operator names one of the resolutions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export class SubsidyError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

function isDate(v: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function dayBefore(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

// ── AGENCY + PROGRAM ─────────────────────────────────────────────────────────────────────────

export async function upsertFundingAgency(
    supabase: SupabaseClient,
    input: { orgId: string; agencyKey: string; name: string; jurisdiction?: string | null; externalReference?: string | null; actorUserId: string | null },
): Promise<{ agencyId: string }> {
    if (!input.agencyKey?.trim() || !input.name?.trim()) {
        throw new SubsidyError("invalid_input", "An agency needs a key and a name.");
    }
    const { data, error } = await supabase
        .from("financial_funding_agencies")
        .upsert(
            {
                org_id: input.orgId,
                agency_key: input.agencyKey.trim(),
                name: input.name.trim(),
                jurisdiction: input.jurisdiction ?? null,
                external_reference: input.externalReference ?? null,
                is_active: true,
                updated_by: input.actorUserId,
            },
            { onConflict: "org_id,agency_key" },
        )
        .select("id")
        .single();
    if (error) throw new SubsidyError("db_error", error.message);
    return { agencyId: (data as { id: string }).id };
}

export async function upsertSubsidyProgram(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        agencyId: string;
        programKey: string;
        name: string;
        fundingSourceType?: string | null;
        jurisdiction?: string | null;
        claimRules?: Record<string, unknown> | null;
        actorUserId: string | null;
    },
): Promise<{ programId: string }> {
    const { data: agency, error: agencyError } = await supabase
        .from("financial_funding_agencies").select("id").eq("org_id", input.orgId).eq("id", input.agencyId).maybeSingle();
    if (agencyError) throw new SubsidyError("db_error", agencyError.message);
    // The agency must be THIS org's — a foreign id would let another tenant's funder own a programme.
    if (!agency) throw new SubsidyError("unknown_agency", "No such funding agency in this organisation.");

    const { data, error } = await supabase
        .from("financial_subsidy_programs")
        .upsert(
            {
                org_id: input.orgId,
                agency_id: input.agencyId,
                program_key: input.programKey.trim(),
                name: input.name.trim(),
                funding_source_type: input.fundingSourceType ?? "government_subsidy",
                jurisdiction: input.jurisdiction ?? null,
                claim_rules: input.claimRules ?? {},
                is_active: true,
                updated_by: input.actorUserId,
            },
            { onConflict: "org_id,program_key" },
        )
        .select("id")
        .single();
    if (error) throw new SubsidyError("db_error", error.message);
    return { programId: (data as { id: string }).id };
}

// ── AUTHORIZATION ────────────────────────────────────────────────────────────────────────────

export type AuthorizationInput = {
    orgId: string;
    programId: string;
    customerId: string;
    customerMemberId: string;
    opportunityCustomerMemberId?: string | null;
    externalCaseId?: string | null;
    externalAuthorizationId?: string | null;
    coverageStart: string;
    coverageEnd?: string | null;
    authorizedUnits?: number | null;
    authorizedUnitKind?: string | null;
    authorizedAmountCents?: number | null;
    rateCents?: number | null;
    familyCopayCents?: number | null;
    sourceDocumentId?: string | null;
    sourceKey?: string | null;
    notes?: string | null;
    actorUserId: string | null;
};

/**
 * Record an authorization, superseding whatever governed the same child and programme before it.
 *
 * Like a Thread 6 arrangement, the predecessor is CLOSED the day before the successor starts and
 * linked, never edited — so what governed March is still readable in June, and the database's
 * exclusion constraint is the authority on whether the result is coherent.
 */
export async function recordSubsidyAuthorization(
    supabase: SupabaseClient,
    input: AuthorizationInput,
): Promise<{ authorizationId: string; supersededId: string | null }> {
    if (!isDate(input.coverageStart)) throw new SubsidyError("invalid_coverage_start", "Name the date coverage starts.");
    if (input.coverageEnd && !isDate(input.coverageEnd)) throw new SubsidyError("invalid_coverage_end", "The coverage end must be a real date.");
    for (const [field, value] of [
        ["authorizedAmountCents", input.authorizedAmountCents],
        ["rateCents", input.rateCents],
        ["familyCopayCents", input.familyCopayCents],
    ] as const) {
        if (value != null && (!Number.isInteger(value) || value < 0)) {
            throw new SubsidyError("invalid_amount", `${field} must be a whole, non-negative number of cents.`);
        }
    }

    // Programme, household and child must all belong to this org — checked, never trusted.
    const { data: program } = await supabase
        .from("financial_subsidy_programs").select("id").eq("org_id", input.orgId).eq("id", input.programId).maybeSingle();
    if (!program) throw new SubsidyError("unknown_program", "No such subsidy programme in this organisation.");
    const { data: member } = await supabase
        .from("customer_members").select("id, customer_id").eq("org_id", input.orgId).eq("id", input.customerMemberId).maybeSingle();
    if (!member) throw new SubsidyError("unknown_child", "No such child in this organisation.");

    const { data: priorRows, error: priorError } = await supabase
        .from("financial_subsidy_authorizations")
        .select("id, coverage_start, coverage_end")
        .eq("org_id", input.orgId)
        .eq("program_id", input.programId)
        .eq("customer_member_id", input.customerMemberId)
        .eq("state", "active");
    if (priorError) throw new SubsidyError("db_error", priorError.message);
    const prior = ((priorRows ?? []) as Array<{ id: string; coverage_start: string; coverage_end: string | null }>)
        .filter((p) => !p.coverage_end || p.coverage_end >= input.coverageStart)[0] ?? null;

    let supersededId: string | null = null;
    if (prior) {
        if (prior.coverage_start >= input.coverageStart) {
            throw new SubsidyError(
                "predecessor_starts_later",
                "An authorization already in force starts on or after this date. Supersede it from a later date.",
            );
        }
        const { error: closeError } = await supabase
            .from("financial_subsidy_authorizations")
            .update({ coverage_end: dayBefore(input.coverageStart), updated_by: input.actorUserId, updated_at: new Date().toISOString() })
            .eq("org_id", input.orgId)
            .eq("id", prior.id);
        if (closeError) throw new SubsidyError("db_error", closeError.message);
        supersededId = prior.id;
    }

    const { data, error } = await supabase
        .from("financial_subsidy_authorizations")
        .insert({
            org_id: input.orgId,
            program_id: input.programId,
            customer_id: input.customerId,
            customer_member_id: input.customerMemberId,
            opportunity_customer_member_id: input.opportunityCustomerMemberId ?? null,
            external_case_id: input.externalCaseId ?? null,
            external_authorization_id: input.externalAuthorizationId ?? null,
            coverage_start: input.coverageStart,
            coverage_end: input.coverageEnd ?? null,
            authorized_units: input.authorizedUnits ?? null,
            authorized_unit_kind: input.authorizedUnitKind ?? null,
            authorized_amount_cents: input.authorizedAmountCents ?? null,
            rate_cents: input.rateCents ?? null,
            family_copay_cents: input.familyCopayCents ?? null,
            state: "active",
            source_document_id: input.sourceDocumentId ?? null,
            source_key: input.sourceKey ?? null,
            notes: input.notes ?? null,
            supersedes_id: supersededId,
            created_by: input.actorUserId,
            updated_by: input.actorUserId,
        })
        .select("id")
        .single();
    if (error) {
        if ((error as { code?: string }).code === "23P01") {
            throw new SubsidyError(
                "overlapping_authorization",
                "Another authorization is already in force for this child and programme over part of that window.",
            );
        }
        throw new SubsidyError("db_error", error.message);
    }
    const authorizationId = (data as { id: string }).id;
    if (supersededId) {
        await supabase
            .from("financial_subsidy_authorizations")
            .update({ superseded_by_id: authorizationId, state: "superseded" })
            .eq("org_id", input.orgId)
            .eq("id", supersededId);
    }
    return { authorizationId, supersededId };
}

/** The authorization governing one child and programme on one date. */
export async function readAuthorizationInForce(
    supabase: SupabaseClient,
    args: { orgId: string; programId: string; customerMemberId: string; onDate: string },
) {
    const { data, error } = await supabase
        .from("financial_subsidy_authorizations")
        .select("id, coverage_start, coverage_end, authorized_amount_cents, rate_cents, family_copay_cents, program_id, customer_member_id")
        .eq("org_id", args.orgId)
        .eq("program_id", args.programId)
        .eq("customer_member_id", args.customerMemberId)
        .eq("state", "active");
    if (error) throw new SubsidyError("db_error", error.message);
    return ((data ?? []) as Array<{ id: string; coverage_start: string; coverage_end: string | null }>)
        .filter((a) => a.coverage_start <= args.onDate)
        .filter((a) => !a.coverage_end || a.coverage_end >= args.onDate)[0] ?? null;
}

// ── CLAIMS ───────────────────────────────────────────────────────────────────────────────────

/**
 * Build a period's claim from what is actually expected, and nothing else.
 *
 * A line exists only where there is a posted obligation AND expected funding attributable to it, so
 * the provider cannot claim for care nobody authorised. Idempotent by period and authorization:
 * re-running finds the claim it already built rather than asking the agency twice.
 */
export async function buildSubsidyClaim(
    supabase: SupabaseClient,
    args: { orgId: string; authorizationId: string; periodKey: string; actorUserId: string | null },
): Promise<{ claimId: string; lines: number; claimedCents: number; idempotent: boolean }> {
    if (!/^\d{4}-\d{2}$/.test(args.periodKey)) throw new SubsidyError("invalid_period", "period_key must be YYYY-MM");
    const idempotencyKey = `fsc:${args.authorizationId}:${args.periodKey}`;

    const { data: existing, error: existingError } = await supabase
        .from("financial_subsidy_claims").select("id").eq("org_id", args.orgId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existingError) throw new SubsidyError("db_error", existingError.message);
    if (existing) {
        const claimId = (existing as { id: string }).id;
        const { data: lines } = await supabase
            .from("financial_subsidy_claim_lines").select("claimed_amount_cents").eq("org_id", args.orgId).eq("claim_id", claimId);
        const rows = (lines ?? []) as Array<{ claimed_amount_cents: number }>;
        return {
            claimId,
            lines: rows.length,
            claimedCents: rows.reduce((a, r) => a + Number(r.claimed_amount_cents), 0),
            idempotent: true,
        };
    }

    const { data: authorizationRow, error: authorizationError } = await supabase
        .from("financial_subsidy_authorizations")
        .select("id, program_id, customer_member_id, coverage_start, coverage_end, state")
        .eq("org_id", args.orgId)
        .eq("id", args.authorizationId)
        .maybeSingle();
    if (authorizationError) throw new SubsidyError("db_error", authorizationError.message);
    if (!authorizationRow) throw new SubsidyError("unknown_authorization", "No such authorization in this organisation.");
    const authorization = authorizationRow as {
        id: string; program_id: string; customer_member_id: string; coverage_start: string; coverage_end: string | null;
    };

    const periodStart = `${args.periodKey}-01`;
    const [year, month] = args.periodKey.split("-").map(Number) as [number, number];
    const periodEnd = `${args.periodKey}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
    if (authorization.coverage_start > periodEnd || (authorization.coverage_end && authorization.coverage_end < periodStart)) {
        throw new SubsidyError("period_not_covered", "The authorization does not cover that service period.");
    }

    const { data: programRow } = await supabase
        .from("financial_subsidy_programs").select("id, agency_id").eq("org_id", args.orgId).eq("id", authorization.program_id).maybeSingle();
    const program = programRow as { id: string; agency_id: string };

    /*
     * THE OBLIGATIONS TO CLAIM AGAINST. Posted charges for this child in this period that carry a
     * responsibility allocation with expected funding attached. Each condition removes a way of
     * claiming for something that is not really owed, not really this child's, or not really funded.
     */
    const { data: agreementRows } = await supabase
        .from("child_enrollment_agreements").select("id").eq("org_id", args.orgId).eq("customer_member_id", authorization.customer_member_id);
    const agreementIds = ((agreementRows ?? []) as Array<{ id: string }>).map((a) => a.id);
    if (agreementIds.length === 0) throw new SubsidyError("no_enrolment", "That child has no enrolment to claim against.");

    const { data: chargeRows } = await supabase
        .from("charges")
        .select("id, amount_cents, status, service_date, currency_code")
        .eq("org_id", args.orgId)
        .eq("charge_category", "tuition")
        .eq("status", "posted")
        .in("billable_source_id", agreementIds)
        .gte("service_date", periodStart)
        .lte("service_date", periodEnd);
    const charges = (chargeRows ?? []) as Array<{ id: string; service_date: string }>;
    if (charges.length === 0) throw new SubsidyError("nothing_to_claim", "No posted obligation for that child in that period.");

    const { data: allocationRows } = await supabase
        .from("financial_responsibility_allocations")
        .select("id, charge_id, assigned_amount_cents, is_unassigned")
        .eq("org_id", args.orgId)
        .eq("state", "active")
        .in("charge_id", charges.map((c) => c.id));
    const allocations = (allocationRows ?? []) as Array<{ id: string; charge_id: string; is_unassigned: boolean }>;

    const { data: fundingRows } = allocations.length
        ? await supabase
              .from("financial_expected_funding")
              .select("id, allocation_id, expected_amount_cents, percent_basis_points, basis, subsidy_authorization_id, state")
              .eq("org_id", args.orgId)
              .eq("state", "active")
              .in("allocation_id", allocations.map((a) => a.id))
        : { data: [] };
    const funding = ((fundingRows ?? []) as Array<Record<string, unknown>>)
        .filter((f) => !f.subsidy_authorization_id || f.subsidy_authorization_id === authorization.id);

    const now = new Date().toISOString();
    const { data: created, error: createError } = await supabase
        .from("financial_subsidy_claims")
        .insert({
            org_id: args.orgId,
            program_id: program.id,
            agency_id: program.agency_id,
            authorization_id: authorization.id,
            period_key: args.periodKey,
            service_period_start: periodStart,
            service_period_end: periodEnd,
            state: "draft",
            idempotency_key: idempotencyKey,
            created_by: args.actorUserId,
            updated_by: args.actorUserId,
        })
        .select("id")
        .single();
    if (createError) {
        if ((createError as { code?: string }).code === "23505") {
            return buildSubsidyClaim(supabase, args); // the other writer built it; read theirs
        }
        throw new SubsidyError("db_error", createError.message);
    }
    const claimId = (created as { id: string }).id;

    const lineRows: Array<Record<string, unknown>> = [];
    for (const allocation of allocations) {
        if (allocation.is_unassigned) continue; // nobody is responsible, so nothing is funded
        const attached = funding.filter((f) => f.allocation_id === allocation.id);
        if (attached.length === 0) continue;
        const charge = charges.find((c) => c.id === allocation.charge_id)!;
        const amount = attached.reduce((acc, f) => acc + Number(f.expected_amount_cents ?? 0), 0);
        if (amount <= 0) continue;
        lineRows.push({
            org_id: args.orgId,
            claim_id: claimId,
            charge_id: allocation.charge_id,
            responsibility_allocation_id: allocation.id,
            expected_funding_id: attached[0]!.id,
            customer_member_id: authorization.customer_member_id,
            service_period_start: periodStart,
            service_period_end: periodEnd,
            claimed_amount_cents: amount,
            idempotency_key: `fscl:${claimId}:${allocation.id}`,
            created_by: args.actorUserId,
        });
    }
    if (lineRows.length === 0) {
        await supabase.from("financial_subsidy_claims").delete().eq("org_id", args.orgId).eq("id", claimId);
        throw new SubsidyError("nothing_expected", "No expected subsidy is attached to that period's obligations.");
    }
    const { error: lineError } = await supabase.from("financial_subsidy_claim_lines").insert(lineRows);
    if (lineError) throw new SubsidyError("db_error", lineError.message);

    return {
        claimId,
        lines: lineRows.length,
        claimedCents: lineRows.reduce((a, r) => a + Number(r.claimed_amount_cents), 0),
        idempotent: false,
    };
}

/** Submitting is the event the collection policy turns on. Idempotent; a submitted claim stays submitted. */
export async function submitSubsidyClaim(
    supabase: SupabaseClient,
    args: { orgId: string; claimId: string; externalReference?: string | null; actorUserId: string | null },
): Promise<{ claimId: string; state: string; alreadySubmitted: boolean }> {
    const { data: row, error } = await supabase
        .from("financial_subsidy_claims").select("id, state").eq("org_id", args.orgId).eq("id", args.claimId).maybeSingle();
    if (error) throw new SubsidyError("db_error", error.message);
    if (!row) throw new SubsidyError("unknown_claim", "No such claim in this organisation.");
    const claim = row as { id: string; state: string };
    if (claim.state !== "draft") return { claimId: claim.id, state: claim.state, alreadySubmitted: true };

    const { error: updateError } = await supabase
        .from("financial_subsidy_claims")
        .update({
            state: "submitted",
            submitted_at: new Date().toISOString(),
            external_reference: args.externalReference ?? null,
            updated_by: args.actorUserId,
            updated_at: new Date().toISOString(),
        })
        .eq("org_id", args.orgId)
        .eq("id", args.claimId)
        .eq("state", "draft"); // only a draft submits; a concurrent submit loses harmlessly
    if (updateError) throw new SubsidyError("db_error", updateError.message);
    return { claimId: claim.id, state: "submitted", alreadySubmitted: false };
}
