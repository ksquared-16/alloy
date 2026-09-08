/**
 * THE FINANCIAL JOURNAL — what happened to money, in which period, exactly once.
 *
 * ── WHAT THIS IS NOT ──
 *
 * It is not a general ledger, not double-entry accounting, and not a balance authority.
 *
 * The platform already has a double-entry GL (`gl_journal_entries` / `gl_journal_lines`, posted by
 * `post_ledger_transaction`). The Thread 5 census found it belongs to the job/Stripe vertical and is
 * dormant — no application code calls the posting function, and on the certification database it
 * held zero rows while three charges, four payments and three allocations existed. Converting the
 * childcare spine into double-entry would mean authoring GL account mappings, a chart of accounts
 * and a posting policy for every childcare consequence. That is an accounting suite, and it is
 * explicitly out of scope. What the spine needed was the thing underneath one: an append-only,
 * period-attributed record of what happened, from which such an export can later be derived.
 *
 * ── BALANCE AUTHORITY IS UNCHANGED, AND THAT IS LOAD-BEARING ──
 *
 * `charges` remain the authority for gross owed; active `payment_allocations` of POSTED payments
 * remain the authority for what reduces it (`jobPaymentBalances`). This service adds a second
 * DESCRIPTION of those events and must never become a second ANSWER: two consumers computing a
 * balance from different tables is how a family is told two different numbers.
 *
 * The schema enforces the distinction rather than trusting a comment. `amount_cents` is the event's
 * own amount and is always positive; `obligation_delta_cents` is the only signed column and is what
 * the event does to what is owed. A receipt has an amount of $500 and a delta of ZERO, because money
 * arriving is not money applied — the mistake a single `amount` column invites.
 *
 * ── IDEMPOTENCY IS DERIVED, NOT SUPPLIED ──
 *
 * Every key is `<entry_type>:<source row id>`, so a retried post, a re-run migration backfill and a
 * double-clicked operator all compute the SAME key and the second write returns the first row. The
 * uniqueness is `(org_id, idempotency_key)` in the database; this service reads the existing row
 * back on conflict rather than raising, so a retry is harmless rather than an error the caller has
 * to interpret.
 *
 * Posture: callers MUST pass a server-only Supabase client (service-role admin client).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { DEFAULT_CURRENCY_CODE } from "@/lib/financials/billableSource";

/** The row that caused a consequence. */
export type JournalSourceType = "charge" | "payment" | "payment_allocation";

/**
 * The consequences the spine can produce. This vocabulary is closed and mirrors
 * `financial_journal_entries_entry_type_chk`; adding a value here without adding it there produces a
 * write the database refuses, which is the correct direction for that mistake.
 */
export const JOURNAL_ENTRY_TYPES = [
    "charge_posted",
    "charge_corrected",
    "payment_received",
    "payment_applied",
    "payment_application_reversed",
    "payment_refunded",
] as const;
export type JournalEntryType = (typeof JOURNAL_ENTRY_TYPES)[number];

/** Why a row carries no accounting period. Attribution is all-or-nothing; see the table CHECK. */
export type PeriodAttribution = "attributed" | "no_calendar";

export type FinancialJournalEntryRow = {
    id: string;
    org_id: string;
    customer_id: string | null;
    billable_source_type: string | null;
    billable_source_id: string | null;
    source_type: JournalSourceType;
    source_id: string;
    entry_type: JournalEntryType;
    amount_cents: number;
    obligation_delta_cents: number;
    currency: string;
    effective_on: string;
    posted_at: string;
    billing_period_key: string | null;
    accounting_calendar_id: string | null;
    accounting_period_id: string | null;
    accounting_period_key: string | null;
    period_attribution: PeriodAttribution;
    reverses_entry_id: string | null;
    idempotency_key: string;
    actor_user_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
};

export type RecordJournalEntryInput = {
    orgId: string;
    customerId?: string | null;
    billableSourceType?: string | null;
    billableSourceId?: string | null;
    sourceType: JournalSourceType;
    sourceId: string;
    entryType: JournalEntryType;
    /** Always positive: the event's own amount. */
    amountCents: number;
    /** Signed: what this does to what the customer owes. Zero is a legitimate answer. */
    obligationDeltaCents: number;
    currency?: string | null;
    /** The date the consequence is EFFECTIVE. The accounting period is resolved from this. */
    effectiveOn: string;
    /** The customer-facing cycle, where one applies. Never derived from `effectiveOn`. */
    billingPeriodKey?: string | null;
    reversesEntryId?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
};

export type RecordJournalEntryResult = {
    entry: FinancialJournalEntryRow;
    /** False when this call wrote the row; true when an identical key already existed. */
    alreadyRecorded: boolean;
};

const TABLE = "financial_journal_entries";

/** `<entry_type>:<source id>` — computable by any writer, which is what makes a retry harmless. */
export function journalIdempotencyKey(entryType: JournalEntryType, sourceId: string): string {
    return `${entryType}:${sourceId}`;
}

/**
 * Translate the database's refusals into sentences.
 *
 * The trigger raises `accounting_period_unavailable` and `accounting_period_closed` with the period
 * in the message. These are not `db_error`s — they are states an operator can act on ("open the
 * period", "post the correction into the current one"), so they surface as `invalid_state` carrying
 * a machine-readable reason.
 */
function translateJournalError(message: string): OperationalEnrollmentServiceError {
    if (message.includes("accounting_period_unavailable")) {
        return new OperationalEnrollmentServiceError(
            "invalid_state",
            "No accounting period on the active calendar covers this date. Author the period before posting into it.",
            { reason: "accounting_period_unavailable", detail: message }
        );
    }
    if (message.includes("accounting_period_closed")) {
        return new OperationalEnrollmentServiceError(
            "invalid_state",
            "That accounting period is closed. Post the correction into an open period.",
            { reason: "accounting_period_closed", detail: message }
        );
    }
    if (message.includes("append-only") || message.includes("cannot be updated") || message.includes("cannot be deleted")) {
        return new OperationalEnrollmentServiceError(
            "invalid_state",
            "Posted financial history cannot be rewritten. Record a corrective entry instead.",
            { reason: "journal_append_only", detail: message }
        );
    }
    return new OperationalEnrollmentServiceError("db_error", message);
}

async function readByIdempotencyKey(
    supabase: SupabaseClient,
    orgId: string,
    key: string
): Promise<FinancialJournalEntryRow | null> {
    const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("org_id", orgId)
        .eq("idempotency_key", key)
        .maybeSingle();
    if (error) throw translateJournalError(error.message);
    return (data as FinancialJournalEntryRow | null) ?? null;
}

/**
 * Record one posted financial consequence.
 *
 * The period is NOT resolved here. `attribute_financial_journal_entry` stamps it BEFORE INSERT, so
 * a row written by any other client — a backfill, a future service, psql — is attributed by the same
 * rule. This function's job is to compute the key, hand over the facts, and read back the row that
 * already existed when the key collides.
 */
export async function recordFinancialJournalEntry(
    supabase: SupabaseClient,
    input: RecordJournalEntryInput
): Promise<RecordJournalEntryResult> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "A journal entry records a positive amount; direction is carried by obligationDeltaCents."
        );
    }
    if (!Number.isInteger(input.obligationDeltaCents)) {
        throw new OperationalEnrollmentServiceError("invalid_input", "obligationDeltaCents must be an integer.");
    }

    const idempotencyKey = journalIdempotencyKey(input.entryType, input.sourceId);
    const row = {
        org_id: input.orgId,
        customer_id: input.customerId ?? null,
        billable_source_type: input.billableSourceType ?? null,
        billable_source_id: input.billableSourceId ?? null,
        source_type: input.sourceType,
        source_id: input.sourceId,
        entry_type: input.entryType,
        amount_cents: input.amountCents,
        obligation_delta_cents: input.obligationDeltaCents,
        currency: input.currency ?? DEFAULT_CURRENCY_CODE,
        effective_on: input.effectiveOn.slice(0, 10),
        billing_period_key: input.billingPeriodKey ?? null,
        reverses_entry_id: input.reversesEntryId ?? null,
        idempotency_key: idempotencyKey,
        actor_user_id: input.actorUserId ?? null,
        metadata: input.metadata ?? {},
    };

    const { data, error } = await supabase.from(TABLE).insert(row).select("*").maybeSingle();
    if (error) {
        // 23505 is the idempotency key doing its job: the consequence is already recorded.
        if (error.code === "23505" || error.message.includes("financial_journal_entries_org_idempotency_uq")) {
            const existing = await readByIdempotencyKey(supabase, input.orgId, idempotencyKey);
            if (existing) return { entry: existing, alreadyRecorded: true };
        }
        throw translateJournalError(error.message);
    }
    if (!data) {
        const existing = await readByIdempotencyKey(supabase, input.orgId, idempotencyKey);
        if (existing) return { entry: existing, alreadyRecorded: true };
        throw new OperationalEnrollmentServiceError("db_error", "journal entry insert returned no row");
    }
    return { entry: data as FinancialJournalEntryRow, alreadyRecorded: false };
}

/**
 * The outcome of a journal write, as a VALUE rather than an exception.
 *
 * ── WHY THE JOURNAL NEVER BLOCKS THE MONEY ──
 *
 * Recording history is downstream of making it. If a reporting calendar has not been authored far
 * enough forward, or an entry cannot be attributed for any other reason, the correct answer is that
 * the charge still posts and the payment is still received — a REPORTING boundary must not be able
 * to stop an OPERATIONAL act, or closing the books would stop a family being charged.
 *
 * What must not happen is silence. So the outcome is returned to the caller and rendered in the
 * service result: `skipped` always carries the reason, and certification asserts `recorded` rather
 * than merely asserting the charge posted.
 */
export type JournalOutcome =
    | { status: "recorded"; entry: FinancialJournalEntryRow }
    | { status: "already_recorded"; entry: FinancialJournalEntryRow }
    | { status: "skipped"; reason: string };

/** Record, and report what happened instead of throwing. See `JournalOutcome`. */
export async function tryRecordFinancialJournalEntry(
    supabase: SupabaseClient,
    input: RecordJournalEntryInput
): Promise<JournalOutcome> {
    try {
        const { entry, alreadyRecorded } = await recordFinancialJournalEntry(supabase, input);
        return alreadyRecorded ? { status: "already_recorded", entry } : { status: "recorded", entry };
    } catch (err) {
        const reason =
            err instanceof OperationalEnrollmentServiceError
                ? String((err.details as { reason?: string } | undefined)?.reason ?? err.code)
                : "journal_write_failed";
        return { status: "skipped", reason: `${reason}: ${err instanceof Error ? err.message : String(err)}` };
    }
}

/**
 * The date a charge's financial consequence is EFFECTIVE, for accounting attribution.
 *
 * Deliberately NOT the same precedence as `placeInBillingPeriod`, which leads with `billable_on`.
 * Accounting attribution leads with `service_date` because the consequence belongs to the period the
 * service was delivered in; billing attribution leads with `billable_on` because the customer's
 * cycle is the one that bills it. A September service billed in October reports in September and
 * bills in October, and that difference is the whole reason both exist.
 */
export function chargeEffectiveOn(charge: {
    service_date?: unknown;
    billable_on?: unknown;
    occurs_on?: unknown;
    posted_at?: unknown;
    created_at?: unknown;
}): string {
    for (const value of [charge.service_date, charge.billable_on, charge.occurs_on, charge.posted_at, charge.created_at]) {
        const raw = value != null ? String(value).trim() : "";
        const head = raw.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
    }
    return new Date().toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------------------
 * The six consequences, each stating its own obligation delta.
 *
 * These exist so the sign is decided ONCE, here, rather than at every call site.
 * A caller that had to remember "a reversal is negative, a reversal of an
 * application is positive" is a caller that eventually forgets.
 * ------------------------------------------------------------------------- */

/** A charge is posted: the obligation comes into existence. */
export function chargePostedEntry(params: {
    orgId: string;
    chargeId: string;
    amountCents: number;
    currency?: string | null;
    billableSourceType: string | null;
    billableSourceId: string | null;
    customerId?: string | null;
    effectiveOn: string;
    billingPeriodKey?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
}): RecordJournalEntryInput {
    return {
        orgId: params.orgId,
        customerId: params.customerId ?? null,
        billableSourceType: params.billableSourceType,
        billableSourceId: params.billableSourceId,
        sourceType: "charge",
        sourceId: params.chargeId,
        entryType: "charge_posted",
        amountCents: Math.abs(params.amountCents),
        obligationDeltaCents: params.amountCents,
        currency: params.currency ?? null,
        effectiveOn: params.effectiveOn,
        billingPeriodKey: params.billingPeriodKey ?? null,
        actorUserId: params.actorUserId ?? null,
        metadata: params.metadata,
    };
}

/**
 * A correction is posted: a reversal, credit or replacement.
 *
 * `signedAmountCents` is the correction charge's own amount, which the charge spine already writes
 * negative for a reversal or credit. The journal repeats that sign rather than recomputing it, so
 * the two can never disagree about which way the money went.
 */
export function chargeCorrectedEntry(params: {
    orgId: string;
    correctionChargeId: string;
    signedAmountCents: number;
    currency?: string | null;
    billableSourceType: string | null;
    billableSourceId: string | null;
    customerId?: string | null;
    effectiveOn: string;
    billingPeriodKey?: string | null;
    reversesEntryId?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
}): RecordJournalEntryInput {
    return {
        orgId: params.orgId,
        customerId: params.customerId ?? null,
        billableSourceType: params.billableSourceType,
        billableSourceId: params.billableSourceId,
        sourceType: "charge",
        sourceId: params.correctionChargeId,
        entryType: "charge_corrected",
        amountCents: Math.abs(params.signedAmountCents),
        obligationDeltaCents: params.signedAmountCents,
        currency: params.currency ?? null,
        effectiveOn: params.effectiveOn,
        billingPeriodKey: params.billingPeriodKey ?? null,
        reversesEntryId: params.reversesEntryId ?? null,
        actorUserId: params.actorUserId ?? null,
        metadata: params.metadata,
    };
}

/** Money arrived. It owes nothing to the balance until it is APPLIED, so the delta is zero. */
export function paymentReceivedEntry(params: {
    orgId: string;
    paymentId: string;
    amountCents: number;
    currency?: string | null;
    billableSourceType: string | null;
    billableSourceId: string | null;
    customerId?: string | null;
    effectiveOn: string;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
}): RecordJournalEntryInput {
    return {
        orgId: params.orgId,
        customerId: params.customerId ?? null,
        billableSourceType: params.billableSourceType,
        billableSourceId: params.billableSourceId,
        sourceType: "payment",
        sourceId: params.paymentId,
        entryType: "payment_received",
        amountCents: Math.abs(params.amountCents),
        obligationDeltaCents: 0,
        currency: params.currency ?? null,
        effectiveOn: params.effectiveOn,
        actorUserId: params.actorUserId ?? null,
        metadata: params.metadata,
    };
}

/** Money was applied to an obligation: what is owed goes down by exactly the applied amount. */
export function paymentAppliedEntry(params: {
    orgId: string;
    allocationId: string;
    chargeId: string | null;
    amountCents: number;
    currency?: string | null;
    billableSourceType: string | null;
    billableSourceId: string | null;
    customerId?: string | null;
    effectiveOn: string;
    billingPeriodKey?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
}): RecordJournalEntryInput {
    return {
        orgId: params.orgId,
        customerId: params.customerId ?? null,
        billableSourceType: params.billableSourceType,
        billableSourceId: params.billableSourceId,
        sourceType: "payment_allocation",
        sourceId: params.allocationId,
        entryType: "payment_applied",
        amountCents: Math.abs(params.amountCents),
        obligationDeltaCents: -Math.abs(params.amountCents),
        currency: params.currency ?? null,
        effectiveOn: params.effectiveOn,
        billingPeriodKey: params.billingPeriodKey ?? null,
        actorUserId: params.actorUserId ?? null,
        metadata: { ...(params.metadata ?? {}), charge_id: params.chargeId },
    };
}

/** An application was reversed: the obligation comes back. */
export function paymentApplicationReversedEntry(params: {
    orgId: string;
    allocationId: string;
    chargeId: string | null;
    amountCents: number;
    currency?: string | null;
    billableSourceType: string | null;
    billableSourceId: string | null;
    customerId?: string | null;
    effectiveOn: string;
    reversesEntryId?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
}): RecordJournalEntryInput {
    return {
        orgId: params.orgId,
        customerId: params.customerId ?? null,
        billableSourceType: params.billableSourceType,
        billableSourceId: params.billableSourceId,
        sourceType: "payment_allocation",
        sourceId: params.allocationId,
        entryType: "payment_application_reversed",
        amountCents: Math.abs(params.amountCents),
        obligationDeltaCents: Math.abs(params.amountCents),
        currency: params.currency ?? null,
        effectiveOn: params.effectiveOn,
        reversesEntryId: params.reversesEntryId ?? null,
        actorUserId: params.actorUserId ?? null,
        metadata: { ...(params.metadata ?? {}), charge_id: params.chargeId },
    };
}

/**
 * Money went back out.
 *
 * The delta is ZERO for the same reason a receipt's is: a refund returns money that was received.
 * Whatever that money had been APPLIED to is restored by its own
 * `payment_application_reversed` entry — one event, one consequence, never counted twice.
 */
export function paymentRefundedEntry(params: {
    orgId: string;
    refundPaymentId: string;
    refundsPaymentId: string;
    amountCents: number;
    currency?: string | null;
    billableSourceType: string | null;
    billableSourceId: string | null;
    customerId?: string | null;
    effectiveOn: string;
    reversesEntryId?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
}): RecordJournalEntryInput {
    return {
        orgId: params.orgId,
        customerId: params.customerId ?? null,
        billableSourceType: params.billableSourceType,
        billableSourceId: params.billableSourceId,
        sourceType: "payment",
        sourceId: params.refundPaymentId,
        entryType: "payment_refunded",
        amountCents: Math.abs(params.amountCents),
        obligationDeltaCents: 0,
        currency: params.currency ?? null,
        effectiveOn: params.effectiveOn,
        reversesEntryId: params.reversesEntryId ?? null,
        actorUserId: params.actorUserId ?? null,
        metadata: { ...(params.metadata ?? {}), refunds_payment_id: params.refundsPaymentId },
    };
}

/**
 * The entry a given source row produced, if any.
 *
 * Used to link a correction to what it corrects (`reverses_entry_id`) without the caller having to
 * remember the key format.
 */
export async function findEntryForSource(
    supabase: SupabaseClient,
    params: { orgId: string; entryType: JournalEntryType; sourceId: string }
): Promise<FinancialJournalEntryRow | null> {
    return readByIdempotencyKey(
        supabase,
        params.orgId,
        journalIdempotencyKey(params.entryType, params.sourceId)
    );
}

/**
 * An account's posted history, oldest first.
 *
 * Returns history, not a balance — deliberately. A caller wanting what is owed asks
 * `readChargeBalance` / `jobPaymentBalances`, which read charges and allocations.
 */
export async function readAccountJournal(
    supabase: SupabaseClient,
    params: { orgId: string; billableSourceType: string; billableSourceId: string }
): Promise<FinancialJournalEntryRow[]> {
    const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("org_id", params.orgId)
        .eq("billable_source_type", params.billableSourceType)
        .eq("billable_source_id", params.billableSourceId)
        .order("posted_at", { ascending: true });
    if (error) throw translateJournalError(error.message);
    return (data ?? []) as FinancialJournalEntryRow[];
}

/**
 * What one accounting period reported: the movement in obligations, and the entries behind it.
 *
 * `obligation_movement_cents` is a PERIOD MOVEMENT, not a balance. Summing every period's movement
 * happens to equal the outstanding total only when nothing has been written outside the journal;
 * that coincidence is not a contract, and no consumer should build on it.
 */
export async function readPeriodMovement(
    supabase: SupabaseClient,
    params: { orgId: string; accountingPeriodKey: string }
): Promise<{ entries: FinancialJournalEntryRow[]; obligation_movement_cents: number; entry_count: number }> {
    const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("org_id", params.orgId)
        .eq("accounting_period_key", params.accountingPeriodKey)
        .order("posted_at", { ascending: true });
    if (error) throw translateJournalError(error.message);
    const entries = (data ?? []) as FinancialJournalEntryRow[];
    return {
        entries,
        obligation_movement_cents: entries.reduce((sum, e) => sum + Number(e.obligation_delta_cents ?? 0), 0),
        entry_count: entries.length,
    };
}
