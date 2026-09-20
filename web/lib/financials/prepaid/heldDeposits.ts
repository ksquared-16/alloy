import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * HELD DEPOSITS — a restriction over money that already exists.
 *
 * The distinction W4 exists for: **received money is not available money.** A family's deposit is a
 * canonical Payment the moment it arrives; what a hold adds is that some of that receipt may not be
 * spent against ordinary obligations yet.
 *
 *     unapplied = amount − active allocations − refunded      (already canonical, not ours)
 *     held      = what these lots restrict
 *     available = unapplied − held
 *
 * ── THIS MODULE CREATES NO MONEY AND NO SECOND SPINE ──
 *
 * No deposit payment, no wallet, no balance, no second prepaid store, no second ledger, no second
 * allocation table. Holding moves nothing; releasing moves nothing. Applying held money goes through
 * the ORDINARY allocation authority and refunding it through the ORDINARY refund authority — a hold
 * only stops being a restriction first.
 *
 * ── A HOLD IS AN IMMUTABLE LOT ──
 *
 * Releasing $200 of a $500 hold must not leave a $300 hold and no trace of the $500. So the lot is
 * never decremented: the remaining amount is derived from append-only dispositions, and the database
 * refuses both an in-place amount change and any rewrite of a disposition.
 */

export type HoldDispositionKind = "released" | "applied" | "refunded";

export type HoldDisposition = {
    id: string;
    kind: HoldDispositionKind;
    amountCents: number;
    allocationId: string | null;
    refundPaymentId: string | null;
    reason: string | null;
    disposedAt: string | null;
    disposedBy: string | null;
};

export type HeldDeposit = {
    id: string;
    orgId: string;
    paymentId: string;
    /** What was ORIGINALLY held. Immutable, and never the remaining amount. */
    originalAmountCents: number;
    /** What is still restricted: original minus every disposition. */
    remainingCents: number;
    releasedCents: number;
    appliedCents: number;
    refundedCents: number;
    /** The terms this money was taken under. Not the organisation's CURRENT policy. */
    refundable: boolean;
    refundableTerms: Record<string, unknown>;
    policyId: string | null;
    reason: string | null;
    heldAt: string | null;
    createdBy: string | null;
    dispositions: HoldDisposition[];
    /** Derived, never stored — a flag would be one more thing that can disagree with the rows. */
    open: boolean;
};

const HOLD_COLUMNS =
    "id, org_id, payment_id, amount_cents, refundable, refundable_terms, policy_id, reason, "
    + "held_at, created_by, metadata";

const DISPOSITION_COLUMNS =
    "id, hold_id, kind, amount_cents, allocation_id, refund_payment_id, reason, disposed_at, disposed_by";

const t = (v: unknown): string => (v != null ? String(v).trim() : "");
const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Every hold on these payments, with its dispositions folded in.
 *
 * Two reads rather than a join, because the fold is what produces `remainingCents` and doing it in
 * SQL would put the derivation in two places — here and in the invariant trigger — where they could
 * drift. The trigger is the boundary that must be right; this is the reader that must agree with it.
 */
export async function readHoldsForPayments(
    supabase: SupabaseClient,
    args: { orgId: string; paymentIds: readonly string[] },
): Promise<HeldDeposit[]> {
    const orgId = t(args.orgId);
    const paymentIds = [...new Set(args.paymentIds.map(t).filter(Boolean))];
    if (!orgId || !paymentIds.length) return [];

    const { data: holdRows, error } = await supabase
        .from("payment_holds")
        .select(HOLD_COLUMNS)
        .eq("org_id", orgId)
        .in("payment_id", paymentIds)
        .order("held_at", { ascending: true });

    if (error || !holdRows) return [];
    const holds = holdRows as unknown as Array<Record<string, unknown>>;
    if (!holds.length) return [];

    const { data: dispRows } = await supabase
        .from("payment_hold_dispositions")
        .select(DISPOSITION_COLUMNS)
        .eq("org_id", orgId)
        .in("hold_id", holds.map((h) => String(h.id)))
        .order("disposed_at", { ascending: true });

    const byHold = new Map<string, HoldDisposition[]>();
    for (const d of ((dispRows ?? []) as unknown as Array<Record<string, unknown>>)) {
        const list = byHold.get(String(d.hold_id)) ?? [];
        list.push({
            id: t(d.id),
            kind: t(d.kind) as HoldDispositionKind,
            amountCents: n(d.amount_cents),
            allocationId: t(d.allocation_id) || null,
            refundPaymentId: t(d.refund_payment_id) || null,
            reason: t(d.reason) || null,
            disposedAt: t(d.disposed_at) || null,
            disposedBy: t(d.disposed_by) || null,
        });
        byHold.set(String(d.hold_id), list);
    }

    return holds.map((h) => {
        const dispositions = byHold.get(String(h.id)) ?? [];
        const sum = (kind: HoldDispositionKind) =>
            dispositions.filter((d) => d.kind === kind).reduce((a, d) => a + d.amountCents, 0);
        const released = sum("released");
        const applied = sum("applied");
        const refunded = sum("refunded");
        const original = n(h.amount_cents);
        const remaining = original - released - applied - refunded;
        return {
            id: t(h.id),
            orgId: t(h.org_id),
            paymentId: t(h.payment_id),
            originalAmountCents: original,
            remainingCents: remaining,
            releasedCents: released,
            appliedCents: applied,
            refundedCents: refunded,
            refundable: h.refundable === true,
            refundableTerms: (h.refundable_terms ?? {}) as Record<string, unknown>,
            policyId: t(h.policy_id) || null,
            reason: t(h.reason) || null,
            heldAt: t(h.held_at) || null,
            createdBy: t(h.created_by) || null,
            dispositions,
            open: remaining > 0,
        };
    });
}

/** What is still restricted on one payment. The figure `available = unapplied − held` subtracts. */
export function heldCentsFor(paymentId: string, holds: readonly HeldDeposit[]): number {
    return holds
        .filter((h) => h.paymentId === paymentId && h.remainingCents > 0)
        .reduce((a, h) => a + h.remainingCents, 0);
}

export type HoldRefusal =
    | "payment_not_found"
    | "not_holdable"
    | "invalid_amount"
    | "exceeds_unapplied"
    | "write_failed";

export type CreateHoldResult =
    | { ok: true; hold: HeldDeposit }
    | { ok: false; reason: HoldRefusal; message: string };

/**
 * Restrict part of a canonical receipt.
 *
 * Eligibility is re-resolved SERVER-SIDE from the payment id: the browser expresses an intention and
 * authors none of the economics. The final bound is not this function's — the database refuses a
 * hold that would exceed the unapplied remainder, with the payment row locked, because two
 * concurrent holds both pass a read-then-write check.
 */
export async function createPaymentHold(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        paymentId: string;
        amountCents: number;
        refundable: boolean;
        refundableTerms?: Record<string, unknown>;
        policyId?: string | null;
        reason?: string | null;
        actorUserId?: string | null;
    },
): Promise<CreateHoldResult> {
    const orgId = t(args.orgId);
    const paymentId = t(args.paymentId);
    if (!orgId || !paymentId) {
        return { ok: false, reason: "payment_not_found", message: "No payment was named." };
    }
    if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) {
        return { ok: false, reason: "invalid_amount", message: "An amount to hold must be a positive whole number of cents." };
    }

    const { data: payRow } = await supabase
        .from("payments")
        .select("id, amount_cents, status, direction, refunds_payment_id, currency")
        .eq("org_id", orgId)
        .eq("id", paymentId)
        .maybeSingle();
    const payment = payRow as {
        id: string; amount_cents: number; status: string; direction: string;
        refunds_payment_id: string | null; currency: string;
    } | null;

    /* A payment in another organisation reads as absent, not as forbidden. */
    if (!payment) {
        return { ok: false, reason: "payment_not_found", message: "That payment is not in this organization." };
    }

    /*
     * ONLY CANONICAL MONEY CAN BE HELD.
     *
     * Not a collection attempt, not processing provider money, not a refund. Holding money that has
     * not actually arrived would let an operator promise a family a deposit the bank may still
     * reject.
     */
    if (payment.direction !== "inbound" || payment.refunds_payment_id) {
        return { ok: false, reason: "not_holdable", message: "That row is a refund, not money received." };
    }
    if (payment.status !== "posted") {
        return {
            ok: false,
            reason: "not_holdable",
            message:
                payment.status === "pending"
                    ? "This payment has not arrived yet, so there is nothing to hold."
                    : `Only money that actually arrived can be held; this payment is ${payment.status}.`,
        };
    }

    const insert: Record<string, unknown> = {
        org_id: orgId,
        payment_id: paymentId,
        amount_cents: args.amountCents,
        refundable: args.refundable,
        /* SNAPSHOT. The organisation's policy may change; these terms do not. */
        refundable_terms: args.refundableTerms ?? {},
        policy_id: t(args.policyId) || null,
        reason: t(args.reason) || null,
        created_by: args.actorUserId ?? null,
    };

    const { data, error } = await supabase.from("payment_holds").insert(insert).select(HOLD_COLUMNS).maybeSingle();

    if (error) {
        /* The database's invariant, surfaced in operator language rather than as a constraint name. */
        if (/would exceed the unapplied money/i.test(error.message)) {
            return {
                ok: false,
                reason: "exceeds_unapplied",
                message: "There is not that much unspent money left on this payment to hold.",
            };
        }
        return { ok: false, reason: "write_failed", message: error.message };
    }
    if (!data) return { ok: false, reason: "write_failed", message: "the hold could not be created" };

    const [hold] = await readHoldsForPayments(supabase, { orgId, paymentIds: [paymentId] })
        .then((all) => all.filter((h) => h.id === String((data as unknown as { id: string }).id)));
    return { ok: true, hold: hold! };
}

export type DisposeRefusal =
    | "hold_not_found"
    | "invalid_amount"
    | "exceeds_remaining"
    | "not_refundable"
    | "write_failed";

export type DisposeResult =
    | { ok: true; hold: HeldDeposit; disposedCents: number }
    | { ok: false; reason: DisposeRefusal; message: string };

/**
 * Record what became of some held money.
 *
 * The single writer for all three outcomes, because they differ only in what they name: a release
 * names nothing, an application names its allocation, a refund names its outbound payment. Making
 * them three functions would make it three places to forget the bound.
 *
 * It does NOT perform the allocation or the refund — those belong to their own canonical
 * authorities. This records that the money stopped being restricted in order to become them.
 */
export async function disposeHold(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        holdId: string;
        kind: HoldDispositionKind;
        amountCents: number;
        allocationId?: string | null;
        refundPaymentId?: string | null;
        reason?: string | null;
        actorUserId?: string | null;
    },
): Promise<DisposeResult> {
    const orgId = t(args.orgId);
    const holdId = t(args.holdId);
    if (!orgId || !holdId) return { ok: false, reason: "hold_not_found", message: "No held deposit was named." };
    if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) {
        return { ok: false, reason: "invalid_amount", message: "An amount must be a positive whole number of cents." };
    }

    const { data: holdRow } = await supabase
        .from("payment_holds")
        .select("id, payment_id, refundable")
        .eq("org_id", orgId)
        .eq("id", holdId)
        .maybeSingle();
    const found = holdRow as { id: string; payment_id: string; refundable: boolean } | null;
    if (!found) {
        return { ok: false, reason: "hold_not_found", message: "That held deposit is not in this organization." };
    }

    /*
     * THE SNAPSHOT GOVERNS, NOT THE CURRENT POLICY.
     *
     * Money held under non-refundable terms stays non-refundable even if the organisation later
     * softens its deposit policy — and money held under refundable terms stays refundable even if
     * the policy later hardens. Reading the live policy here would retroactively rewrite what a
     * family was told when they paid.
     */
    if (args.kind === "refunded" && !found.refundable) {
        return {
            ok: false,
            reason: "not_refundable",
            message: "This deposit was taken as non-refundable, so it cannot be refunded.",
        };
    }

    const { error } = await supabase.from("payment_hold_dispositions").insert({
        org_id: orgId,
        hold_id: holdId,
        kind: args.kind,
        amount_cents: args.amountCents,
        allocation_id: t(args.allocationId) || null,
        refund_payment_id: t(args.refundPaymentId) || null,
        reason: t(args.reason) || null,
        disposed_by: args.actorUserId ?? null,
    });

    if (error) {
        if (/would exceed hold/i.test(error.message)) {
            return {
                ok: false,
                reason: "exceeds_remaining",
                message: "That is more than is still held on this deposit.",
            };
        }
        return { ok: false, reason: "write_failed", message: error.message };
    }

    const holds = await readHoldsForPayments(supabase, { orgId, paymentIds: [found.payment_id] });
    const hold = holds.find((h) => h.id === holdId);
    if (!hold) return { ok: false, reason: "write_failed", message: "the held deposit could not be re-read" };
    return { ok: true, hold, disposedCents: args.amountCents };
}

/**
 * HELD MONEY BECOMING AN ORDINARY ALLOCATION.
 *
 * The lifecycle is RECEIVED → HELD → APPLY, and the apply half is not W4's to invent: it is
 * `applyPaymentToCharge`, the same authority every other application uses. The result is an ordinary
 * `payment_allocations` row with no deposit flavour on it at all.
 *
 * ── THE ORDER IS DELIBERATE, AND IT IS THE SAFE ONE ──
 *
 * Two writes cannot share a transaction through this client, so one of them happens first. Recording
 * the disposition first would briefly RAISE available money — the hold would be gone and the
 * allocation not yet made — and another operation could take it in between.
 *
 * Allocating first cannot do that. During the window the money is already committed to the
 * obligation, and a concurrent hold attempt computes an unapplied remainder that has ALREADY been
 * reduced, so it refuses more strictly rather than less. The worst case is a disposition that fails
 * after a successful allocation, which leaves held money overstated and visible — an operator sees a
 * hold that is too large, which is recoverable. The other order risks money being spent twice, which
 * is not.
 */
export async function applyHeldFunds(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        holdId: string;
        chargeId: string;
        amountCents: number;
        actorUserId?: string | null;
        notes?: string | null;
    },
    allocate: (input: {
        orgId: string;
        paymentId: string;
        chargeId: string;
        amountCents: number;
        actorUserId?: string | null;
        notes?: string | null;
    }) => Promise<{ allocationId: string; appliedCents: number }>,
): Promise<DisposeResult> {
    const orgId = t(args.orgId);
    const holdId = t(args.holdId);
    if (!orgId || !holdId) return { ok: false, reason: "hold_not_found", message: "No held deposit was named." };
    if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) {
        return { ok: false, reason: "invalid_amount", message: "An amount must be a positive whole number of cents." };
    }

    const { data: holdRow } = await supabase
        .from("payment_holds")
        .select("id, payment_id")
        .eq("org_id", orgId)
        .eq("id", holdId)
        .maybeSingle();
    const found = holdRow as { id: string; payment_id: string } | null;
    if (!found) {
        return { ok: false, reason: "hold_not_found", message: "That held deposit is not in this organization." };
    }

    /* Bound checked here too, so an allocation is not made against money that is not still held. */
    const before = (await readHoldsForPayments(supabase, { orgId, paymentIds: [found.payment_id] }))
        .find((h) => h.id === holdId);
    if (!before || before.remainingCents < args.amountCents) {
        return {
            ok: false,
            reason: "exceeds_remaining",
            message: "That is more than is still held on this deposit.",
        };
    }

    const allocated = await allocate({
        orgId,
        paymentId: found.payment_id,
        chargeId: t(args.chargeId),
        amountCents: args.amountCents,
        actorUserId: args.actorUserId ?? null,
        notes: args.notes ?? null,
    });

    return await disposeHold(supabase, {
        orgId,
        holdId,
        kind: "applied",
        amountCents: allocated.appliedCents,
        allocationId: allocated.allocationId,
        reason: args.notes ?? null,
        actorUserId: args.actorUserId ?? null,
    });
}

/**
 * Whether held money may be refunded, by the terms it was taken under.
 *
 * Separated from the refund itself so the refusal can be produced at ELIGIBILITY — before any
 * provider call — exactly as W3's full-only bank rule is. A non-refundable deposit reaching Stripe
 * and failing there would have told the family a refund was under way first.
 */
export function heldRefundEligibility(hold: HeldDeposit, amountCents: number): { ok: true } | { ok: false; message: string } {
    if (!hold.refundable) {
        return {
            ok: false,
            message: "This deposit was taken as non-refundable, so it cannot be refunded.",
        };
    }
    if (amountCents > hold.remainingCents) {
        return { ok: false, message: "That is more than is still held on this deposit." };
    }
    return { ok: true };
}
