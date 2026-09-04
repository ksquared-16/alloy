/**
 * REGISTERED ACTIONS FOR PAYMENTS — receive money, apply it, give it back.
 *
 * The rules all live in `lib/financials/childcarePaymentService` and, authoritatively, in the
 * database. This adapter adds exactly what the domain deliberately does not have: an operator-facing
 * INTENT and an operator-facing SUBJECT. It is the same division `financialChargeActions` makes, for
 * the same reason — a rule that exists in two places is a rule that will be enforced in one.
 *
 * ── WHY THE SUBJECT IS A CHARGE ──
 *
 * `payment.record` names a CHARGE rather than a child, exactly as `charge.post` does. The charge id
 * names the obligation being settled, its billable source names the account the money was received
 * against, and the service is org-scoped — so the operator never has to know whether the family's
 * charge hangs off an agreement or off the household. Demanding a `customer_member_id` would refuse
 * the pre-enrolment case the `customer` billable source exists for: a family with a registration fee
 * and no enrolled child has no child to name, and could pay nothing.
 *
 * ── COLLECTION IS NOT RECORDING ──
 *
 * These actions RECORD authoritative money received and APPLY it. They do not collect it. Stripe
 * collection is a different capability with its own executor (`POST /admin/payments/run`), its own
 * provider lifecycle and its own failure modes, and making it a prerequisite for representing a cash
 * or check payment would mean a childcare family who pays by check cannot be recorded as having
 * paid. Provider status is not financial truth here; `status = 'posted'` is.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    CHILDCARE_PAYMENT_METHODS,
    isChildcarePaymentMethod,
    readChargeBalance,
    recordAndApplyChildcarePayment,
    refundChildcarePayment,
    type ChildcarePaymentMethod,
} from "@/lib/financials/childcarePaymentService";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PAYMENT_RECORD_ACTION_KEY = "payment.record";
export const PAYMENT_REFUND_ACTION_KEY = "payment.refund";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function money(cents: number, currency = "USD"): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency });
}

function mapError(err: unknown, correlationId: string): ActionResult {
    if (err instanceof OperationalEnrollmentServiceError) {
        const status =
            err.code === "not_found" ? 404
            : err.code === "invalid_input" ? 400
            : 409;
        return { ok: false, correlationId, status, error: err.message };
    }
    return {
        ok: false,
        correlationId,
        status: 500,
        error: err instanceof Error ? err.message : "The payment could not be recorded.",
    };
}

/**
 * THE IDEMPOTENCY KEY IS NOT OPTIONAL, and is not left to the caller to remember.
 *
 * A key the client may omit is a key that is omitted, and then a double-click is two payments. When
 * the caller supplies one it is honoured; otherwise a stable key is DERIVED from the request's own
 * content — the same charge, amount and method submitted twice is the same key, and the second
 * request returns the first payment instead of writing another.
 *
 * The date is deliberately part of it: recording a second $500 cash payment against the same charge
 * on a LATER day is a real, legitimate second payment, and must not be swallowed as a retry.
 */
function idempotencyKeyFor(payload: Record<string, unknown>, prefix: string): string {
    const supplied = t(payload.idempotency_key);
    if (supplied) return supplied;
    const day = t(payload.received_at).slice(0, 10) || new Date().toISOString().slice(0, 10);
    return [
        prefix,
        t(payload.charge_id) || t(payload.payment_id),
        t(payload.amount_cents),
        t(payload.payment_method),
        day,
    ].join(":");
}

const recordPayment: RegisteredAction = {
    actionKey: PAYMENT_RECORD_ACTION_KEY,
    defaultLabel: "Record payment",
    description: "Record money received against a posted charge and apply it to the balance.",
    supportedEntityTypes: ["opportunity_customer_member", "child", "person", "opportunity"],
    supportedProcessKeys: [],
    // Same as `charge.post`: the subject of a payment is the charge it settles, not a child.
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.charge_id)) {
            return {
                ok: false,
                blockers: [{ code: "missing_charge", message: "A charge is required.", field: "charge_id" }],
            };
        }
        const amount = Number(src.amount_cents);
        if (!Number.isInteger(amount) || amount <= 0) {
            return {
                ok: false,
                blockers: [
                    {
                        code: "invalid_amount",
                        message: "Enter an amount greater than zero.",
                        field: "amount_cents",
                    },
                ],
            };
        }
        const method = t(src.payment_method) || "cash";
        if (!isChildcarePaymentMethod(method)) {
            return {
                ok: false,
                blockers: [
                    {
                        code: "invalid_payment_method",
                        message: `Choose one of: ${CHILDCARE_PAYMENT_METHODS.join(", ")}.`,
                        field: "payment_method",
                    },
                ],
            };
        }
        return { ok: true, value: { ...src, payment_method: method } };
    },

    async resolveEligibility({ supabase, ctx, payload }) {
        const chargeId = t(payload?.charge_id);
        if (!chargeId) {
            return {
                eligible: false,
                blockers: [{ code: "missing_charge", message: "A charge is required." }],
                availableTransitions: [],
                requiredInputs: [],
            };
        }
        try {
            const charge = await readChargeBalance(supabase as SupabaseClient, ctx.orgId, chargeId);
            /*
             * A DRAFT IS NOT OWED. Paying one settles an obligation the family was never told about,
             * and the database refuses it — this says so before the operator types an amount.
             */
            if (charge.status === "draft" || charge.status === "void") {
                return {
                    eligible: false,
                    blockers: [
                        {
                            code: "charge_not_owed",
                            message:
                                charge.status === "draft"
                                    ? "This charge is still a draft. Post it before recording a payment against it."
                                    : "This charge was voided and is not owed.",
                        },
                    ],
                    availableTransitions: [],
                    requiredInputs: [],
                };
            }
            /*
             * A REPLAY OF THE REQUEST THAT SETTLED THE CHARGE IS NOT A NEW PAYMENT.
             *
             * The first submission settles the charge, so a double-click arrives at a charge with
             * nothing outstanding and reads as "already paid in full" — which turned the retry into
             * an error, while `execute` underneath was ready to answer `already_recorded` /
             * `already_applied` and move the balance zero times. The blocker is right about a NEW
             * payment against a settled charge and wrong about a replay of the one that settled it,
             * and the derived idempotency key is exactly what tells those two apart.
             *
             * Narrow on purpose: only `charge_settled` is bypassed. A draft or voided charge still
             * refuses money whether or not the request is a replay.
             */
            if (charge.outstandingCents <= 0) {
                const replayKey = idempotencyKeyFor(payload ?? {}, "payment.record");
                const { data: alreadyRecorded } = await (supabase as SupabaseClient)
                    .from("payments")
                    .select("id")
                    .eq("org_id", ctx.orgId)
                    .eq("idempotency_key", replayKey)
                    .maybeSingle();
                if (!alreadyRecorded) {
                    return {
                        eligible: false,
                        blockers: [
                            {
                                code: "charge_settled",
                                message: "This charge is already paid in full.",
                            },
                        ],
                        availableTransitions: [],
                        requiredInputs: [],
                    };
                }
            }
            return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
        } catch (err) {
            return {
                eligible: false,
                blockers: [
                    {
                        code: "charge_unavailable",
                        message: err instanceof Error ? err.message : "This charge could not be read.",
                    },
                ],
                availableTransitions: [],
                requiredInputs: [],
            };
        }
    },

    /**
     * The preview states the BALANCE CONSEQUENCE, from the same read the write will bound itself by.
     * It is the one number the operator is actually authorising.
     */
    async buildPreview({ supabase, ctx, payload }) {
        const chargeId = t(payload?.charge_id);
        const amount = Number(payload?.amount_cents ?? 0);
        try {
            const charge = await readChargeBalance(supabase as SupabaseClient, ctx.orgId, chargeId);
            const applied = Math.min(amount, charge.outstandingCents);
            return {
                summary: `Record ${money(amount)} · ${t(payload?.payment_method) || "cash"}`,
                changes: [
                    `Outstanding before · ${money(charge.outstandingCents)}`,
                    `Outstanding after · ${money(charge.outstandingCents - applied)}`,
                    amount > charge.outstandingCents
                        ? `${money(amount - applied)} stays unapplied on the account`
                        : null,
                ].filter((v): v is string => Boolean(v)),
            };
        } catch (err) {
            return {
                summary: err instanceof Error ? err.message : "This payment cannot be previewed.",
                changes: [],
            };
        }
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const result = await recordAndApplyChildcarePayment(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                chargeId: t(payload.charge_id),
                amountCents: Number(payload.amount_cents),
                paymentMethod: (t(payload.payment_method) || "cash") as ChildcarePaymentMethod,
                status: t(payload.status) === "pending" ? "pending" : "posted",
                receivedAt: t(payload.received_at) || null,
                referenceNumber: t(payload.reference_number) || null,
                processor: t(payload.processor) || null,
                processorTransactionId: t(payload.processor_transaction_id) || null,
                notes: t(payload.notes) || null,
                idempotencyKey: idempotencyKeyFor(payload, "payment.record"),
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PAYMENT_RECORD_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: result.payment.id,
                    /*
                     * A RETRY IS A SUCCESS, and says which half was a retry.
                     *
                     * `already_recorded` and `already_applied` let a caller tell "I did this" from
                     * "this was done" without either being an error — and, between them, they say
                     * that a resubmitted request moved the balance zero times.
                     */
                    detail: {
                        payment_id: result.payment.id,
                        allocation_id: result.allocation?.id ?? null,
                        applied_cents: result.allocation?.allocated_amount_cents ?? 0,
                        payment_status: result.payment.status,
                        already_recorded: result.alreadyRecorded,
                        already_applied: result.alreadyApplied,
                    },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

/**
 * REFUND — the only way money that was received changes.
 *
 * The receipt is never edited and never deleted (the database refuses both). A new outbound row
 * names it through `refunds_payment_id`, the applications are reversed by the refunded amount, and
 * the balance goes back up because the applications are what was holding it down.
 */
const refundPayment: RegisteredAction = {
    actionKey: PAYMENT_REFUND_ACTION_KEY,
    defaultLabel: "Refund payment",
    description: "Refund a recorded payment, leaving the original receipt intact.",
    supportedEntityTypes: ["opportunity_customer_member", "child", "person", "opportunity"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.payment_id)) {
            return {
                ok: false,
                blockers: [{ code: "missing_payment", message: "A payment is required.", field: "payment_id" }],
            };
        }
        if (src.amount_cents != null) {
            const amount = Number(src.amount_cents);
            if (!Number.isInteger(amount) || amount <= 0) {
                return {
                    ok: false,
                    blockers: [
                        {
                            code: "invalid_amount",
                            message: "A partial refund must be greater than zero.",
                            field: "amount_cents",
                        },
                    ],
                };
            }
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const paymentId = t(payload?.payment_id);
        return {
            eligible: Boolean(paymentId),
            blockers: paymentId ? [] : [{ code: "missing_payment", message: "A payment is required." }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        const amount = payload?.amount_cents == null ? null : Number(payload.amount_cents);
        return {
            summary: amount == null ? "Refund this payment in full" : `Refund ${money(amount)}`,
            changes: [
                "The original payment is left exactly as it was received.",
                "A refund record references it, and the balance goes back up by the refunded amount.",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const result = await refundChildcarePayment(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                paymentId: t(payload.payment_id),
                amountCents: payload.amount_cents == null ? undefined : Number(payload.amount_cents),
                reason: t(payload.reason) || null,
                idempotencyKey: idempotencyKeyFor(payload, "payment.refund"),
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PAYMENT_REFUND_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: result.refund.id,
                    detail: {
                        refund_payment_id: result.refund.id,
                        refunds_payment_id: result.original.id,
                        amount_cents: result.refund.amount_cents,
                        reversed_allocation_ids: result.reversedAllocationIds,
                        reapplied_allocation_id: result.reappliedAllocation?.id ?? null,
                        already_refunded: result.alreadyRefunded,
                    },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

export const financialPaymentActions: RegisteredAction[] = [recordPayment, refundPayment];
