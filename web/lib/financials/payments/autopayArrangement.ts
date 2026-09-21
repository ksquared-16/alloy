/**
 * AUTOPAY — the single authority over a payer's standing consent.
 *
 * Every write to `payment_autopay_arrangements` goes through here, for the same reason every write
 * to `payment_methods` goes through `paymentMethodService`: consent is the permission that lets the
 * organisation take money while nobody is watching, and a second writer would eventually create one
 * without the checks below.
 *
 * ── WHAT THIS MODULE REFUSES TO DECIDE ──
 *
 * It does not know what is owed. It does not know when anything is due. It holds no money figure
 * except the ceiling the payer authorized. Those belong to Financials and to the generic Scheduled
 * Work runtime respectively, and the handler is where the three meet.
 *
 * ── THE RULE THAT MOTIVATES THE WHOLE FILE ──
 *
 * A SAVED PAYMENT METHOD IS NOT AUTOPAY CONSENT. W2 lets a family store an instrument so they can
 * be charged when they ask. Autopay says the organisation may charge it when they have not asked.
 * Enrolling therefore requires an explicit act that names the payer, the method, the period, the
 * policy and any ceiling — and records who recorded it and when.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { AUTOPAY_HANDLER_KEY } from "@/lib/scheduledWork/scheduledWorkHandlerKeys";

const TABLE = "payment_autopay_arrangements";
const SCHEDULE_TABLE = "scheduled_work";

/** Live means "may still collect, now or later". Revoked and failed are history. */
export const LIVE_AUTOPAY_STATUSES = ["active", "paused"] as const;

export type AutopayStatus = "active" | "paused" | "revoked" | "failed";

export type AutopayArrangement = {
    id: string;
    orgId: string;
    customerId: string;
    payerEntityType: string;
    payerEntityId: string;
    paymentMethodId: string;
    status: AutopayStatus;
    authorizedBy: string;
    authorizedAt: string;
    authorizationRef: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    amountPolicy: "amount_due";
    maxAmountCents: number | null;
    timingPolicy: "on_due_date";
    timingOffsetDays: number;
    retryPolicy: "standard_v1";
    failureCount: number;
    lastAttemptAt: string | null;
    lastFailureReason: string | null;
    revokedAt: string | null;
    metadata: Record<string, unknown>;
};

/**
 * Why an autopay write was refused, in the vocabulary the operator surface renders.
 *
 * Deliberately parallel to W3's `CollectionRefusalReason`: a refusal is an outcome with a name, not
 * an exception to be caught and flattened into "something went wrong".
 */
export type AutopayRefusalReason =
    | "arrangement_not_found"
    | "already_enrolled"
    | "method_not_found"
    | "method_not_usable"
    | "method_wrong_account"
    | "method_payer_mismatch"
    | "invalid_effective_window"
    | "invalid_max_amount"
    | "invalid_timing_offset"
    | "not_live"
    | "not_paused"
    | "already_revoked"
    | "cannot_resume_failed"
    | "write_failed";

export type AutopayResult<T> = { ok: true; value: T } | { ok: false; reason: AutopayRefusalReason; message: string };

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function mapRow(row: Record<string, unknown>): AutopayArrangement {
    return {
        id: t(row.id),
        orgId: t(row.org_id),
        customerId: t(row.customer_id),
        payerEntityType: t(row.payer_entity_type) || "person",
        payerEntityId: t(row.payer_entity_id),
        paymentMethodId: t(row.payment_method_id),
        status: (t(row.status) || "active") as AutopayStatus,
        authorizedBy: t(row.authorized_by),
        authorizedAt: t(row.authorized_at),
        authorizationRef: t(row.authorization_ref) || null,
        effectiveFrom: t(row.effective_from),
        effectiveTo: t(row.effective_to) || null,
        amountPolicy: "amount_due",
        maxAmountCents: row.max_amount_cents == null ? null : Number(row.max_amount_cents),
        timingPolicy: "on_due_date",
        timingOffsetDays: Number(row.timing_offset_days ?? 0),
        retryPolicy: "standard_v1",
        failureCount: Number(row.failure_count ?? 0),
        lastAttemptAt: t(row.last_attempt_at) || null,
        lastFailureReason: t(row.last_failure_reason) || null,
        revokedAt: t(row.revoked_at) || null,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
    };
}

const SELECT_COLUMNS =
    "id, org_id, customer_id, payer_entity_type, payer_entity_id, payment_method_id, status, "
    + "authorized_by, authorized_at, authorization_ref, effective_from, effective_to, amount_policy, "
    + "max_amount_cents, timing_policy, timing_offset_days, retry_policy, failure_count, "
    + "last_attempt_at, last_failure_reason, revoked_at, metadata";

/**
 * The live arrangement for an account, or null.
 *
 * At most one can exist — the partial unique index guarantees it — so this returns a single row
 * rather than a list. A caller that expected several would be describing a world where two
 * authorizations each collect the whole balance.
 */
export async function readLiveArrangement(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string },
): Promise<AutopayArrangement | null> {
    const orgId = t(args.orgId);
    const customerId = t(args.customerId);
    if (!orgId || !customerId) return null;

    const { data, error } = await supabase
        .from(TABLE)
        .select(SELECT_COLUMNS)
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .in("status", [...LIVE_AUTOPAY_STATUSES])
        .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
}

export async function readArrangementById(
    supabase: SupabaseClient,
    args: { orgId: string; arrangementId: string },
): Promise<AutopayArrangement | null> {
    const orgId = t(args.orgId);
    const id = t(args.arrangementId);
    if (!orgId || !id) return null;
    const { data, error } = await supabase
        .from(TABLE)
        .select(SELECT_COLUMNS)
        .eq("org_id", orgId)
        .eq("id", id)
        .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as unknown as Record<string, unknown>);
}

/**
 * THE METHOD CHECK, and why the payer is part of it.
 *
 * W3 established that a stored method belongs to a payer, and that collecting with it while
 * claiming a different payer is `method_payer_mismatch`. Autopay makes that worse if unchecked:
 * an operator could authorize a grandparent's card under a parent's name, and every future
 * collection would carry the wrong payer provenance with nobody present to notice.
 */
async function validateMethodForPayer(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string; paymentMethodId: string; payerEntityId: string },
): Promise<AutopayResult<{ rail: "card" | "ach" }>> {
    const { data, error } = await supabase
        .from("payment_methods")
        .select("id, org_id, customer_id, payer_entity_id, usability_state, rail")
        .eq("org_id", args.orgId)
        .eq("id", args.paymentMethodId)
        .maybeSingle();
    if (error) return { ok: false, reason: "write_failed", message: "The payment method could not be read." };
    const row = data as Record<string, unknown> | null;
    if (!row) {
        return { ok: false, reason: "method_not_found", message: "That payment method does not exist." };
    }
    if (t(row.customer_id) && t(row.customer_id) !== args.customerId) {
        return {
            ok: false,
            reason: "method_wrong_account",
            message: "That payment method belongs to a different account.",
        };
    }
    if (t(row.payer_entity_id) !== args.payerEntityId) {
        return {
            ok: false,
            reason: "method_payer_mismatch",
            message: "That payment method belongs to a different payer.",
        };
    }
    if (t(row.usability_state) !== "usable") {
        return {
            ok: false,
            reason: "method_not_usable",
            message: "That payment method cannot be charged; replace it before setting up Autopay.",
        };
    }
    return { ok: true, value: { rail: t(row.rail) === "ach" ? "ach" : "card" } };
}

export type EnrollAutopayInput = {
    orgId: string;
    customerId: string;
    payerEntityId: string;
    paymentMethodId: string;
    /** The Alloy user recording the consent. Never the payer themselves. */
    authorizedBy: string;
    /** What makes the consent auditable outside Alloy — a mandate id, a signed record. */
    authorizationRef?: string | null;
    effectiveFrom: string;
    effectiveTo?: string | null;
    maxAmountCents?: number | null;
    timingOffsetDays?: number;
    metadata?: Record<string, unknown>;
};

/**
 * Record a new standing authorization.
 *
 * Refuses rather than replaces when one is already live: silently superseding an existing consent
 * would destroy the record of what the payer previously agreed to, and the caller has to revoke
 * deliberately first.
 */
export async function enrollAutopay(
    supabase: SupabaseClient,
    input: EnrollAutopayInput,
): Promise<AutopayResult<AutopayArrangement>> {
    const orgId = t(input.orgId);
    const customerId = t(input.customerId);
    const payerEntityId = t(input.payerEntityId);
    const paymentMethodId = t(input.paymentMethodId);

    if (input.maxAmountCents != null && (!Number.isInteger(input.maxAmountCents) || input.maxAmountCents <= 0)) {
        return {
            ok: false,
            reason: "invalid_max_amount",
            message: "An authorized maximum must be a whole number of cents above zero.",
        };
    }
    const offset = input.timingOffsetDays ?? 0;
    if (!Number.isInteger(offset) || offset < -30 || offset > 30) {
        return {
            ok: false,
            reason: "invalid_timing_offset",
            message: "The timing offset must be a whole number of days between -30 and 30.",
        };
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
        return {
            ok: false,
            reason: "invalid_effective_window",
            message: "The authorization cannot end before it begins.",
        };
    }

    const existing = await readLiveArrangement(supabase, { orgId, customerId });
    if (existing) {
        return {
            ok: false,
            reason: "already_enrolled",
            message: "This account already has an Autopay authorization. Turn it off before setting up a new one.",
        };
    }

    const method = await validateMethodForPayer(supabase, { orgId, customerId, paymentMethodId, payerEntityId });
    if (!method.ok) return method;

    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            org_id: orgId,
            customer_id: customerId,
            payer_entity_type: "person",
            payer_entity_id: payerEntityId,
            payment_method_id: paymentMethodId,
            status: "active",
            authorized_by: t(input.authorizedBy),
            authorization_ref: t(input.authorizationRef) || null,
            effective_from: input.effectiveFrom,
            effective_to: input.effectiveTo ?? null,
            amount_policy: "amount_due",
            max_amount_cents: input.maxAmountCents ?? null,
            timing_policy: "on_due_date",
            timing_offset_days: offset,
            retry_policy: "standard_v1",
            metadata: input.metadata ?? {},
        })
        .select(SELECT_COLUMNS)
        .maybeSingle();

    if (error || !data) {
        // The unique index is the last word on double enrollment even if the read above raced.
        const message = /uq_autopay_one_live_per_account/.test(error?.message ?? "")
            ? "This account already has an Autopay authorization."
            : "The Autopay authorization could not be recorded.";
        const reason: AutopayRefusalReason = /uq_autopay_one_live_per_account/.test(error?.message ?? "")
            ? "already_enrolled"
            : "write_failed";
        return { ok: false, reason, message };
    }
    const arrangement = mapRow(data as unknown as Record<string, unknown>);
    /*
     * The consent exists; now make it wakeable. Without this the arrangement would sit `active`
     * forever and collect nothing — the exact silent failure W5 stopped for.
     *
     * If the schedule cannot be created, the authorization is real and unusable. That is recorded
     * ON the arrangement rather than swallowed, so the surface says it needs attention instead of
     * saying "Autopay on" about something that will never run. The enrollment is not rolled back:
     * the payer did authorize this, and a revocation record would misdescribe what happened.
     */
    const scheduleId = await ensureAutopaySchedule(supabase, arrangement);
    if (!scheduleId) {
        const reason = "Autopay was authorized but could not be scheduled; turn it off and set it up again.";
        await supabase
            .from(TABLE)
            .update({ last_failure_reason: reason, updated_at: new Date().toISOString() })
            .eq("org_id", orgId)
            .eq("id", arrangement.id);
        return { ok: true, value: { ...arrangement, lastFailureReason: reason } };
    }
    return { ok: true, value: arrangement };
}

/** Status-only lifecycle write. The immutability trigger guarantees terms cannot ride along. */
async function setStatus(
    supabase: SupabaseClient,
    args: { orgId: string; arrangementId: string; status: AutopayStatus; extra?: Record<string, unknown> },
): Promise<AutopayResult<AutopayArrangement>> {
    const { data, error } = await supabase
        .from(TABLE)
        .update({ status: args.status, updated_at: new Date().toISOString(), ...(args.extra ?? {}) })
        .eq("org_id", args.orgId)
        .eq("id", args.arrangementId)
        .select(SELECT_COLUMNS)
        .maybeSingle();
    if (error || !data) {
        return { ok: false, reason: "write_failed", message: "The Autopay arrangement could not be updated." };
    }
    return { ok: true, value: mapRow(data as unknown as Record<string, unknown>) };
}

/**
 * PAUSE — stop future collection without discarding the authorization.
 *
 * An in-flight collection attempt is deliberately untouched. Money already handed to the provider
 * has its own truth, and pretending a pause reaches back into a submitted ACH debit would be a lie
 * the bank does not share.
 */
export async function pauseAutopay(
    supabase: SupabaseClient,
    args: { orgId: string; arrangementId: string },
): Promise<AutopayResult<AutopayArrangement>> {
    const current = await readArrangementById(supabase, args);
    if (!current) return { ok: false, reason: "arrangement_not_found", message: "That Autopay arrangement does not exist." };
    if (current.status !== "active") {
        return { ok: false, reason: "not_live", message: "Only an active Autopay arrangement can be paused." };
    }
    return setStatus(supabase, { ...args, status: "paused" });
}

/**
 * RESUME — restore future eligibility, and NOTHING ELSE.
 *
 * No catch-up. Periods that passed while paused were deliberately not collected, and inventing
 * retrospective charges would turn a pause into a deferral the payer never agreed to.
 *
 * The method is revalidated here because it may have expired during the pause, and resuming onto a
 * dead instrument would produce a failure at the next wake instead of an answer now.
 */
export async function resumeAutopay(
    supabase: SupabaseClient,
    args: { orgId: string; arrangementId: string },
): Promise<AutopayResult<AutopayArrangement>> {
    const current = await readArrangementById(supabase, args);
    if (!current) return { ok: false, reason: "arrangement_not_found", message: "That Autopay arrangement does not exist." };
    if (current.status === "failed") {
        return {
            ok: false,
            reason: "cannot_resume_failed",
            message: "This arrangement failed and needs a new authorization rather than a resume.",
        };
    }
    if (current.status !== "paused") {
        return { ok: false, reason: "not_paused", message: "Only a paused Autopay arrangement can be resumed." };
    }
    const method = await validateMethodForPayer(supabase, {
        orgId: current.orgId,
        customerId: current.customerId,
        paymentMethodId: current.paymentMethodId,
        payerEntityId: current.payerEntityId,
    });
    if (!method.ok) return method;
    return setStatus(supabase, { ...args, status: "active" });
}

/**
 * REVOKE — terminal for this authorization.
 *
 * The trigger refuses any later return to active, so restarting Autopay means a new row with its
 * own `authorized_at`. That is the point: the new consent is a new fact, and the old one remains
 * readable exactly as it was given.
 */
export async function revokeAutopay(
    supabase: SupabaseClient,
    args: { orgId: string; arrangementId: string; reason?: string | null },
): Promise<AutopayResult<AutopayArrangement>> {
    const current = await readArrangementById(supabase, args);
    if (!current) return { ok: false, reason: "arrangement_not_found", message: "That Autopay arrangement does not exist." };
    if (current.status === "revoked") {
        return { ok: false, reason: "already_revoked", message: "That Autopay authorization was already turned off." };
    }
    const outcome = await setStatus(supabase, {
        ...args,
        status: "revoked",
        extra: { revoked_at: new Date().toISOString(), last_failure_reason: t(args.reason) || null },
    });
    if (outcome.ok) await deactivateAutopaySchedule(supabase, args);
    return outcome;
}

/**
 * Mark an arrangement unable to continue.
 *
 * Used by the handler when the retry budget is spent, and by the method-invalidation convergence
 * when the instrument behind the consent dies. Failure is NOT revocation: the payer did not
 * withdraw anything, so the two states read differently to an operator and only one of them is
 * the payer's doing.
 */
export async function failAutopay(
    supabase: SupabaseClient,
    args: { orgId: string; arrangementId: string; reason: string },
): Promise<AutopayResult<AutopayArrangement>> {
    const outcome = await setStatus(supabase, {
        orgId: args.orgId,
        arrangementId: args.arrangementId,
        status: "failed",
        extra: { last_failure_reason: args.reason.slice(0, 300) },
    });
    // A failed arrangement cannot collect, so it must stop being asked.
    if (outcome.ok) {
        await deactivateAutopaySchedule(supabase, { orgId: args.orgId, arrangementId: args.arrangementId });
    }
    return outcome;
}

/**
 * Attempt telemetry. Separate from lifecycle so recording a try never moves the status by accident.
 *
 * ── WHY `first_failure_at` IS STAMPED HERE ──
 *
 * The 40-day retry ceiling is measured from the FIRST failure, not the most recent one. Measuring
 * from the most recent would make the window slide forward with every attempt and never expire —
 * a family who left in October could still be charged in December, which is exactly what the
 * ceiling exists to prevent. Nothing else writes this, so it is stamped on the transition from
 * zero failures to one and left alone afterwards.
 */
export async function recordAutopayAttempt(
    supabase: SupabaseClient,
    args: {
        orgId: string; arrangementId: string; at: string; failureReason?: string | null;
        incrementFailure: boolean; failureCount: number;
        /** The arrangement's current metadata, so the stamp is added rather than replacing it. */
        metadata?: Record<string, unknown>;
    },
): Promise<void> {
    const patch: Record<string, unknown> = {
        last_attempt_at: args.at,
        last_failure_reason: t(args.failureReason) || null,
        failure_count: args.incrementFailure ? args.failureCount + 1 : args.failureCount,
        updated_at: new Date().toISOString(),
    };

    const metadata = args.metadata ?? {};
    if (args.incrementFailure && !t(metadata.first_failure_at)) {
        patch.metadata = { ...metadata, first_failure_at: args.at };
    }

    await supabase
        .from(TABLE)
        .update(patch)
        .eq("org_id", args.orgId)
        .eq("id", args.arrangementId);
}

/**
 * METHOD INVALIDATION CONVERGENCE.
 *
 * W3 established that an ACH return invalidates the mandate and makes the canonical method
 * unusable. A live arrangement standing on that method can no longer execute, and leaving it
 * `active` would mean the surface says Autopay is on while every wake refuses.
 *
 * Derived from the method's own state rather than duplicated: the caller tells us WHICH method
 * died, and this finds what depended on it. No fallback to another instrument — the payer
 * authorized one, and choosing a different one on their behalf is not a consent Alloy holds.
 */
export async function failArrangementsForMethod(
    supabase: SupabaseClient,
    args: { orgId: string; paymentMethodId: string; reason: string },
): Promise<string[]> {
    const { data } = await supabase
        .from(TABLE)
        .select("id")
        .eq("org_id", args.orgId)
        .eq("payment_method_id", args.paymentMethodId)
        .in("status", [...LIVE_AUTOPAY_STATUSES]);

    const ids = ((data ?? []) as Array<{ id?: unknown }>).map((r) => t(r.id)).filter(Boolean);
    for (const id of ids) {
        await failAutopay(supabase, { orgId: args.orgId, arrangementId: id, reason: args.reason });
    }
    return ids;
}


/**
 * REGISTER THE ARRANGEMENT WITH THE GENERIC CLOCK — the step without which Autopay never happens.
 *
 * Payments does not own a timer. It owns an opinion about when it is worth being asked, and the
 * answer for `on_due_date` is DAILY: charges fall due on ordinary calendar days, so the handler is
 * woken each day and decides for itself whether anything has actually come due. That decision is
 * Payments', and the schedule carries none of it — `scheduled_work` holds a cadence and an opaque
 * reference, and would not know a due date if it saw one.
 *
 * A cheap daily wake that answers "nothing due" is deliberately preferred to a schedule that tries
 * to predict the next due date: predicting it means storing it, storing it means a snapshot, and a
 * snapshot of when money is owed is the same class of mistake as a snapshot of how much.
 *
 * `domain_ref` carries ONLY the arrangement id. Everything else the handler needs it re-reads, so
 * nothing it acts on can be stale.
 */
export async function ensureAutopaySchedule(
    supabase: SupabaseClient,
    arrangement: AutopayArrangement,
): Promise<string | null> {
    const existing = await supabase
        .from(SCHEDULE_TABLE)
        .select("id")
        .eq("org_id", arrangement.orgId)
        .eq("handler_key", AUTOPAY_HANDLER_KEY)
        .eq("domain_ref->>arrangement_id", arrangement.id)
        .maybeSingle();
    const existingId = t((existing.data as { id?: unknown } | null)?.id);
    if (existingId) {
        // Re-activating rather than inserting: a second schedule on one arrangement would wake the
        // handler twice a day, and only the occurrence identity would stop the second collection.
        await supabase
            .from(SCHEDULE_TABLE)
            .update({ is_active: true, next_due_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", existingId);
        return existingId;
    }

    const { data } = await supabase
        .from(SCHEDULE_TABLE)
        .insert({
            org_id: arrangement.orgId,
            handler_key: AUTOPAY_HANDLER_KEY,
            recurrence_kind: "daily",
            next_due_at: new Date(`${arrangement.effectiveFrom}T00:00:00.000Z`).toISOString(),
            is_active: true,
            domain_ref: { arrangement_id: arrangement.id },
            label: "Autopay",
            created_by: arrangement.authorizedBy || null,
        })
        .select("id")
        .maybeSingle();
    return t((data as { id?: unknown } | null)?.id) || null;
}

/**
 * Stop waking for this arrangement.
 *
 * The handler would wind the schedule down by itself on its next wake, but doing it here means a
 * revoked authorization stops being asked about immediately rather than one day later. Both paths
 * exist because only one of them survives a revoke that happens while the runtime is mid-flight.
 */
export async function deactivateAutopaySchedule(
    supabase: SupabaseClient,
    args: { orgId: string; arrangementId: string },
): Promise<void> {
    await supabase
        .from(SCHEDULE_TABLE)
        .update({ is_active: false, next_due_at: null, updated_at: new Date().toISOString() })
        .eq("org_id", args.orgId)
        .eq("handler_key", AUTOPAY_HANDLER_KEY)
        .eq("domain_ref->>arrangement_id", args.arrangementId);
}
