/**
 * COMMERCIAL FINALIZATION — the one authority that closes a customer's billing period.
 *
 * ONE service, for one `financial_billing_periods.id`, for one customer. Operator close and
 * automatic close call THIS; there is no second implementation, because two implementations of
 * finality is how a period ends up closed two different ways and nobody can say which rules applied.
 *
 * ── WHAT THIS IS NOT ──
 *
 * Not the accounting period. Accounting close answers "which fiscal period does this belong to for
 * reporting"; this answers "is the customer's commercial period finished". They are independent in
 * both directions and deliberately share nothing.
 *
 * Not a status mutation. Nothing else may write `status = 'closed'`: the transition carries
 * eligibility, actor attribution and idempotency, and a generic update carries none of them.
 *
 * ── NO EARLY CLOSE ──
 *
 * A period becomes eligible only once its persisted `ends_on` has ELAPSED in the organisation's own
 * timezone. `fin.adjust` is authority to EXECUTE an eligible close, not authority to shorten a
 * household's commercial calendar — those are different powers and only one of them was granted.
 * An operator who could close November on the 12th would be re-cutting the customer's month by
 * choosing a date, which is exactly what the calendar exists to stop.
 *
 * ── THE BOUNDS ARE THE PERIOD'S OWN ──
 *
 * Eligibility reads `starts_on` / `ends_on` / `cadence` off the MATERIALIZED row, never by resolving
 * today's customer or location calendar. If a household switched from monthly to weekly in
 * December, November still ends when November ended. The database agrees:
 * `enforce_financial_billing_period_immutability` raises `billing_period_bounds_frozen` on any
 * attempt to move them, so a configuration change cannot restate a materialized boundary even by
 * accident.
 *
 * ── ONE TRANSITION ──
 *
 * Closing a closed period is a no-op that reports what already happened. It does not rewrite
 * `closed_at`, re-attribute `close_actor`, or re-run downstream work — which matters because the
 * scheduler retries, and a duplicate occurrence must not make a period look closed twice or make a
 * system close look like an operator's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";

/** Authority to execute an eligible close. Deliberately the same key that adjusts an account. */
export const BILLING_PERIOD_CLOSE_PERMISSION = "fin.adjust" as const;

export class BillingPeriodCloseError extends Error {
    readonly code: string;
    readonly detail: Record<string, unknown>;
    constructor(code: string, message: string, detail: Record<string, unknown> = {}) {
        super(message);
        this.name = "BillingPeriodCloseError";
        this.code = code;
        this.detail = detail;
    }
}

/**
 * `operator` carries the human who executed it; `system` carries nobody.
 *
 * The database enforces the pairing (`financial_billing_periods_close_actor_shape_chk`), so a
 * scheduler that invented an actor to satisfy a NOT NULL would be refused rather than quietly
 * attributing an automatic close to a person.
 */
export type BillingPeriodCloseActor = "operator" | "system";

export type CloseBillingPeriodInput = {
    orgId: string;
    billingPeriodId: string;
    closeActor: BillingPeriodCloseActor;
    /** Required for `operator`, forbidden for `system`. */
    actorUserId?: string | null;
    /**
     * Test seam for the date boundary ONLY. Production passes nothing and the org's own timezone
     * decides. It cannot be used to close early: it is compared against the period's frozen
     * `ends_on` exactly as a real clock would be.
     */
    todayYmd?: string;
};

export type CloseBillingPeriodResult = {
    billingPeriodId: string;
    customerId: string;
    periodKey: string;
    status: "closed";
    closedAt: string;
    closeActor: BillingPeriodCloseActor;
    closedBy: string | null;
    /** True when this call made the transition; false when it was already closed. */
    transitioned: boolean;
};

type PeriodRow = {
    id: string;
    org_id: string;
    customer_id: string;
    period_key: string;
    cadence: string;
    starts_on: string;
    ends_on: string;
    status: string;
    closed_at: string | null;
    closed_by: string | null;
    close_actor: string | null;
};

const PERIOD_COLUMNS =
    "id, org_id, customer_id, period_key, cadence, starts_on, ends_on, status, closed_at, closed_by, close_actor";

/**
 * Has the period's commercial interval finished?
 *
 * Inclusive bounds, so a period ending on the 30th is eligible from the 1st — not on the 30th,
 * when the household is still accruing into it.
 */
export function isBillingPeriodElapsed(endsOn: string, todayYmd: string): boolean {
    return todayYmd > endsOn;
}

export type BillingPeriodCloseEligibility =
    | { eligible: true }
    | { eligible: false; code: string; message: string; detail: Record<string, unknown> };

/**
 * Eligibility as a value, so an operator surface can ASK before offering the action and the
 * scheduler can filter without duplicating the rule.
 */
export function evaluateBillingPeriodCloseEligibility(
    period: { id: string; period_key: string; ends_on: string; status: string },
    todayYmd: string,
): BillingPeriodCloseEligibility {
    if (period.status === "closed") return { eligible: true };
    if (!isBillingPeriodElapsed(period.ends_on, todayYmd)) {
        return {
            eligible: false,
            code: "billing_period_not_elapsed",
            message:
                `This billing period runs to ${period.ends_on} and has not finished yet, so it cannot be`
                + " closed. It becomes available to close the day after it ends.",
            detail: { billingPeriodId: period.id, periodKey: period.period_key, endsOn: period.ends_on, todayYmd },
        };
    }
    return { eligible: true };
}

async function loadPeriod(
    supabase: SupabaseClient,
    orgId: string,
    billingPeriodId: string,
): Promise<PeriodRow> {
    const { data, error } = await supabase
        .from("financial_billing_periods")
        .select(PERIOD_COLUMNS)
        .eq("org_id", orgId)
        .eq("id", billingPeriodId)
        .maybeSingle();
    if (error) throw new BillingPeriodCloseError("db_error", error.message, { billingPeriodId });
    const row = data as PeriodRow | null;
    if (!row) {
        throw new BillingPeriodCloseError(
            "not_found",
            "That billing period does not exist for this organisation.",
            { billingPeriodId },
        );
    }
    return row;
}

function settled(row: PeriodRow): CloseBillingPeriodResult {
    return {
        billingPeriodId: row.id,
        customerId: row.customer_id,
        periodKey: row.period_key,
        status: "closed",
        closedAt: row.closed_at!,
        closeActor: row.close_actor as BillingPeriodCloseActor,
        closedBy: row.closed_by,
        transitioned: false,
    };
}

/**
 * Close one customer billing period.
 *
 * Idempotent: an already-closed period returns its EXISTING attribution untouched, including when
 * the caller is a different actor kind from the one that closed it. The first transition is the
 * commercial fact; a later duplicate does not get to re-author it.
 */
export async function closeBillingPeriod(
    supabase: SupabaseClient,
    input: CloseBillingPeriodInput,
): Promise<CloseBillingPeriodResult> {
    const orgId = (input.orgId ?? "").trim();
    const billingPeriodId = (input.billingPeriodId ?? "").trim();
    if (!orgId || !billingPeriodId) {
        throw new BillingPeriodCloseError("invalid_input", "orgId and billingPeriodId are required.");
    }

    const actorUserId = (input.actorUserId ?? "")?.trim() || null;
    if (input.closeActor === "operator" && !actorUserId) {
        throw new BillingPeriodCloseError(
            "actor_required",
            "An operator close must name the person who executed it.",
            { billingPeriodId },
        );
    }
    /*
     * NEVER FABRICATE A HUMAN ACTOR FOR AN AUTOMATIC CLOSE. A scheduler passing a user id would
     * make the audit say a person finalized the period. Refused here, and the database would refuse
     * it too.
     */
    if (input.closeActor === "system" && actorUserId) {
        throw new BillingPeriodCloseError(
            "system_close_has_no_actor",
            "An automatic close is attributed to the system, not to a person.",
            { billingPeriodId },
        );
    }

    const period = await loadPeriod(supabase, orgId, billingPeriodId);

    /* ALREADY CLOSED IS NOT AN ERROR, and it is answered before eligibility is even consulted. */
    if (period.status === "closed") return settled(period);

    const todayYmd = input.todayYmd ?? (await resolveOperationalEnrollmentTodayYmd(supabase, orgId));
    const eligibility = evaluateBillingPeriodCloseEligibility(period, todayYmd);
    if (!eligibility.eligible) {
        throw new BillingPeriodCloseError(eligibility.code, eligibility.message, eligibility.detail);
    }

    const closedAt = new Date().toISOString();
    /*
     * THE TRANSITION IS CONDITIONAL ON STILL BEING OPEN — `.eq("status", "open")`.
     *
     * Two workers claiming the same occurrence, or an operator racing the scheduler, both reach
     * here. The loser's update matches no row, which is how one period gets one transition without
     * a lock. The loser then re-reads and reports the winner's attribution.
     */
    const { data, error } = await supabase
        .from("financial_billing_periods")
        .update({
            status: "closed",
            closed_at: closedAt,
            close_actor: input.closeActor,
            closed_by: input.closeActor === "operator" ? actorUserId : null,
            updated_at: closedAt,
        })
        .eq("org_id", orgId)
        .eq("id", billingPeriodId)
        .eq("status", "open")
        .select(PERIOD_COLUMNS);
    if (error) throw new BillingPeriodCloseError("db_error", error.message, { billingPeriodId });

    const rows = (data ?? []) as PeriodRow[];
    if (rows.length === 0) {
        /* Someone else closed it between our read and our write. Report theirs, not ours. */
        return settled(await loadPeriod(supabase, orgId, billingPeriodId));
    }

    const closed = rows[0]!;
    return {
        billingPeriodId: closed.id,
        customerId: closed.customer_id,
        periodKey: closed.period_key,
        status: "closed",
        closedAt: closed.closed_at!,
        closeActor: closed.close_actor as BillingPeriodCloseActor,
        closedBy: closed.closed_by,
        transitioned: true,
    };
}

/**
 * The OPEN periods whose interval has finished — what automatic close acts on.
 *
 * Bounded and ordered oldest-first so a backlog drains deterministically rather than in whatever
 * order the database felt like returning.
 */
export async function findClosableBillingPeriods(
    supabase: SupabaseClient,
    args: { orgId: string; todayYmd: string; limit?: number },
): Promise<Array<{ id: string; customer_id: string; period_key: string; ends_on: string }>> {
    const { data, error } = await supabase
        .from("financial_billing_periods")
        .select("id, customer_id, period_key, ends_on")
        .eq("org_id", args.orgId)
        .eq("status", "open")
        /* `lt` on the day boundary IS the elapsed rule: ends_on strictly before today. */
        .lt("ends_on", args.todayYmd)
        .order("ends_on", { ascending: true })
        .limit(args.limit ?? 100);
    if (error) throw new BillingPeriodCloseError("db_error", error.message, { orgId: args.orgId });
    return (data ?? []) as Array<{ id: string; customer_id: string; period_key: string; ends_on: string }>;
}
