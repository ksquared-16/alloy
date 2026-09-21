import type { SupabaseClient } from "@supabase/supabase-js";

import {
    rateUnitForBasis,
    resolveCurrentTerm,
    resolveFutureTerms,
    resolveHistoricalTerms,
    toCompensationTerm,
    type CompensationTerm,
    type CompensationTermRow,
    type PayBasis,
} from "@/lib/employmentCompensation/employmentCompensationModel";

/**
 * Compensation terms for one employment.
 *
 * READS THROUGH THE SERVICE ROLE, DELIBERATELY. The table revokes every grant from
 * `authenticated`, so no browser principal reaches these rows by any path; the
 * application answers for the caller instead, after its own capability check. That
 * is why the route gate is not a convenience — it is the only operator boundary,
 * and the database boundary behind it is absolute rather than role-shaped.
 *
 * A RAISE SUPERSEDES. Recording a new term closes the open one on the day before
 * the new one starts and points the new row at it. Nothing is updated in place
 * except that close, so "what were they earning in March" stays answerable.
 */
export class EmploymentCompensationError extends Error {
    constructor(
        readonly code: "invalid_input" | "not_found" | "conflict" | "db_error",
        message: string,
    ) {
        super(message);
        this.name = "EmploymentCompensationError";
    }
}

export type CompensationComposition = {
    employment: { id: string };
    asOf: string;
    current: CompensationTerm | null;
    future: CompensationTerm[];
    history: CompensationTerm[];
};

const COLUMNS =
    "id, employment_id, pay_basis, rate_amount, rate_unit, rate_currency, effective_start, effective_end, supersedes_id, is_active, note";

async function assertEmploymentInOrg(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string,
): Promise<void> {
    // Asked FIRST, as every staff service does: a foreign employment must answer
    // not_found rather than an empty term list, which would read as "unpaid".
    const { data, error } = await supabase
        .from("employments")
        .select("id")
        .eq("id", employmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new EmploymentCompensationError("db_error", error.message);
    if (!data) {
        throw new EmploymentCompensationError("not_found", "That employment does not belong to this organization.");
    }
}

export async function composeEmploymentCompensation(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string,
    asOf: string,
): Promise<CompensationComposition> {
    if (!orgId || !employmentId || !asOf) {
        throw new EmploymentCompensationError("invalid_input", "Organization, employment and date are required.");
    }
    await assertEmploymentInOrg(supabase, orgId, employmentId);

    const { data, error } = await supabase
        .from("employment_compensation_terms")
        .select(COLUMNS)
        .eq("org_id", orgId)
        .eq("employment_id", employmentId)
        .order("effective_start", { ascending: false });
    if (error) throw new EmploymentCompensationError("db_error", error.message);

    const terms = ((data ?? []) as unknown as CompensationTermRow[]).map(toCompensationTerm);
    return {
        employment: { id: employmentId },
        asOf,
        current: resolveCurrentTerm(terms, asOf),
        future: resolveFutureTerms(terms, asOf),
        history: resolveHistoricalTerms(terms, asOf),
    };
}

export type RecordCompensationInput = {
    orgId: string;
    employmentId: string;
    payBasis: PayBasis;
    rateAmount: number;
    effectiveStart: string;
    currency?: string;
    note?: string | null;
    actorUserId?: string | null;
};

/** The day before `date`, so a closing period never overlaps its successor. */
function dayBefore(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

export async function recordCompensationTerm(
    supabase: SupabaseClient,
    input: RecordCompensationInput,
): Promise<CompensationTerm> {
    const { orgId, employmentId, payBasis, rateAmount, effectiveStart } = input;
    if (!orgId || !employmentId) {
        throw new EmploymentCompensationError("invalid_input", "Organization and employment are required.");
    }
    if (payBasis !== "hourly" && payBasis !== "salary") {
        throw new EmploymentCompensationError("invalid_input", "Pay basis must be hourly or salary.");
    }
    if (!Number.isFinite(rateAmount) || rateAmount < 0) {
        throw new EmploymentCompensationError("invalid_input", "Rate must be a non-negative amount.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveStart ?? "")) {
        throw new EmploymentCompensationError("invalid_input", "Effective start must be YYYY-MM-DD.");
    }
    await assertEmploymentInOrg(supabase, orgId, employmentId);

    // The open term this one replaces, if there is one.
    const { data: openRows, error: openErr } = await supabase
        .from("employment_compensation_terms")
        .select(COLUMNS)
        .eq("org_id", orgId)
        .eq("employment_id", employmentId)
        .eq("is_active", true)
        .is("effective_end", null);
    if (openErr) throw new EmploymentCompensationError("db_error", openErr.message);
    const open = ((openRows ?? []) as unknown as CompensationTermRow[])[0] ?? null;

    if (open && open.effective_start > effectiveStart) {
        throw new EmploymentCompensationError(
            "conflict",
            "A later term is already in force. Record the correction against that term instead.",
        );
    }

    const insert = {
        org_id: orgId,
        employment_id: employmentId,
        pay_basis: payBasis,
        rate_amount: rateAmount,
        rate_unit: rateUnitForBasis(payBasis),
        rate_currency: (input.currency ?? "USD").toUpperCase(),
        effective_start: effectiveStart,
        effective_end: null as string | null,
        supersedes_id: open?.id ?? null,
        is_active: true,
        note: input.note ?? null,
        created_by: input.actorUserId ?? null,
        updated_by: input.actorUserId ?? null,
    };

    // Close the prior period FIRST: the unique index forbids two open terms, so
    // inserting first would be rejected and leave the history untouched — correct,
    // but it would report a constraint violation instead of doing the obvious thing.
    if (open) {
        const { error: closeErr } = await supabase
            .from("employment_compensation_terms")
            .update({ effective_end: dayBefore(effectiveStart), updated_by: input.actorUserId ?? null, updated_at: new Date().toISOString() })
            .eq("id", open.id)
            .eq("org_id", orgId);
        if (closeErr) throw new EmploymentCompensationError("db_error", closeErr.message);
    }

    const { data, error } = await supabase
        .from("employment_compensation_terms")
        .insert(insert)
        .select(COLUMNS)
        .single();
    if (error || !data) {
        throw new EmploymentCompensationError("db_error", error?.message ?? "Could not record compensation.");
    }
    return toCompensationTerm(data as unknown as CompensationTermRow);
}
