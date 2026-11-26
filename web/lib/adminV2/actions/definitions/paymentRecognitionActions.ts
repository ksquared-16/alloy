/**
 * RECOGNISING MONEY THE PROVIDER ALREADY TOOK — one registered action, and no new authority.
 *
 * The gap this repairs has existed since Thread 8: the provider says `succeeded` and
 * `canonical_payment_id` is still null. The database has indexed that state all along; nothing ever
 * let an operator act on it, so the money sat unrecorded until somebody noticed by hand.
 *
 * ── WHY `fin.write` AND NOT A KEY OF ITS OWN ──
 *
 * Recognition does not decide where money settles (`fin.provider`), does not change what is owed
 * (`fin.adjust`), and does not take money — the money is already taken. It COMPLETES Alloy's record
 * of a collection the organisation already authorised, which is the same authority that authorised
 * it: `fin.write`. Minting a `fin.recognize` would mean an operator who may collect could not finish
 * collecting.
 *
 * ── AND IT CREATES NOTHING ──
 *
 * It re-invokes `postProviderConfirmedCollection`, the one canonical recognition boundary, which the
 * webhook also uses. This action cannot write a payment, write an allocation, invent provider
 * success, override provider state, or rewrite an amount, a payer or responsibility. Everything it
 * is allowed to do is a consequence of the provider genuinely having settled.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import {
    recognizeCollectionAttempt,
    recordRecognitionRefusal,
} from "@/lib/financials/payments/collectionRecognition";

export const PAYMENT_RECOGNIZE_ACTION_KEY = "payment.recognize";

/** The authority that collected is the authority that finishes collecting. */
export const PAYMENT_RECOGNIZE_PERMISSION = "fin.write" as const;

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** A grant read that FAILED answers `null` and denies — an unidentified caller is not an unprivileged one. */
async function permitted(supabase: SupabaseClient, orgId: string, userId: string | null | undefined): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(PAYMENT_RECOGNIZE_PERMISSION);
}

const recognizePayment: RegisteredAction = {
    actionKey: PAYMENT_RECOGNIZE_ACTION_KEY,
    defaultLabel: "Recognize payment",
    description: "Record a payment the provider already collected but Alloy has not yet recognized.",
    supportedEntityTypes: ["opportunity", "person", "child", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    /*
     * Not `destructive` and not `strong_confirm`. This creates a receipt for money that already
     * moved, and it is idempotent — the dangerous act would be leaving it unrecorded. A hard
     * confirmation here would teach operators to hesitate over the safe direction.
     */
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.collection_attempt_id)) {
            return {
                ok: false,
                blockers: [
                    {
                        code: "missing_collection",
                        message: "A collection is required.",
                        field: "collection_attempt_id",
                    },
                ],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return {
                eligible: false,
                blockers: [
                    {
                        code: "payment_recognize_permission_required",
                        message: `Recognizing a payment requires ${PAYMENT_RECOGNIZE_PERMISSION}.`,
                    },
                ],
                availableTransitions: [],
                requiredInputs: [],
            };
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview() {
        return {
            summary: "Record this payment in Alloy",
            changes: [
                "Asks the provider to confirm the money settled",
                "Creates the canonical payment and applies it to its obligation",
                "Creates nothing if the payment was already recognized",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }) {
        const correlationId = randomUUID();
        const db = supabase as SupabaseClient;

        if (!(await permitted(db, ctx.orgId, ctx.userId))) {
            return {
                ok: false,
                correlationId,
                status: 403,
                error: `Recognizing a payment requires ${PAYMENT_RECOGNIZE_PERMISSION}.`,
                blockers: [{ code: "payment_recognize_permission_required", message: "Permission required." }],
            } satisfies ActionResult;
        }

        try {
            const outcome = await recognizeCollectionAttempt(db, {
                orgId: ctx.orgId,
                attemptId: t(payload?.collection_attempt_id),
                actorUserId: ctx.userId ?? null,
            });

            if (!outcome.ok) {
                /*
                 * THE REFUSAL IS KEPT WHERE IT WILL BE SEEN AGAIN. The row stays in the recognition
                 * queue carrying an operator-safe sentence — hiding a failed repair would turn
                 * unrecorded money into invisible unrecorded money.
                 */
                if (outcome.attemptId) {
                    await recordRecognitionRefusal(db, {
                        orgId: ctx.orgId,
                        attemptId: outcome.attemptId,
                        reason: outcome.message,
                        actorUserId: ctx.userId ?? null,
                    });
                }
                return {
                    ok: false,
                    correlationId,
                    status: outcome.reason === "attempt_not_found" ? 404 : 409,
                    error: outcome.message,
                    blockers: [{ code: outcome.reason, message: outcome.message }],
                };
            }

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: PAYMENT_RECOGNIZE_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: outcome.paymentId,
                    detail: {
                        payment_id: outcome.paymentId,
                        collection_attempt_id: outcome.attemptId,
                        /* False means somebody else got there first — a success, not a duplicate. */
                        recognized_now: outcome.recognized,
                    },
                },
            };
        } catch (err) {
            return {
                ok: false,
                correlationId,
                status: 500,
                error: err instanceof Error ? err.message : "The payment could not be recognized.",
            };
        }
    },
};

export const paymentRecognitionActions: RegisteredAction[] = [recognizePayment];
