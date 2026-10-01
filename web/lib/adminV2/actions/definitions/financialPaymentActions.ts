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

import type { ActionEntityType, ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { heldRefundEligibility, readHoldsForPayments } from "@/lib/financials/prepaid/heldDeposits";
import {
    applyPaymentToCharge,
    CHILDCARE_PAYMENT_METHODS,
    isChildcarePaymentMethod,
    readChargeBalance,
    readPaymentUnappliedCents,
    recordAndApplyChildcarePayment,
    refundChildcarePayment,
    reversePaymentApplication,
    type ChildcarePaymentMethod,
} from "@/lib/financials/childcarePaymentService";
import { createCardCollection } from "@/lib/financials/payments/collectionAttempt";
import { resolveCollectionMerchant } from "@/lib/financials/payments/providerMerchant";
import { recognizeProviderRefund, requestProviderRefund } from "@/lib/financials/payments/refundCollection";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ── THE GRAINS THIS FAMILY IS INVOKED AT ────────────────────────────────────────────────────
 *
 * `customer` is the one that was missing, and its absence made the whole held-money lifecycle
 * unreachable in production. The Financials account card is customer-grain — a receipt, a held
 * deposit and available prepaid belong to the household — so it dispatches `customer`, and
 * `checkContext` refused it before the action ever ran. Nothing could create a hold, apply held
 * money, release it, or deliberately apply available prepaid.
 *
 * The entity is ATTRIBUTION, not routing: `payment_id`, `hold_id` and `charge_id` in the payload
 * decide what the money does, which is why the same receipt and payload previewed
 * `eligible: true` under every already-declared grain on deployed staging and 400 under this one.
 */
const ACCOUNT_GRAIN_ENTITY_TYPES: readonly ActionEntityType[] = [
    "customer",
    "opportunity_customer_member",
    "child",
    "person",
    "opportunity",
];


export const PAYMENT_RECORD_ACTION_KEY = "payment.record";
export const PAYMENT_REFUND_ACTION_KEY = "payment.refund";
export const PAYMENT_COLLECT_CARD_ACTION_KEY = "payment.collect_card";
export const PAYMENT_REVERSE_APPLICATION_ACTION_KEY = "payment.reverse_application";
export const PAYMENT_APPLY_ACTION_KEY = "payment.apply_to_charge";

/**
 * ── WHO MAY MOVE THIS MONEY ──
 *
 * These three actions enforced nothing. `/api/admin/actions/execute` resolves ADMISSION through
 * `requireAdminOrOps` — no role, no grant — so every portal-eligible principal could take money in,
 * charge a card, and send money back, whatever the organization had configured for their role.
 *
 * **Taking money in is billing.** `payment.record` writes an authoritative receipt against a posted
 * charge and `payment.collect_card` asks the processor for one. Both run the billing machine, which
 * is `fin.write` — the key `charge.add` and `billing.apply_discounts` already use.
 *
 * **Sending money back is not.** A refund reverses received money and raises the balance again. That
 * is the act `fin.adjust` was minted to separate from billing — *"otherwise everyone who can bill
 * can also forgive, and nothing in the record tells them apart"* — and giving money back is the
 * strongest form of it, because the money leaves. It takes the stronger key.
 *
 * A narrowing, deliberately: `admin` and `ops` hold both keys by default, so no seeded role loses
 * anything, and a role an organization configured without them is now refused by the server.
 */
export const PAYMENT_WRITE_PERMISSION = "fin.write" as const;
/** Money leaving is the stronger authority, not the billing one. */
export const PAYMENT_REFUND_PERMISSION = "fin.adjust" as const;

/** A grant read that FAILED answers `null` and denies — an unidentified caller is not an unprivileged one. */
async function permitted(
    supabase: SupabaseClient,
    orgId: string,
    userId: string | null | undefined,
    key: string,
): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(key);
}

function denied(correlationId: string, sentence: string, key: string, code: string): ActionResult {
    return {
        ok: false,
        correlationId,
        status: 403,
        error: `${sentence} requires ${key}.`,
        blockers: [{ code, message: "Permission required." }],
    };
}

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
        /*
         * THE PAYER IS PART OF THE KEY, because two payers are two payments.
         *
         * The date above was included for exactly this class of reason — "a second $500 cash payment
         * against the same charge on a LATER day is a real, legitimate second payment, and must not
         * be swallowed as a retry". The same argument applies across PEOPLE and was missed: Mom
         * paying $37.50 and Dad paying $37.50 against one charge on one day are two real payments,
         * and without the payer here the second was returned as a replay of the first. Measured on a
         * split-payment certification: Dad's request came back carrying Mom's payment id with
         * `already_recorded: true`, and the family's outstanding stopped halfway with no error shown
         * to anyone.
         *
         * A payer-less payment keys exactly as before, so nothing that never named a payer changes.
         */
        t(payload.payer_entity_type),
        t(payload.payer_entity_id),
    ].join(":");
}

const recordPayment: RegisteredAction = {
    actionKey: PAYMENT_RECORD_ACTION_KEY,
    defaultLabel: "Record payment",
    description: "Record money received against a posted charge and apply it to the balance.",
    supportedEntityTypes: ACCOUNT_GRAIN_ENTITY_TYPES,
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
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, PAYMENT_WRITE_PERMISSION))) {
            return {
                eligible: false,
                blockers: [{
                    code: "payment_permission_required",
                    message: `Recording a payment requires ${PAYMENT_WRITE_PERMISSION}.`,
                }],
                availableTransitions: [],
                requiredInputs: [],
            };
        }
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
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, PAYMENT_WRITE_PERMISSION))) {
            return denied(correlationId, "Recording a payment", PAYMENT_WRITE_PERMISSION, "payment_permission_required");
        }
        try {
            const result = await recordAndApplyChildcarePayment(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                chargeId: t(payload.charge_id),
                amountCents: Number(payload.amount_cents),
                paymentMethod: (t(payload.payment_method) || "cash") as ChildcarePaymentMethod,
                status: t(payload.status) === "pending" ? "pending" : "posted",
                receivedAt: t(payload.received_at) || null,
                referenceNumber: t(payload.reference_number) || null,
                // Identity of who actually paid. Optional, and it confers no responsibility:
                // attributing a payment to somebody's SHARE is a separate, explicit act.
                payerEntityType: t(payload.payer_entity_type) || null,
                payerEntityId: t(payload.payer_entity_id) || null,
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
    supportedEntityTypes: ACCOUNT_GRAIN_ENTITY_TYPES,
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

    async resolveEligibility({ supabase, ctx, payload }) {
        const paymentId = t(payload?.payment_id);
        const allowed = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, PAYMENT_REFUND_PERMISSION);

        /*
         * ── THE TERMS ARE PART OF ELIGIBILITY, NOT ONLY OF EXECUTION ─────────────────────────────
         *
         * `execute` refuses a non-refundable lot before any provider call, and always did. This hook
         * did not look at the lot at all, so it answered `eligible: true` with no blockers for a
         * deposit the very next call would refuse. Measured on deployed staging: a preview of
         * `payment.refund` against a lot marked "Taken as non-refundable" was indistinguishable from
         * one against a refundable lot.
         *
         * It matters because this hook is the ANSWER other surfaces read — previews, and BOS
         * proposals, which never reach `execute` before telling an operator what is possible. The
         * terms consulted are the snapshot the money was taken under, never current policy.
         */
        const holdId = t(payload?.hold_id);
        let holdBlockers: { code: string; message: string }[] = [];
        if (paymentId && holdId) {
            const hold = (await readHoldsForPayments(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                paymentIds: [paymentId],
            })).find((h) => h.id === holdId);
            if (!hold) {
                holdBlockers = [{ code: "hold_not_found", message: "That held deposit is not on this payment." }];
            } else {
                const requested = payload?.amount_cents == null ? hold.remainingCents : Number(payload.amount_cents);
                const eligible = heldRefundEligibility(hold, requested);
                if (!eligible.ok) holdBlockers = [{ code: "hold_not_refundable", message: eligible.message }];
            }
        }

        return {
            eligible: Boolean(paymentId) && allowed && holdBlockers.length === 0,
            blockers: [
                ...(paymentId ? [] : [{ code: "missing_payment", message: "A payment is required." }]),
                ...(allowed
                    ? []
                    : [{ code: "refund_permission_required", message: `Refunding a payment requires ${PAYMENT_REFUND_PERMISSION}.` }]),
                ...holdBlockers,
            ],
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
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, PAYMENT_REFUND_PERMISSION))) {
            return denied(correlationId, "Refunding a payment", PAYMENT_REFUND_PERMISSION, "refund_permission_required");
        }
        try {
            const paymentId = t(payload.payment_id);
            const refundHoldId = t(payload.hold_id);

            /*
             * ── A NON-REFUNDABLE DEPOSIT IS REFUSED BEFORE ANYTHING IS EXECUTED ──────────────────
             *
             * Placed above every branch below, and deliberately so. `heldRefundEligibility` was
             * separated from the refund itself for exactly this: a non-refundable deposit that
             * reached Stripe and failed there would already have told the family a refund was under
             * way. The terms consulted are the SNAPSHOT the money was taken under, never the
             * organisation's current deposit policy — a later policy change must not retroactively
             * alter what the family was promised.
             *
             * The amount is bounded here too, because the hold is a lot WITHIN the receipt: the
             * refundable ceiling below is the receipt's, and a $500 refundable receipt holding a
             * $175 lot may not refund $500 of that lot.
             */
            if (refundHoldId) {
                const hold = (await readHoldsForPayments(supabase as SupabaseClient, {
                    orgId: ctx.orgId,
                    paymentIds: [paymentId],
                })).find((h) => h.id === refundHoldId);
                if (!hold) {
                    return {
                        ok: false,
                        correlationId,
                        status: 404,
                        error: "That held deposit is not on this payment.",
                        blockers: [{ code: "hold_not_found", message: "That held deposit is not on this payment." }],
                    };
                }
                const requested = payload.amount_cents == null
                    ? hold.remainingCents
                    : Number(payload.amount_cents);
                const eligible = heldRefundEligibility(hold, requested);
                if (!eligible.ok) {
                    return {
                        ok: false,
                        correlationId,
                        status: 409,
                        error: eligible.message,
                        blockers: [{ code: "hold_not_refundable", message: eligible.message }],
                    };
                }
            }

            /*
             * ── MONEY EXECUTED BY A PROCESSOR MUST BE GIVEN BACK BY THAT PROCESSOR ───────────────
             *
             * Calling Thread 8 directly for a CARD payment would create the canonical reversal and
             * put the family's balance back up while the money stayed in the provider's Stripe
             * account — the family told they owe it again, and nobody refunded. That is the one
             * outcome a refund must never produce, so a Stripe-executed receipt is routed through
             * the provider refund path first and Thread 8 recognises it afterwards.
             *
             * Manual rails fall through unchanged: cash handed back has no executor to ask.
             */
            const { data: originalRow } = await (supabase as SupabaseClient)
                .from("payments")
                .select("processor")
                .eq("org_id", ctx.orgId)
                .eq("id", paymentId)
                .maybeSingle();
            const processor = (originalRow as { processor?: string | null } | null)?.processor ?? null;

            if (processor === "stripe") {
                const requested = await requestProviderRefund(supabase as SupabaseClient, {
                    orgId: ctx.orgId,
                    paymentId,
                    amountCents: payload.amount_cents == null ? undefined : Number(payload.amount_cents),
                    // Distinguishes a retry of THIS refund from a later, deliberate second partial
                    // one. The operator's own intent identity when supplied; otherwise the amount.
                    intentDiscriminator: t(payload.refund_intent) || undefined,
                    reason: t(payload.reason) || null,
                    actorUserId: ctx.userId ?? null,
                    /*
                     * Carried onto the provider refund record so RECOGNITION can discharge the lot.
                     * It cannot be discharged here: no canonical refund row exists yet, and the
                     * disposition's constraint requires one to name.
                     */
                    holdId: refundHoldId || null,
                });
                if (!requested.ok) {
                    return { ok: false, correlationId, status: 409, error: requested.message };
                }

                /*
                 * Recognise inline when the provider already settled, so the operator sees canonical
                 * truth rather than a spinner. The webhook remains authoritative and will find it
                 * already recognised — both paths share the same idempotency anchor, so whichever
                 * arrives second changes nothing.
                 */
                const recognised = requested.providerState === "succeeded"
                    ? await recognizeProviderRefund(supabase as SupabaseClient, requested.refundRecordId)
                    : null;

                return {
                    ok: true,
                    correlationId,
                    result: {
                        actionKey: PAYMENT_REFUND_ACTION_KEY,
                        entityType: invocation.entityType,
                        entityId: t(invocation.entityId),
                        affectedId: recognised?.recognized ? recognised.canonicalRefundId : requested.refundRecordId,
                        detail: {
                            refunds_payment_id: paymentId,
                            amount_cents: requested.amountCents,
                            provider_state: requested.providerState,
                            // Diagnostics only. An operator never needs to read a `re_`.
                            provider_refund_id: requested.providerRefundId,
                            recognized: recognised?.recognized ?? false,
                            refund_payment_id: recognised?.recognized ? recognised.canonicalRefundId : null,
                        },
                    },
                };
            }

            const result = await refundChildcarePayment(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                paymentId,
                amountCents: payload.amount_cents == null ? undefined : Number(payload.amount_cents),
                reason: t(payload.reason) || null,
                idempotencyKey: idempotencyKeyFor(payload, "payment.refund"),
                actorUserId: ctx.userId ?? null,
                /*
                 * The lot funds the refund, so no application is reversed to pay for it. Without
                 * this the deposit's return came out of obligations the family had already settled.
                 */
                heldLotId: refundHoldId || null,
            });

            /*
             * ── THE MANUAL RAIL DISCHARGES THE LOT IMMEDIATELY ───────────────────────────────────
             *
             * Cash handed back across a desk has no executor to wait for, so the canonical refund
             * exists by the time this line runs and the disposition's constraint can be satisfied
             * here. The card rail cannot do this — see `recognizeProviderRefund`, which does it when
             * the provider refund is recognised.
             *
             * HELD GOES STRAIGHT TO REFUNDED, with no release in between: releasing first would make
             * the money ordinary available prepaid for an interval in which it could be spent
             * against an obligation while already on its way back to the payer.
             *
             * The unique index makes a retried refund a no-op rather than a second disposal, and a
             * failure here does not fail the refund — the money has gone back, and reporting failure
             * would invite a retry of a refund that already happened.
             */
            if (refundHoldId) {
                const { error: disposeError } = await (supabase as SupabaseClient)
                    .from("payment_hold_dispositions")
                    .insert({
                        org_id: ctx.orgId,
                        hold_id: refundHoldId,
                        kind: "refunded",
                        amount_cents: Number(result.refund.amount_cents),
                        refund_payment_id: result.refund.id,
                        reason: t(payload.reason) || null,
                        disposed_by: ctx.userId ?? null,
                    });
                if (disposeError && !/uq_payment_hold_dispositions_one_per_refund/.test(String(disposeError.message))) {
                    /*
                     * Reported as a SUCCESS WITH A NAMED DEFECT rather than a failure. The refund is
                     * canonical; what did not happen is the discharge, and the operator needs to be
                     * told that specific thing rather than that the refund failed.
                     */
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
                                hold_id: refundHoldId,
                                hold_discharged: false,
                                hold_discharge_error: disposeError.message,
                            },
                        },
                    };
                }
            }

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
                        ...(refundHoldId ? { hold_id: refundHoldId, hold_discharged: true } : {}),
                    },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};


/**
 * COLLECT BY CARD — the operator asks the family's card for money that is already owed.
 *
 * Deliberately shaped like `payment.record` rather than like a Stripe screen: the operator's intent
 * is "collect what is owed", and the executor is an implementation detail of that intent. Nothing in
 * the label, the description or the blockers mentions a PaymentIntent, a connected account or a
 * processor transaction — those appear only in `detail`, for diagnostics.
 *
 * It creates no money. The result carries what the browser needs to complete a tokenized card entry;
 * a receipt exists only once the provider confirms and Thread 8 recognises it.
 */
const collectCardPayment: RegisteredAction = {
    actionKey: PAYMENT_COLLECT_CARD_ACTION_KEY,
    defaultLabel: "Collect by card",
    description: "Collect an amount that is owed by charging a card, through the provider's own merchant account.",
    supportedEntityTypes: ACCOUNT_GRAIN_ENTITY_TYPES,
    supportedProcessKeys: [],
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
        if (src.amount_cents != null) {
            const amount = Number(src.amount_cents);
            if (!Number.isInteger(amount) || amount <= 0) {
                return {
                    ok: false,
                    blockers: [{ code: "invalid_amount", message: "An amount must be greater than zero.", field: "amount_cents" }],
                };
            }
        }
        return { ok: true, value: src };
    },

    /*
     * MERCHANT READINESS IS A BLOCKER, NOT AN ERROR.
     *
     * An organisation that has not finished Stripe onboarding cannot collect, and the operator needs
     * to be told THAT rather than "payment failed". The blocker codes carry the readiness state so
     * the surface can say something true and actionable; there is no branch that falls back to the
     * platform account.
     */
    async resolveEligibility({ supabase, ctx, payload }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, PAYMENT_WRITE_PERMISSION))) {
            return {
                eligible: false,
                blockers: [{
                    code: "payment_permission_required",
                    message: `Collecting a card payment requires ${PAYMENT_WRITE_PERMISSION}.`,
                }],
                availableTransitions: [],
                requiredInputs: [],
            };
        }
        const chargeId = t(payload?.charge_id);
        if (!chargeId) {
            return {
                eligible: false,
                blockers: [{ code: "missing_charge", message: "A charge is required." }],
                availableTransitions: [],
                requiredInputs: [],
            };
        }
        const merchant = await resolveCollectionMerchant(supabase as SupabaseClient, ctx.orgId, "stripe");
        if (!merchant.ok) {
            return {
                eligible: false,
                blockers: [{ code: `merchant_${merchant.reason}`, message: merchant.message }],
                availableTransitions: [],
                requiredInputs: [],
            };
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ supabase, ctx, payload }) {
        const chargeId = t(payload?.charge_id);
        try {
            const charge = await readChargeBalance(supabase as SupabaseClient, ctx.orgId, chargeId);
            const amount = payload?.amount_cents == null ? charge.outstandingCents : Number(payload.amount_cents);
            return {
                summary: `Collect ${money(amount)} by card against a balance of ${money(charge.outstandingCents)}.`,
                changes: [
                    "The card is charged through the provider's own Stripe account.",
                    "No payment is recorded until the provider confirms it.",
                ],
            };
        } catch (err) {
            return { summary: err instanceof Error ? err.message : "This collection cannot be previewed.", changes: [] };
        }
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, PAYMENT_WRITE_PERMISSION))) {
            return denied(
                correlationId,
                "Collecting a card payment",
                PAYMENT_WRITE_PERMISSION,
                "payment_permission_required",
            );
        }
        try {
            const chargeId = t(payload.charge_id);
            // The amount is the SERVER's, always. An omitted amount means "whatever is collectible",
            // and a supplied one is measured against canonical truth inside the service.
            const charge = await readChargeBalance(supabase as SupabaseClient, ctx.orgId, chargeId);
            const requested = payload.amount_cents == null
                ? charge.outstandingCents
                : Number(payload.amount_cents);

            const created = await createCardCollection(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                chargeId,
                requestedAmountCents: requested,
                actorUserId: ctx.userId ?? null,
                payerPersonId: t(payload.payer_person_id) || null,
                /*
                 * A METHOD THE FAMILY ALREADY GAVE US, when the operator chose one. Omitted means
                 * collect a new instrument through the provider's fields, which was the only thing
                 * this action could do before — so an account with a stored card still made the
                 * operator type it again.
                 *
                 * The service owns every rule about it: same org, same customer, rail agreement,
                 * usability, and that the method's owner IS the named payer (`method_payer_mismatch`).
                 * Passing it here does not widen what may be collected; it names an instrument.
                 */
                paymentMethodId: t(payload.payment_method_id) || null,
                /*
                 * The rail the operator chose. Intent only — the server still resolves the merchant,
                 * its capability for THIS rail, and the collectible amount, and refuses an ACH
                 * request on a merchant the provider has not enabled for it.
                 */
                rail: t(payload.rail) === "ach" ? "ach" : "card",
            });

            if (!created.ok) {
                return { ok: false, correlationId, status: 409, error: created.message };
            }

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PAYMENT_COLLECT_CARD_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: created.attemptId,
                    /*
                     * `client_secret` is the browser's handle on the card entry — Stripe's own
                     * token, not an Alloy credential, and useless without the publishable key. The
                     * provider identifiers below are diagnostics: an operator never needs to read a
                     * `pi_` to use Financials.
                     */
                    detail: {
                        collection_attempt_id: created.attemptId,
                        amount_cents: created.amountCents,
                        currency: created.currency,
                        client_secret: created.clientSecret,
                        connected_account: created.connectedAccountRef,
                        provider_transaction_id: created.providerTransactionId,
                        reused: created.reused,
                        /*
                         * WHICH STORED METHOD WAS USED, or null for a newly entered one. The
                         * surface needs this to know whether to open card entry at all: a stored
                         * method is confirmed off-session by the service, so presenting Stripe's
                         * fields afterwards would ask the operator to enter a card that has
                         * already been charged.
                         */
                        payment_method_id: created.paymentMethodId,
                        // The honest state: a request, not a receipt.
                        recognized: false,
                    },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

/**
 * UNDO AN APPLICATION — the correction that used to require a refund.
 *
 * A receipt and an allocation are different facts. Money applied to the wrong charge previously had
 * to be given back and taken again, because reversing an application was only reachable from the
 * refund path. This exposes that correction on its own.
 *
 * `fin.adjust`, the same permission refunding uses. Both change what a family is recorded as owing
 * after the fact, and that — not whether a processor is involved — is what the permission guards.
 *
 * NOT a refund and NOT a provider operation: the organisation still holds the money, so no processor
 * is contacted and no refund row is written. The receipt, its payer, its method, its date and its
 * processor reference are untouched, because the service never writes to `payments`.
 */
const reversePaymentApplicationAction: RegisteredAction = {
    actionKey: PAYMENT_REVERSE_APPLICATION_ACTION_KEY,
    defaultLabel: "Unapply payment",
    description:
        "Undo a payment application so the money becomes unapplied and the charge owes it again. The payment itself is unchanged.",
    supportedEntityTypes: ACCOUNT_GRAIN_ENTITY_TYPES,
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.allocation_id)) {
            return {
                ok: false,
                blockers: [
                    { code: "missing_application", message: "An application is required.", field: "allocation_id" },
                ],
            };
        }
        /*
         * The reversal row is the only account of why the money moved. The service refuses without
         * one too; stating it here means the operator is told before they get as far as confirming.
         */
        if (!t(src.reason)) {
            return {
                ok: false,
                blockers: [{ code: "missing_reason", message: "A reason is required.", field: "reason" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx, payload }) {
        const allocationId = t(payload?.allocation_id);
        const allowed = await permitted(
            supabase as SupabaseClient,
            ctx.orgId,
            ctx.userId,
            PAYMENT_REFUND_PERMISSION,
        );
        return {
            eligible: Boolean(allocationId) && allowed,
            blockers: [
                ...(allocationId ? [] : [{ code: "missing_application", message: "An application is required." }]),
                ...(allowed
                    ? []
                    : [
                          {
                              code: "reverse_application_permission_required",
                              message: `Unapplying a payment requires ${PAYMENT_REFUND_PERMISSION}.`,
                          },
                      ]),
            ],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    /*
     * The preview reads the application SERVER-SIDE and states the consequence in money. The amount
     * is never taken from the payload: a client that sent its own figure could preview one number
     * and reverse another.
     */
    async buildPreview({ supabase, ctx, payload }) {
        const allocationId = t(payload?.allocation_id);
        const { data } = await (supabase as SupabaseClient)
            .from("payment_allocations")
            .select("allocated_amount_cents, status")
            .eq("org_id", ctx.orgId)
            .eq("id", allocationId)
            .maybeSingle();
        const row = data as { allocated_amount_cents?: number; status?: string } | null;
        if (!row) {
            return { summary: "This application could not be found.", changes: [] };
        }
        if (row.status !== "active") {
            return { summary: `This application is already ${row.status}.`, changes: [] };
        }
        const amount = Number(row.allocated_amount_cents) || 0;
        return {
            summary: `Unapply ${money(amount)} from this charge`,
            changes: [
                `${money(amount)} stops being applied, and the charge owes it again.`,
                `${money(amount)} becomes unapplied on the payment, ready to apply elsewhere.`,
                "The payment itself is unchanged — same payer, same method, same date, no refund.",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, PAYMENT_REFUND_PERMISSION))) {
            return denied(
                correlationId,
                "Unapplying a payment",
                PAYMENT_REFUND_PERMISSION,
                "reverse_application_permission_required",
            );
        }
        try {
            const result = await reversePaymentApplication(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                allocationId: t(payload.allocation_id),
                reason: t(payload.reason),
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PAYMENT_REVERSE_APPLICATION_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: result.allocationId,
                    detail: {
                        allocation_id: result.allocationId,
                        payment_id: result.paymentId,
                        charge_id: result.chargeId,
                        reversed_amount_cents: result.reversedAmountCents,
                        payment_unapplied_cents: result.paymentUnappliedCents,
                        charge_outstanding_cents: result.chargeOutstandingCents,
                    },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

/**
 * PUT RECEIVED MONEY AGAINST AN OBLIGATION — the other half of a correction.
 *
 * Reversing an application leaves money unapplied, which is a true state but not a finished one. This
 * is how it finds its way to the right charge, and it is also the ordinary path for a payment that
 * arrived before anyone decided what it was for.
 *
 * `fin.write`, matching `payment.record`: putting received money against an obligation is recording
 * financial fact, not correcting it after the event. Undoing an application is the heavier authority
 * and keeps `fin.adjust`.
 *
 * The service owns every bound — unapplied remainder, over-payment, household. This wrapper adds no
 * arithmetic of its own; if it did, there would be two answers to how much may be applied.
 */
const applyPaymentToChargeAction: RegisteredAction = {
    actionKey: PAYMENT_APPLY_ACTION_KEY,
    defaultLabel: "Apply payment",
    description: "Apply received money that is not yet allocated to an outstanding charge.",
    supportedEntityTypes: ACCOUNT_GRAIN_ENTITY_TYPES,
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
        if (!t(src.charge_id)) {
            return { ok: false, blockers: [{ code: "missing_charge", message: "A charge is required.", field: "charge_id" }] };
        }
        if (src.amount_cents != null) {
            const amount = Number(src.amount_cents);
            if (!Number.isInteger(amount) || amount <= 0) {
                return {
                    ok: false,
                    blockers: [{ code: "invalid_amount", message: "An amount must be greater than zero.", field: "amount_cents" }],
                };
            }
        }
        /*
         * APPLYING A HELD DEPOSIT IS THIS ACT, NOT A SECOND ONE.
         *
         * `deposit.hold` and `deposit.release` were minted as the only two deposit authorities on the
         * stated grounds that "applying held money is an ORDINARY allocation … `deposit.apply` would
         * be a second authority over money that already has one". This is that ordinary allocation,
         * so the hold is named HERE — an input to applying money, not a different way to apply it.
         *
         * An amount is required alongside it: a hold is a lot within a receipt, and the default
         * "smaller of unapplied and outstanding" is computed over the whole receipt, which would
         * silently apply more of the payment than the hold covers.
         */
        if (t(src.hold_id) && src.amount_cents == null) {
            return {
                ok: false,
                blockers: [{
                    code: "missing_amount",
                    message: "Applying a held deposit needs an amount; the default is drawn from the whole payment.",
                    field: "amount_cents",
                }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx, payload }) {
        const paymentId = t(payload?.payment_id);
        const chargeId = t(payload?.charge_id);
        const allowed = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, PAYMENT_WRITE_PERMISSION);
        return {
            eligible: Boolean(paymentId) && Boolean(chargeId) && allowed,
            blockers: [
                ...(paymentId ? [] : [{ code: "missing_payment", message: "A payment is required." }]),
                ...(chargeId ? [] : [{ code: "missing_charge", message: "A charge is required." }]),
                ...(allowed ? [] : [{ code: "payment_permission_required", message: `Applying a payment requires ${PAYMENT_WRITE_PERMISSION}.` }]),
            ],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    /* Both figures are read server-side. The operator is told what is available and what is owed. */
    async buildPreview({ supabase, ctx, payload }) {
        const paymentId = t(payload?.payment_id);
        const chargeId = t(payload?.charge_id);
        const { data: paymentRow } = await (supabase as SupabaseClient)
            .from("payments")
            .select("amount_cents")
            .eq("org_id", ctx.orgId)
            .eq("id", paymentId)
            .maybeSingle();
        const amountCents = Number((paymentRow as { amount_cents?: number } | null)?.amount_cents ?? 0);
        if (!paymentRow) return { summary: "This payment could not be found.", changes: [] };
        const unapplied = await readPaymentUnappliedCents(supabase as SupabaseClient, ctx.orgId, paymentId, amountCents);
        let outstanding: number | null = null;
        try {
            outstanding = (await readChargeBalance(supabase as SupabaseClient, ctx.orgId, chargeId)).outstandingCents;
        } catch {
            return { summary: "This charge could not be found.", changes: [] };
        }
        const requested = payload?.amount_cents == null ? Math.min(unapplied, outstanding) : Number(payload.amount_cents);
        /*
         * HELD MONEY READS DIFFERENTLY TO THE OPERATOR.
         *
         * `unapplied` counts the whole receipt and held money is a restriction WITHIN it, so quoting
         * "$500 is currently unapplied" beside a $200 hold invites applying the other $300 — which
         * this act will not do. When a hold is named the preview speaks about the hold, and says
         * plainly that the restriction ends, because that is the consequence an operator is
         * authorising and it is not reversible by re-holding.
         */
        const holdId = t(payload?.hold_id);
        if (holdId) {
            const hold = (await readHoldsForPayments(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                paymentIds: [paymentId],
            })).find((h) => h.id === holdId);
            if (!hold) return { summary: "This held deposit could not be found.", changes: [] };
            return {
                summary: `Apply ${money(requested)} of this held deposit to the charge`,
                changes: [
                    `${money(hold.remainingCents)} of this deposit is still held.`,
                    `This charge has ${money(outstanding)} outstanding.`,
                    `${money(requested)} stops being held and is applied, reducing what the family owes by that amount.`,
                    hold.refundable
                        ? "The deposit was taken as refundable; applied money is no longer refundable as a deposit."
                        : "The deposit was taken as non-refundable.",
                ],
            };
        }
        return {
            summary: `Apply ${money(requested)} to this charge`,
            changes: [
                `${money(unapplied)} is currently unapplied on this payment.`,
                `This charge has ${money(outstanding)} outstanding.`,
                `${money(requested)} will be applied, reducing what the family owes by that amount.`,
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, PAYMENT_WRITE_PERMISSION))) {
            return denied(correlationId, "Applying a payment", PAYMENT_WRITE_PERMISSION, "payment_permission_required");
        }
        try {
            const holdId = t(payload.hold_id);
            const result = await applyPaymentToCharge(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                paymentId: t(payload.payment_id),
                chargeId: t(payload.charge_id),
                amountCents: payload.amount_cents == null ? undefined : Number(payload.amount_cents),
                /*
                 * WHO APPLIED THE MONEY. Previously omitted, so `created_by` was null on every
                 * allocation this action wrote — the allocation recorded that money moved and not who
                 * moved it, while the same column is populated on the hold and its disposition.
                 */
                actorUserId: ctx.userId ?? null,
                /* Present only for held money; the allocation and the disposition then commit together. */
                disposeHoldId: holdId || null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PAYMENT_APPLY_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: result.allocation.id,
                    detail: {
                        allocation_id: result.allocation.id,
                        payment_id: t(payload.payment_id),
                        charge_id: t(payload.charge_id),
                        applied_amount_cents: result.allocation.allocated_amount_cents,
                        already_applied: result.alreadyApplied,
                        ...(holdId ? { hold_id: holdId } : {}),
                    },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

export const financialPaymentActions: RegisteredAction[] = [
    recordPayment,
    refundPayment,
    collectCardPayment,
    reversePaymentApplicationAction,
    applyPaymentToChargeAction,
];
