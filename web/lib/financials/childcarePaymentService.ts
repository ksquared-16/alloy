/**
 * CHILDCARE PAYMENT SERVICE — money received, applied to an obligation exactly once, and refunded
 * without rewriting what happened.
 *
 * ── WHAT THIS IS NOT ──
 *
 * It is not a second payments table, not a childcare payment ledger, not a second balance rule and
 * not a new allocation model. The census (certification/financials/payments-spine-census.sql,
 * tha_be923375ea3595) settled that the substrate was already there and had simply never been
 * reachable:
 *
 *   * `payments.job_id` is NULLABLE on the deployed primary — it has been since `20260329210000`.
 *     A childcare payment was never blocked by a NOT NULL, and nothing here relaxes one.
 *   * `payment_allocations.charge_id` already targets a charge, and `charges` is already generalized
 *     to `billable_source_*`. Applying money to a childcare charge is therefore the EXISTING
 *     allocation model used against an existing charge — no new shape.
 *   * `jobPaymentBalances` already states the balance rule: owed = charges − active allocations
 *     whose parent payment is POSTED. This service writes rows that rule already understands, so
 *     the childcare card and the job drawer answer the same arithmetic. There is no second answer.
 *
 * What was genuinely missing was a WRITE PATH. Before this, nothing in the application ever inserted
 * a `payments` or a `payment_allocations` row except the Stripe executor, which takes `job_id` and
 * `customer_id` as required arguments and allocates to `target_entity_type = 'job'`. A childcare
 * family could be charged and could never pay.
 *
 * ── INVARIANTS (the database is authoritative; these mirror it for friendly errors) ──
 *
 *   - A childcare payment carries a childcare `billable_source_type` + `billable_source_id`;
 *     `job_id` is NULL. Job payments are untouched by every rule here.
 *   - Recording is IDEMPOTENT by `idempotency_key`, unique per org, so a retried request returns the
 *     payment that already exists rather than a second one.
 *   - Only a POSTED payment reduces a balance. A pending or failed attempt is recorded and changes
 *     nothing owed.
 *   - An application reduces the balance EXACTLY ONCE: one active allocation per (payment, charge),
 *     enforced by a partial unique index rather than by a check that races with itself.
 *   - Neither side is over-spent: not more than the payment is worth, not more than the charge asks.
 *   - A refund is a NEW outbound row via `refunds_payment_id`. The original receipt is frozen.
 *   - Every operator write is actor-attributed (`created_by` / `updated_by`).
 *
 * Posture: callers MUST pass a server-only Supabase client (service-role admin client). RLS
 * additionally role-gates childcare payment rows for `authenticated` (has_org_role).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    CHILDCARE_BILLABLE_SOURCE_TYPES,
    DEFAULT_CURRENCY_CODE,
    isChildcareBillableSource,
    type ChildcareBillableSourceType,
} from "@/lib/financials/billableSource";

/**
 * How the money arrived. The vocabulary is the one already on the table
 * (`payments_payment_method_chk`); nothing is added.
 */
export const CHILDCARE_PAYMENT_METHODS = ["cash", "check", "ach", "card", "manual", "other"] as const;
export type ChildcarePaymentMethod = (typeof CHILDCARE_PAYMENT_METHODS)[number];

export function isChildcarePaymentMethod(value: unknown): value is ChildcarePaymentMethod {
    return typeof value === "string" && (CHILDCARE_PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * The lifecycle states this service writes.
 *
 * `posted` is money that is financial truth; `pending` is an attempt that is not. The vocabulary is
 * `payments_status_chk`'s (`pending | posted | failed | voided`) and is not extended: inventing
 * `authorized` or `settled` here would create states no balance rule knows how to read.
 */
export type ChildcarePaymentStatus = "posted" | "pending";

/** Subset of the payments row this service reads/writes. */
export type PaymentRow = {
    id: string;
    org_id: string;
    job_id: string | null;
    customer_id: string | null;
    billable_source_type: string | null;
    billable_source_id: string | null;
    refunds_payment_id: string | null;
    idempotency_key: string | null;
    amount_cents: number;
    currency: string;
    status: string;
    direction: string;
    payment_method: string;
    processor: string | null;
    processor_transaction_id: string | null;
    reference_number: string | null;
    received_at: string;
    posted_at: string | null;
    failed_at: string | null;
    voided_at: string | null;
    notes: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    created_by: string | null;
    updated_by: string | null;
};

export type PaymentAllocationRow = {
    id: string;
    org_id: string;
    payment_id: string;
    charge_id: string | null;
    target_entity_type: string;
    target_entity_id: string;
    allocated_amount_cents: number;
    status: string;
    allocation_type: string;
    allocated_at: string;
    reversed_at: string | null;
    reversal_reason: string | null;
    metadata: Record<string, unknown>;
    created_by: string | null;
    updated_by: string | null;
};

const PAYMENT_COLUMNS =
    "id, org_id, job_id, customer_id, billable_source_type, billable_source_id, refunds_payment_id, "
    + "idempotency_key, amount_cents, currency, status, direction, payment_method, processor, "
    + "processor_transaction_id, reference_number, received_at, posted_at, failed_at, voided_at, notes, "
    + "metadata, created_at, updated_at, created_by, updated_by";

const ALLOCATION_COLUMNS =
    "id, org_id, payment_id, charge_id, target_entity_type, target_entity_id, allocated_amount_cents, "
    + "status, allocation_type, allocated_at, reversed_at, reversal_reason, metadata, created_by, updated_by";

/**
 * The allocation's target when it names a charge.
 *
 * `target_entity_type` / `target_entity_id` are NOT NULL and predate `charge_id`, so a charge-level
 * application still has to say what it targets. It targets the charge — which is what `charge_id`
 * already says — rather than being back-attributed to a job it has nothing to do with. The existing
 * job reads find these rows through `charge_id`, so nothing that reads job allocations changes.
 */
const ALLOCATION_TARGET_CHARGE = "charge" as const;

function assertPositiveIntCents(amount: number, field: string): void {
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            `${field} must be a positive integer number of cents`,
        );
    }
}

function nowIso(): string {
    return new Date().toISOString();
}

/**
 * Translate a database refusal into the sentence it means.
 *
 * The rules are asserted by triggers and partial unique indexes because that is where concurrency is
 * actually resolved. An operator should read a sentence, not a constraint name, so the authoritative
 * refusal is mapped here rather than re-implemented above it — a mirror check would race and could
 * disagree.
 */
function translateDbError(error: { message: string; code?: string }, context: string): never {
    const message = error.message ?? "";
    if (message.includes("uq_payment_allocations_one_active_per_payment_charge")) {
        throw new OperationalEnrollmentServiceError(
            "conflict",
            "this payment is already applied to that charge; a second application would reduce the balance twice",
        );
    }
    if (message.includes("uq_payments_org_idempotency_key")) {
        throw new OperationalEnrollmentServiceError(
            "conflict",
            "a payment with this idempotency key already exists in this organization",
        );
    }
    if (message.includes("uq_payments_org_processor_transaction")) {
        throw new OperationalEnrollmentServiceError(
            "conflict",
            "this provider transaction has already been recorded as a payment",
        );
    }
    if (message.includes("over-apply") || message.includes("over-pay") || message.includes("would exceed")) {
        throw new OperationalEnrollmentServiceError("invalid_state", message);
    }
    if (message.includes("is immutable") || message.includes("cannot be refunded") || message.includes("cannot receive a payment")) {
        throw new OperationalEnrollmentServiceError("invalid_state", message);
    }
    throw new OperationalEnrollmentServiceError("db_error", `${context}: ${message}`);
}

async function loadPayment(supabase: SupabaseClient, orgId: string, paymentId: string): Promise<PaymentRow> {
    const { data, error } = await supabase
        .from("payments")
        .select(PAYMENT_COLUMNS)
        .eq("org_id", orgId)
        .eq("id", paymentId)
        .maybeSingle();
    if (error) translateDbError(error, "load payment");
    if (!data) throw new OperationalEnrollmentServiceError("not_found", `payment ${paymentId} not found`);
    return data as unknown as PaymentRow;
}

/**
 * This service governs CHILDCARE money — every childcare billable source, not one of them.
 * A job payment reaching here is a caller mistake, not a case to handle: job billing owns its own
 * lifecycle and its own write path.
 */
function assertChildcarePayment(payment: PaymentRow): void {
    if (!isChildcareBillableSource(payment.billable_source_type)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `this service only governs childcare payments (${CHILDCARE_BILLABLE_SOURCE_TYPES.join(" | ")}); `
                + "job payments use the job billing path",
        );
    }
}

async function findByIdempotencyKey(
    supabase: SupabaseClient,
    orgId: string,
    idempotencyKey: string,
): Promise<PaymentRow | null> {
    const { data, error } = await supabase
        .from("payments")
        .select(PAYMENT_COLUMNS)
        .eq("org_id", orgId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
    if (error) translateDbError(error, "look up payment by idempotency key");
    return (data as unknown as PaymentRow | null) ?? null;
}

export type RecordChildcarePaymentInput = {
    orgId: string;
    /** The account the money was received against: the household, or a specific agreement. */
    billableSourceType: ChildcareBillableSourceType;
    billableSourceId: string;
    /**
     * The household, when the source is an agreement. Written to the legacy `customer_id` column so
     * job-era readers of "whose payment is this" keep working; it is never a second source of truth.
     */
    customerId?: string | null;
    amountCents: number;
    currency?: string;
    paymentMethod: ChildcarePaymentMethod;
    /**
     * `posted` is money that IS financial truth. `pending` records an attempt that is not, and
     * reduces nothing owed until it posts.
     */
    status?: ChildcarePaymentStatus;
    /** When the money actually arrived, if not now. Distinct from the allocation date. */
    receivedAt?: string | null;
    processor?: string | null;
    processorTransactionId?: string | null;
    referenceNumber?: string | null;
    /** Required for a retry to be harmless. Unique per org. */
    idempotencyKey?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown>;
    /** The operator recording the payment. Recorded as `created_by`; null for system writes. */
    actorUserId?: string | null;
};

export type RecordChildcarePaymentResult = {
    payment: PaymentRow;
    /**
     * True when an existing payment was returned because the idempotency key had already been used,
     * and nothing was written. The caller can tell "I recorded it" from "it was recorded" without
     * either being an error.
     */
    alreadyRecorded: boolean;
};

/**
 * RECORD MONEY RECEIVED. This does not apply it to anything — receiving and applying are separate
 * facts, and an unapplied payment is a real and legitimate state (money on the account, not yet
 * assigned to an obligation).
 *
 * ── RECORDING IS IDEMPOTENT ──
 *
 * A double-click, a network retry or a replayed provider event must not turn one payment into two.
 * The key is unique per org IN THE DATABASE, so two concurrent requests carrying the same key race
 * on the index and exactly one writes; the loser reads back the winner's row and reports
 * `alreadyRecorded`. A read-then-write pair alone would not have been enough.
 */
export async function recordChildcarePayment(
    supabase: SupabaseClient,
    input: RecordChildcarePaymentInput,
): Promise<RecordChildcarePaymentResult> {
    const orgId = trimOrNull(input.orgId);
    const sourceId = trimOrNull(input.billableSourceId);
    if (!orgId || !sourceId) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "orgId and billableSourceId are required",
        );
    }
    if (!isChildcareBillableSource(input.billableSourceType)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            `billableSourceType must be one of ${CHILDCARE_BILLABLE_SOURCE_TYPES.join(" | ")}`,
        );
    }
    if (!isChildcarePaymentMethod(input.paymentMethod)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            `invalid payment method: ${String(input.paymentMethod)}`,
        );
    }
    assertPositiveIntCents(input.amountCents, "amountCents");

    const idempotencyKey = trimOrNull(input.idempotencyKey);
    if (idempotencyKey) {
        const existing = await findByIdempotencyKey(supabase, orgId, idempotencyKey);
        if (existing) return { payment: existing, alreadyRecorded: true };
    }

    const status: ChildcarePaymentStatus = input.status === "pending" ? "pending" : "posted";
    const now = nowIso();
    const receivedAt = trimOrNull(input.receivedAt) ?? now;

    const { data, error } = await supabase
        .from("payments")
        .insert({
            org_id: orgId,
            // A childcare payment is not a job payment. `job_id` stays NULL, which the deployed
            // schema has permitted since 20260329210000.
            job_id: null,
            customer_id: trimOrNull(input.customerId)
                ?? (input.billableSourceType === "customer" ? sourceId : null),
            billable_source_type: input.billableSourceType,
            billable_source_id: sourceId,
            refunds_payment_id: null,
            idempotency_key: idempotencyKey,
            amount_cents: input.amountCents,
            currency: trimOrNull(input.currency) ?? DEFAULT_CURRENCY_CODE,
            status,
            direction: "inbound",
            payment_method: input.paymentMethod,
            processor: trimOrNull(input.processor),
            processor_transaction_id: trimOrNull(input.processorTransactionId),
            reference_number: trimOrNull(input.referenceNumber),
            received_at: receivedAt,
            // `posted_at` is set only when the money IS truth. `payments_posted_at_status_chk`
            // refuses the pair being inconsistent, so the two can never drift.
            posted_at: status === "posted" ? now : null,
            notes: trimOrNull(input.notes),
            metadata: input.metadata ?? {},
            updated_at: now,
            created_by: input.actorUserId ?? null,
            updated_by: input.actorUserId ?? null,
        })
        .select(PAYMENT_COLUMNS)
        .single();

    if (error) {
        // Lost the race on the idempotency index: the winner's payment is the one that stands.
        if (idempotencyKey && String(error.message ?? "").includes("uq_payments_org_idempotency_key")) {
            const winner = await findByIdempotencyKey(supabase, orgId, idempotencyKey);
            if (winner) return { payment: winner, alreadyRecorded: true };
        }
        translateDbError(error, "record payment");
    }
    return { payment: data as unknown as PaymentRow, alreadyRecorded: false };
}

export type ApplyPaymentToChargeInput = {
    orgId: string;
    paymentId: string;
    chargeId: string;
    /** Defaults to the smaller of what the payment has left and what the charge still owes. */
    amountCents?: number;
    /** The operator applying the money. Recorded as `created_by`. */
    actorUserId?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown>;
};

export type ApplyPaymentToChargeResult = {
    allocation: PaymentAllocationRow;
    /**
     * True when an active application of this payment to this charge already existed and nothing was
     * written. This is what makes a retried apply harmless rather than a second reduction.
     */
    alreadyApplied: boolean;
};

type ChargeBalanceFacts = {
    chargeId: string;
    amountCents: number;
    status: string;
    billableSourceType: string | null;
    appliedCents: number;
    outstandingCents: number;
};

/**
 * What a charge still owes, by the ONE rule the platform already has.
 *
 * The predicate — active allocations whose parent payment is POSTED — is `jobPaymentBalances`'s,
 * quoted rather than re-derived. A childcare charge and a job charge are asked the same question and
 * get the same arithmetic; a second rule here is how two surfaces start disagreeing about money.
 */
export async function readChargeBalance(
    supabase: SupabaseClient,
    orgId: string,
    chargeId: string,
): Promise<ChargeBalanceFacts> {
    const { data: charge, error: chargeError } = await supabase
        .from("charges")
        .select("id, amount_cents, status, billable_source_type")
        .eq("org_id", orgId)
        .eq("id", chargeId)
        .maybeSingle();
    if (chargeError) translateDbError(chargeError, "load charge");
    if (!charge) throw new OperationalEnrollmentServiceError("not_found", `charge ${chargeId} not found`);

    const row = charge as { id: string; amount_cents: number; status: string; billable_source_type: string | null };

    const { data: allocs, error: allocError } = await supabase
        .from("payment_allocations")
        .select("payment_id, allocated_amount_cents")
        .eq("org_id", orgId)
        .eq("charge_id", chargeId)
        .eq("status", "active");
    if (allocError) translateDbError(allocError, "load applications");

    const allocRows = (allocs ?? []) as Array<{ payment_id: string; allocated_amount_cents: number }>;
    let appliedCents = 0;
    if (allocRows.length > 0) {
        const paymentIds = [...new Set(allocRows.map((a) => a.payment_id))];
        const { data: posted, error: postedError } = await supabase
            .from("payments")
            .select("id")
            .eq("org_id", orgId)
            .in("id", paymentIds)
            .eq("status", "posted");
        if (postedError) translateDbError(postedError, "load payment statuses");
        const postedIds = new Set(((posted ?? []) as Array<{ id: string }>).map((p) => p.id));
        for (const a of allocRows) {
            if (!postedIds.has(a.payment_id)) continue;
            appliedCents += Number(a.allocated_amount_cents) || 0;
        }
    }

    const amountCents = Number(row.amount_cents) || 0;
    return {
        chargeId: row.id,
        amountCents,
        status: row.status,
        billableSourceType: row.billable_source_type,
        appliedCents,
        outstandingCents: amountCents - appliedCents,
    };
}

/** What has been given back out of this receipt. Refunds are outbound rows pointing at it. */
export async function readPaymentRefundedCents(
    supabase: SupabaseClient,
    orgId: string,
    paymentId: string,
): Promise<number> {
    const { data, error } = await supabase
        .from("payments")
        .select("amount_cents")
        .eq("org_id", orgId)
        .eq("refunds_payment_id", paymentId)
        .neq("status", "voided");
    if (error) translateDbError(error, "load refunds for payment");
    let refunded = 0;
    for (const r of (data ?? []) as Array<{ amount_cents: number }>) {
        refunded += Number(r.amount_cents) || 0;
    }
    return refunded;
}

/**
 * The payment's unapplied remainder — money received, not yet assigned to an obligation, AND NOT
 * ALREADY GIVEN BACK.
 *
 * Refunds are subtracted for a reason that is easy to miss: a full refund reverses the applications,
 * which by itself would make the whole receipt look freshly available to apply again. The money left
 * the building; only the un-refunded part of it can be assigned to anything.
 */
export async function readPaymentUnappliedCents(
    supabase: SupabaseClient,
    orgId: string,
    paymentId: string,
    paymentAmountCents: number,
): Promise<number> {
    const { data, error } = await supabase
        .from("payment_allocations")
        .select("allocated_amount_cents")
        .eq("org_id", orgId)
        .eq("payment_id", paymentId)
        .eq("status", "active");
    if (error) translateDbError(error, "load applications for payment");
    let applied = 0;
    for (const r of (data ?? []) as Array<{ allocated_amount_cents: number }>) {
        applied += Number(r.allocated_amount_cents) || 0;
    }
    const refunded = await readPaymentRefundedCents(supabase, orgId, paymentId);
    return paymentAmountCents - applied - refunded;
}

async function findActiveAllocation(
    supabase: SupabaseClient,
    orgId: string,
    paymentId: string,
    chargeId: string,
): Promise<PaymentAllocationRow | null> {
    const { data, error } = await supabase
        .from("payment_allocations")
        .select(ALLOCATION_COLUMNS)
        .eq("org_id", orgId)
        .eq("payment_id", paymentId)
        .eq("charge_id", chargeId)
        .eq("status", "active")
        .maybeSingle();
    if (error) translateDbError(error, "look up existing application");
    return (data as unknown as PaymentAllocationRow | null) ?? null;
}

/**
 * APPLY MONEY TO AN OBLIGATION — the step that changes what is owed.
 *
 * The posted charge is NOT touched. Its principal, its category and its posting stamp stay exactly
 * as posted (the database refuses otherwise), and the balance moves because an application row now
 * exists — which is why the charge's history stays readable after it is paid.
 *
 * ── EXACTLY ONCE ──
 *
 * A retried apply returns the application that already exists. The guarantee is the partial unique
 * index on (payment_id, charge_id) WHERE status = 'active', not the lookup below: two concurrent
 * applies both pass the lookup, and only one passes the index.
 */
export async function applyPaymentToCharge(
    supabase: SupabaseClient,
    input: ApplyPaymentToChargeInput,
): Promise<ApplyPaymentToChargeResult> {
    const orgId = trimOrNull(input.orgId);
    const paymentId = trimOrNull(input.paymentId);
    const chargeId = trimOrNull(input.chargeId);
    if (!orgId || !paymentId || !chargeId) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "orgId, paymentId and chargeId are required",
        );
    }

    const payment = await loadPayment(supabase, orgId, paymentId);
    assertChildcarePayment(payment);
    if (payment.direction !== "inbound") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "an outbound payment is a refund and is not applied to an obligation",
        );
    }
    if (payment.status === "failed" || payment.status === "voided") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `payment ${paymentId} is ${payment.status} and cannot be applied`,
        );
    }

    const existing = await findActiveAllocation(supabase, orgId, paymentId, chargeId);
    if (existing) return { allocation: existing, alreadyApplied: true };

    const charge = await readChargeBalance(supabase, orgId, chargeId);
    if (!isChildcareBillableSource(charge.billableSourceType)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "this service applies payments to childcare charges; a job charge uses the job billing path",
        );
    }

    const unapplied = await readPaymentUnappliedCents(supabase, orgId, paymentId, payment.amount_cents);
    /*
     * THE DEFAULT IS THE SMALLER OF THE TWO CEILINGS, which is what makes a partial payment work
     * without the operator doing arithmetic: pay $500 against a $1,300 charge and $500 applies; pay
     * $2,000 against it and $1,300 applies with $700 left on the account.
     */
    const requested = input.amountCents ?? Math.min(unapplied, charge.outstandingCents);
    assertPositiveIntCents(requested, "amountCents");

    if (requested > unapplied) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `applying ${requested} cents would over-apply payment ${paymentId}: only ${unapplied} cents remain unapplied`,
        );
    }
    if (requested > charge.outstandingCents) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `applying ${requested} cents would over-pay charge ${chargeId}: only ${charge.outstandingCents} cents are outstanding`,
        );
    }

    const now = nowIso();
    const { data, error } = await supabase
        .from("payment_allocations")
        .insert({
            org_id: orgId,
            payment_id: paymentId,
            charge_id: chargeId,
            target_entity_type: ALLOCATION_TARGET_CHARGE,
            target_entity_id: chargeId,
            allocated_amount_cents: requested,
            status: "active",
            allocation_type: "payment_application",
            // The APPLICATION date, which is its own fact and not the date the money arrived.
            allocated_at: now,
            notes: trimOrNull(input.notes),
            metadata: input.metadata ?? {},
            updated_at: now,
            created_by: input.actorUserId ?? null,
            updated_by: input.actorUserId ?? null,
        })
        .select(ALLOCATION_COLUMNS)
        .single();

    if (error) {
        // Lost the race on the one-active-application index: the winner's row is the one that stands.
        if (String(error.message ?? "").includes("uq_payment_allocations_one_active_per_payment_charge")) {
            const winner = await findActiveAllocation(supabase, orgId, paymentId, chargeId);
            if (winner) return { allocation: winner, alreadyApplied: true };
        }
        translateDbError(error, "apply payment");
    }
    return { allocation: data as unknown as PaymentAllocationRow, alreadyApplied: false };
}

export type RecordAndApplyInput = Omit<RecordChildcarePaymentInput, "billableSourceType" | "billableSourceId"> & {
    /** The charge the money is being paid against. Its billable source becomes the payment's. */
    chargeId: string;
    /** Defaults to the whole payment, bounded by what the charge still owes. */
    applyAmountCents?: number;
};

export type RecordAndApplyResult = {
    payment: PaymentRow;
    allocation: PaymentAllocationRow | null;
    alreadyRecorded: boolean;
    alreadyApplied: boolean;
};

/**
 * THE OPERATOR'S ACTUAL INTENT: "this family paid this charge."
 *
 * Recording and applying stay separate operations underneath, because an unapplied payment is a real
 * state and because a refund reverses the application without unmaking the receipt. This composes
 * them for the common case, and is idempotent END TO END: replaying the same request returns the
 * same payment and the same application, and the balance moves once.
 *
 * ── WHY IT CANNOT LEAVE A PAYMENT WITHOUT ITS APPLICATION ──
 *
 * There is no transaction spanning the two writes (the Supabase client has none to offer), so the
 * failure this must survive is: payment written, application refused. It survives it by being
 * REPLAYABLE rather than by being atomic — the payment carries the idempotency key, so the retry
 * finds it instead of writing a second one and then applies. The alternative, deleting the payment
 * on failure, would destroy a record of money that really did arrive.
 */
export async function recordAndApplyChildcarePayment(
    supabase: SupabaseClient,
    input: RecordAndApplyInput,
): Promise<RecordAndApplyResult> {
    const orgId = trimOrNull(input.orgId);
    const chargeId = trimOrNull(input.chargeId);
    if (!orgId || !chargeId) {
        throw new OperationalEnrollmentServiceError("invalid_input", "orgId and chargeId are required");
    }

    const charge = await readChargeBalance(supabase, orgId, chargeId);
    if (!isChildcareBillableSource(charge.billableSourceType)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "this service applies payments to childcare charges; a job charge uses the job billing path",
        );
    }
    if (charge.status === "draft" || charge.status === "void") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `charge ${chargeId} is ${charge.status} and is not owed; post it before recording a payment against it`,
        );
    }

    // The payment is received against the SAME account the charge is billed to. Deriving it rather
    // than accepting it is what stops a payment being recorded against one family and applied to
    // another's obligation.
    const { data: chargeSource, error: sourceError } = await supabase
        .from("charges")
        .select("billable_source_type, billable_source_id")
        .eq("org_id", orgId)
        .eq("id", chargeId)
        .single();
    if (sourceError) translateDbError(sourceError, "resolve charge account");
    const source = chargeSource as { billable_source_type: string; billable_source_id: string };

    const { payment, alreadyRecorded } = await recordChildcarePayment(supabase, {
        ...input,
        orgId,
        billableSourceType: source.billable_source_type as ChildcareBillableSourceType,
        billableSourceId: source.billable_source_id,
    });

    // A pending attempt is recorded and applied to nothing: it is not money yet, and the balance
    // must not move for it.
    if (payment.status !== "posted") {
        return { payment, allocation: null, alreadyRecorded, alreadyApplied: false };
    }

    const { allocation, alreadyApplied } = await applyPaymentToCharge(supabase, {
        orgId,
        paymentId: payment.id,
        chargeId,
        amountCents: input.applyAmountCents,
        actorUserId: input.actorUserId ?? null,
    });

    return { payment, allocation, alreadyRecorded, alreadyApplied };
}

export type RefundChildcarePaymentInput = {
    orgId: string;
    /** The receipt being refunded. It is never modified. */
    paymentId: string;
    /** Defaults to the whole payment. A partial refund is legitimate and repeatable. */
    amountCents?: number;
    reason?: string | null;
    /** The operator recording the refund. */
    actorUserId?: string | null;
    /** Required for a retried refund to be harmless. */
    idempotencyKey?: string | null;
    metadata?: Record<string, unknown>;
};

export type RefundChildcarePaymentResult = {
    /** The NEW outbound row. The original receipt is untouched and returned as `original`. */
    refund: PaymentRow;
    original: PaymentRow;
    /** Applications reversed to give the money back, and any re-application of the remainder. */
    reversedAllocationIds: string[];
    reappliedAllocation: PaymentAllocationRow | null;
    alreadyRefunded: boolean;
};

/**
 * REFUND — the only way money that was received changes.
 *
 * Two things happen, and neither is an edit:
 *
 *   1. A NEW outbound payment row is written pointing at the receipt through `refunds_payment_id`.
 *      The receipt keeps reading exactly as it was received; the database refuses to change it.
 *   2. The APPLICATIONS are reversed by the refunded amount, which is what puts the balance back.
 *      A reversal sets `status = 'reversed'` with `reversed_at` and a reason — the correction shape
 *      the table was designed with — and never deletes the row, so "this money was applied and then
 *      given back" stays legible. For a partial refund the remainder is RE-APPLIED as a new active
 *      row, so the charge still shows the part that was actually kept.
 *
 * The balance is not recomputed here and is not stored anywhere: it is derived from charges and
 * active applications, so reversing an application IS the balance change.
 */
export async function refundChildcarePayment(
    supabase: SupabaseClient,
    input: RefundChildcarePaymentInput,
): Promise<RefundChildcarePaymentResult> {
    const orgId = trimOrNull(input.orgId);
    const paymentId = trimOrNull(input.paymentId);
    if (!orgId || !paymentId) {
        throw new OperationalEnrollmentServiceError("invalid_input", "orgId and paymentId are required");
    }

    const original = await loadPayment(supabase, orgId, paymentId);
    assertChildcarePayment(original);
    if (original.direction !== "inbound") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `payment ${paymentId} is outbound and is itself a refund; record the refund against the original receipt`,
        );
    }
    if (original.status !== "posted") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `payment ${paymentId} is ${original.status}; only money that was actually received can be refunded`,
        );
    }

    const idempotencyKey = trimOrNull(input.idempotencyKey);
    if (idempotencyKey) {
        const existing = await findByIdempotencyKey(supabase, orgId, idempotencyKey);
        if (existing) {
            return {
                refund: existing,
                original,
                reversedAllocationIds: [],
                reappliedAllocation: null,
                alreadyRefunded: true,
            };
        }
    }

    const amountCents = input.amountCents ?? original.amount_cents;
    assertPositiveIntCents(amountCents, "amountCents");
    if (amountCents > original.amount_cents) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            `refunding ${amountCents} cents exceeds the ${original.amount_cents} cents received`,
        );
    }

    const now = nowIso();
    const reason = trimOrNull(input.reason) ?? `refund of payment ${original.id}`;

    /*
     * THE REFUND ROW FIRST. Its trigger holds the receipt under lock while it sums the refunds that
     * already exist, so two concurrent refunds cannot each believe the full amount is still
     * available. Reversing the applications before that check would give money back for a refund the
     * database was about to refuse.
     */
    const { data: refundData, error: refundError } = await supabase
        .from("payments")
        .insert({
            org_id: orgId,
            job_id: null,
            customer_id: original.customer_id,
            billable_source_type: original.billable_source_type,
            billable_source_id: original.billable_source_id,
            refunds_payment_id: original.id,
            idempotency_key: idempotencyKey,
            amount_cents: amountCents,
            currency: original.currency,
            status: "posted",
            direction: "outbound",
            payment_method: original.payment_method,
            processor: original.processor,
            // A refund is its own provider transaction, never a second row claiming the original's.
            processor_transaction_id: null,
            reference_number: original.reference_number,
            received_at: now,
            posted_at: now,
            notes: reason,
            metadata: { ...(input.metadata ?? {}), refunds_payment_id: original.id, reason },
            updated_at: now,
            created_by: input.actorUserId ?? null,
            updated_by: input.actorUserId ?? null,
        })
        .select(PAYMENT_COLUMNS)
        .single();
    if (refundError) translateDbError(refundError, "record refund");
    const refund = refundData as unknown as PaymentRow;

    /*
     * GIVE THE MONEY BACK ON THE BALANCE. Applications are reversed oldest-first up to the refunded
     * amount. The one that straddles the boundary is reversed in full and its kept remainder is
     * re-applied as a NEW active row, because an active application's amount is not edited in place
     * — that would rewrite what was applied rather than record what changed.
     */
    const { data: allocData, error: allocError } = await supabase
        .from("payment_allocations")
        .select(ALLOCATION_COLUMNS)
        .eq("org_id", orgId)
        .eq("payment_id", original.id)
        .eq("status", "active")
        .order("allocated_at", { ascending: true });
    if (allocError) translateDbError(allocError, "load applications to reverse");

    const active = (allocData ?? []) as unknown as PaymentAllocationRow[];
    const reversedAllocationIds: string[] = [];
    let reappliedAllocation: PaymentAllocationRow | null = null;
    let remaining = amountCents;

    for (const alloc of active) {
        if (remaining <= 0) break;
        const allocAmount = Number(alloc.allocated_amount_cents) || 0;

        const { error: reverseError } = await supabase
            .from("payment_allocations")
            .update({
                status: "reversed",
                reversed_at: now,
                reversal_reason: reason,
                updated_at: now,
                updated_by: input.actorUserId ?? null,
            })
            .eq("org_id", orgId)
            .eq("id", alloc.id)
            .eq("status", "active");
        if (reverseError) translateDbError(reverseError, "reverse application");
        reversedAllocationIds.push(alloc.id);

        if (allocAmount > remaining) {
            // Part of this application survives the refund. It is re-applied, not edited.
            const keep = allocAmount - remaining;
            const { data: reapplied, error: reapplyError } = await supabase
                .from("payment_allocations")
                .insert({
                    org_id: orgId,
                    payment_id: original.id,
                    charge_id: alloc.charge_id,
                    target_entity_type: alloc.target_entity_type,
                    target_entity_id: alloc.target_entity_id,
                    allocated_amount_cents: keep,
                    status: "active",
                    allocation_type: "payment_application",
                    allocated_at: now,
                    notes: `remainder after partial refund of payment ${original.id}`,
                    metadata: {
                        ...(alloc.metadata ?? {}),
                        reapplied_after_refund_of: refund.id,
                        supersedes_allocation_id: alloc.id,
                    },
                    updated_at: now,
                    created_by: input.actorUserId ?? null,
                    updated_by: input.actorUserId ?? null,
                })
                .select(ALLOCATION_COLUMNS)
                .single();
            if (reapplyError) translateDbError(reapplyError, "re-apply remainder after partial refund");
            reappliedAllocation = reapplied as unknown as PaymentAllocationRow;
            remaining = 0;
            break;
        }
        remaining -= allocAmount;
    }

    return { refund, original, reversedAllocationIds, reappliedAllocation, alreadyRefunded: false };
}
