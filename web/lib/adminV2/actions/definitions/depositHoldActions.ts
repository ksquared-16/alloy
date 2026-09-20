/**
 * HELD DEPOSITS — the two acts that restrict money and un-restrict it.
 *
 * ── WHY `fin.adjust` AND NOT A KEY OF ITS OWN ──
 *
 * The approved architecture already decided this, and the reasoning holds: holding money changes
 * what an operator may spend against a family's obligations without changing what they owe. That is
 * the same class of act `fin.adjust` was minted for — *"otherwise everyone who can bill can also
 * decide what a family owes"* — and `fin.deposit` would fragment one authority into two that must
 * then be kept in agreement forever.
 *
 * ── AND WHY THERE ARE ONLY TWO ──
 *
 * Applying held money is an ORDINARY allocation and refunding it is an ORDINARY refund; a hold only
 * stops being a restriction first. `deposit.apply` and `deposit.refund` would be second authorities
 * over money that already has one, so the composed acts reuse the canonical commands instead.
 *
 * ── NOTHING HERE MOVES MONEY ──
 *
 * Holding moves nothing. Releasing moves nothing. Neither creates a receipt, an allocation, a
 * journal entry or an obligation delta, and neither touches Current Balance — which is
 * responsibility minus APPLIED payment, and held money is not applied money.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import {
    createPaymentHold,
    disposeHold,
    readHoldsForPayments,
} from "@/lib/financials/prepaid/heldDeposits";

export const DEPOSIT_HOLD_ACTION_KEY = "deposit.hold";
export const DEPOSIT_RELEASE_ACTION_KEY = "deposit.release";

/** Deciding what may be spent against an obligation, without changing what is owed. */
export const DEPOSIT_PERMISSION = "fin.adjust" as const;

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** A grant read that FAILED answers `null` and denies — an unidentified caller is not an unprivileged one. */
async function permitted(supabase: SupabaseClient, orgId: string, userId: string | null | undefined): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(DEPOSIT_PERMISSION);
}

function denied(correlationId: string, sentence: string): ActionResult {
    return {
        ok: false,
        correlationId,
        status: 403,
        error: `${sentence} requires ${DEPOSIT_PERMISSION}.`,
        blockers: [{ code: "deposit_permission_required", message: "Permission required." }],
    };
}

function ineligible(sentence: string) {
    return {
        eligible: false,
        blockers: [{ code: "deposit_permission_required", message: `${sentence} requires ${DEPOSIT_PERMISSION}.` }],
        availableTransitions: [],
        requiredInputs: [],
    };
}

const holdFunds: RegisteredAction = {
    actionKey: DEPOSIT_HOLD_ACTION_KEY,
    defaultLabel: "Hold funds",
    description: "Restrict part of a received payment so it is not spent against ordinary obligations.",
    supportedEntityTypes: ["opportunity", "person", "child", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.payment_id)) {
            return { ok: false, blockers: [{ code: "missing_payment", message: "A payment is required.", field: "payment_id" }] };
        }
        const amount = Number(src.amount_cents);
        if (!Number.isInteger(amount) || amount <= 0) {
            return {
                ok: false,
                blockers: [{ code: "invalid_amount", message: "Enter an amount greater than zero.", field: "amount_cents" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return ineligible("Holding funds");
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const refundable = payload?.refundable !== false;
        return {
            summary: "Hold part of this payment",
            changes: [
                "The held amount stops counting as available prepaid money",
                "It does NOT change what the family owes, and moves no money",
                refundable
                    ? "Recorded as refundable on the terms in force today"
                    : "Recorded as NON-REFUNDABLE on the terms in force today",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }) {
        const correlationId = randomUUID();
        const db = supabase as SupabaseClient;
        if (!(await permitted(db, ctx.orgId, ctx.userId))) return denied(correlationId, "Holding funds");

        try {
            const outcome = await createPaymentHold(db, {
                orgId: ctx.orgId,
                paymentId: t(payload?.payment_id),
                amountCents: Number(payload?.amount_cents),
                /*
                 * THE SNAPSHOT IS TAKEN HERE, ONCE. Whatever the organisation's deposit policy says
                 * today is what this money is held under for the rest of its life — a later policy
                 * change must not retroactively alter what the family was told.
                 */
                refundable: payload?.refundable !== false,
                refundableTerms: (payload?.refundable_terms as Record<string, unknown>) ?? {},
                policyId: t(payload?.policy_id) || null,
                reason: t(payload?.reason) || null,
                actorUserId: ctx.userId ?? null,
            });

            if (!outcome.ok) {
                return {
                    ok: false,
                    correlationId,
                    status: outcome.reason === "payment_not_found" ? 404 : 409,
                    error: outcome.message,
                    blockers: [{ code: outcome.reason, message: outcome.message }],
                };
            }

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: DEPOSIT_HOLD_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: outcome.hold.id,
                    detail: { hold: outcome.hold },
                },
            };
        } catch (err) {
            return {
                ok: false,
                correlationId,
                status: 500,
                error: err instanceof Error ? err.message : "The funds could not be held.",
            };
        }
    },
};

const releaseFunds: RegisteredAction = {
    actionKey: DEPOSIT_RELEASE_ACTION_KEY,
    defaultLabel: "Release funds",
    description: "Stop restricting held funds so they become ordinary available prepaid money.",
    supportedEntityTypes: ["opportunity", "person", "child", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.hold_id)) {
            return { ok: false, blockers: [{ code: "missing_hold", message: "A held deposit is required.", field: "hold_id" }] };
        }
        const amount = Number(src.amount_cents);
        if (!Number.isInteger(amount) || amount <= 0) {
            return {
                ok: false,
                blockers: [{ code: "invalid_amount", message: "Enter an amount greater than zero.", field: "amount_cents" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return ineligible("Releasing funds");
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview() {
        return {
            summary: "Release held funds",
            changes: [
                "The released amount becomes ordinary available prepaid money",
                "It is NOT a refund, an application, or a change to what the family owes",
                "What was originally held stays on the record",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }) {
        const correlationId = randomUUID();
        const db = supabase as SupabaseClient;
        if (!(await permitted(db, ctx.orgId, ctx.userId))) return denied(correlationId, "Releasing funds");

        try {
            const outcome = await disposeHold(db, {
                orgId: ctx.orgId,
                holdId: t(payload?.hold_id),
                kind: "released",
                amountCents: Number(payload?.amount_cents),
                reason: t(payload?.reason) || null,
                actorUserId: ctx.userId ?? null,
            });

            if (!outcome.ok) {
                return {
                    ok: false,
                    correlationId,
                    status: outcome.reason === "hold_not_found" ? 404 : 409,
                    error: outcome.message,
                    blockers: [{ code: outcome.reason, message: outcome.message }],
                };
            }

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: DEPOSIT_RELEASE_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: outcome.hold.id,
                    detail: {
                        hold: outcome.hold,
                        released_cents: outcome.disposedCents,
                        /* What was originally held is still here — that is the amendment's whole point. */
                        originally_held_cents: outcome.hold.originalAmountCents,
                        still_held_cents: outcome.hold.remainingCents,
                    },
                },
            };
        } catch (err) {
            return {
                ok: false,
                correlationId,
                status: 500,
                error: err instanceof Error ? err.message : "The funds could not be released.",
            };
        }
    },
};

export const depositHoldActions: RegisteredAction[] = [holdFunds, releaseFunds];
