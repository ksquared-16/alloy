/**
 * AUTOPAY — the four acts an operator may perform on a standing authorization.
 *
 * ── WHY `fin.write` AND NOT A KEY OF ITS OWN ──
 *
 * The approved architecture is explicit that there is no `fin.autopay`. Setting up Autopay is
 * administering how an account pays, which is what `fin.write` already means and what `ops` already
 * holds for every other payment-method act. A key of its own would fragment one authority into two
 * that must then be kept in agreement forever — the same reasoning that kept `deposit.hold` on
 * `fin.adjust`.
 *
 * ── AND WHY THERE ARE EXACTLY FOUR ──
 *
 * There is deliberately NO `autopay.collect`. An operator who wants to take money today already has
 * the ordinary collection path, and an operator-triggered autopay run would be a second execution
 * route into the same economics — one that skips the occurrence identity that makes collection
 * idempotent. Scheduled execution enters through the registered handler and nowhere else.
 *
 * ── NONE OF THESE FOUR MOVES MONEY ──
 *
 * Enrolling authorizes future collection. Pausing, resuming and revoking change whether that
 * authorization is live. No receipt, no allocation, no obligation delta, and no charge — the money
 * only ever moves inside an ordinary W3 collection attempt raised by the handler.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import type { ActionEntityType, ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import {
    enrollAutopay,
    pauseAutopay,
    resumeAutopay,
    revokeAutopay,
    type AutopayRefusalReason,
} from "@/lib/financials/payments/autopayArrangement";

export const AUTOPAY_ENROLL_ACTION_KEY = "autopay.enroll";
export const AUTOPAY_PAUSE_ACTION_KEY = "autopay.pause";
export const AUTOPAY_RESUME_ACTION_KEY = "autopay.resume";
export const AUTOPAY_REVOKE_ACTION_KEY = "autopay.revoke";

/** Administering how an account pays. The same authority as every other payment-method act. */
export const AUTOPAY_PERMISSION = "fin.write" as const;

const ENTITY_TYPES: ActionEntityType[] = ["opportunity", "person", "child", "opportunity_customer_member"];

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** A grant read that FAILED answers `null` and denies — an unidentified caller is not an unprivileged one. */
async function permitted(supabase: SupabaseClient, orgId: string, userId: string | null | undefined): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(AUTOPAY_PERMISSION);
}

function denied(correlationId: string, sentence: string): ActionResult {
    return {
        ok: false,
        correlationId,
        status: 403,
        error: `${sentence} requires ${AUTOPAY_PERMISSION}.`,
        blockers: [{ code: "autopay_permission_required", message: "Permission required." }],
    };
}

function ineligible(sentence: string) {
    return {
        eligible: false,
        blockers: [{ code: "autopay_permission_required", message: `${sentence} requires ${AUTOPAY_PERMISSION}.` }],
        availableTransitions: [],
        requiredInputs: [],
    };
}

/** A refusal carries its own name and an honest status; it is never flattened into a 500. */
function statusFor(reason: AutopayRefusalReason): number {
    if (reason === "arrangement_not_found" || reason === "method_not_found") return 404;
    if (reason === "write_failed") return 500;
    return 409;
}

const enroll: RegisteredAction = {
    actionKey: AUTOPAY_ENROLL_ACTION_KEY,
    defaultLabel: "Set up Autopay",
    description: "Record a payer's authorization to collect what is owed automatically on the due date.",
    supportedEntityTypes: ENTITY_TYPES,
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    /*
     * Autopay is the first capability in the platform that takes money with nobody present, so the
     * operator confirms the terms they are recording on the payer's behalf.
     */
    confirmationPolicy: "required",

    validatePayload(payload) {
        const src = payload ?? {};
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!t(src.customer_id)) {
            blockers.push({ code: "missing_account", message: "An account is required.", field: "customer_id" });
        }
        if (!t(src.payer_entity_id)) {
            blockers.push({ code: "missing_payer", message: "Choose who is paying.", field: "payer_entity_id" });
        }
        if (!t(src.payment_method_id)) {
            blockers.push({ code: "missing_method", message: "Choose a payment method.", field: "payment_method_id" });
        }
        if (!t(src.effective_from)) {
            blockers.push({ code: "missing_effective_from", message: "Choose when Autopay starts.", field: "effective_from" });
        }
        if (src.max_amount_cents != null && src.max_amount_cents !== "") {
            const max = Number(src.max_amount_cents);
            if (!Number.isInteger(max) || max <= 0) {
                blockers.push({ code: "invalid_max_amount", message: "An authorized maximum must be greater than zero.", field: "max_amount_cents" });
            }
        }
        if (src.timing_offset_days != null && src.timing_offset_days !== "") {
            const offset = Number(src.timing_offset_days);
            if (!Number.isInteger(offset) || offset < -30 || offset > 30) {
                blockers.push({ code: "invalid_timing_offset", message: "The offset must be between -30 and 30 days.", field: "timing_offset_days" });
            }
        }
        return blockers.length ? { ok: false, blockers } : { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx }) {
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
            return ineligible("Setting up Autopay");
        }
        return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
    },

    async buildPreview({ payload }) {
        const max = payload?.max_amount_cents;
        const hasMax = max != null && max !== "" && Number(max) > 0;
        return {
            summary: "Authorize automatic collection on this account",
            changes: [
                "The amount owed is resolved fresh each time — nothing is collected if the family already paid",
                hasMax
                    ? `Nothing is collected if the amount due is above $${(Number(max) / 100).toFixed(2)}`
                    : "No authorized maximum: whatever is due on the day is collected",
                "A saved payment method alone never collects; this authorization is what does",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }) {
        const correlationId = randomUUID();
        const db = supabase as SupabaseClient;
        if (!(await permitted(db, ctx.orgId, ctx.userId))) return denied(correlationId, "Setting up Autopay");

        try {
            const maxRaw = payload?.max_amount_cents;
            const offsetRaw = payload?.timing_offset_days;
            const outcome = await enrollAutopay(db, {
                /* Tenancy comes from the session and never from the payload. */
                orgId: ctx.orgId,
                customerId: t(payload?.customer_id),
                payerEntityId: t(payload?.payer_entity_id),
                paymentMethodId: t(payload?.payment_method_id),
                authorizedBy: t(ctx.userId),
                authorizationRef: t(payload?.authorization_ref) || null,
                effectiveFrom: t(payload?.effective_from),
                effectiveTo: t(payload?.effective_to) || null,
                maxAmountCents: maxRaw != null && maxRaw !== "" ? Number(maxRaw) : null,
                timingOffsetDays: offsetRaw != null && offsetRaw !== "" ? Number(offsetRaw) : 0,
            });

            if (!outcome.ok) {
                return {
                    ok: false,
                    correlationId,
                    status: statusFor(outcome.reason),
                    error: outcome.message,
                    blockers: [{ code: outcome.reason, message: outcome.message }],
                };
            }
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: AUTOPAY_ENROLL_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: outcome.value.id,
                    detail: { arrangement: outcome.value },
                },
            };
        } catch (err) {
            return {
                ok: false,
                correlationId,
                status: 500,
                error: err instanceof Error ? err.message : "Autopay could not be set up.",
            };
        }
    },
};

/** Pause, resume and revoke differ only in which lifecycle call they make and what they warn about. */
function lifecycleAction(spec: {
    actionKey: string;
    label: string;
    description: string;
    sentence: string;
    summary: string;
    changes: string[];
    confirmationPolicy: "none" | "required";
    run: (
        db: SupabaseClient,
        args: { orgId: string; arrangementId: string },
    ) => ReturnType<typeof pauseAutopay>;
}): RegisteredAction {
    return {
        actionKey: spec.actionKey,
        defaultLabel: spec.label,
        description: spec.description,
        supportedEntityTypes: ENTITY_TYPES,
        supportedProcessKeys: [],
        requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
        audit: { eventType: "action_executed", category: "record", mutates: true },
        bosProposalSupport: false,
        confirmationPolicy: spec.confirmationPolicy,

        validatePayload(payload) {
            const src = payload ?? {};
            if (!t(src.arrangement_id)) {
                return {
                    ok: false,
                    blockers: [{ code: "missing_arrangement", message: "An Autopay arrangement is required.", field: "arrangement_id" }],
                };
            }
            return { ok: true, value: src };
        },

        async resolveEligibility({ supabase, ctx }) {
            if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
                return ineligible(spec.sentence);
            }
            return { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };
        },

        async buildPreview() {
            return { summary: spec.summary, changes: spec.changes };
        },

        async execute({ supabase, ctx, invocation, payload }) {
            const correlationId = randomUUID();
            const db = supabase as SupabaseClient;
            if (!(await permitted(db, ctx.orgId, ctx.userId))) return denied(correlationId, spec.sentence);

            try {
                const outcome = await spec.run(db, {
                    orgId: ctx.orgId,
                    arrangementId: t(payload?.arrangement_id),
                });
                if (!outcome.ok) {
                    return {
                        ok: false,
                        correlationId,
                        status: statusFor(outcome.reason),
                        error: outcome.message,
                        blockers: [{ code: outcome.reason, message: outcome.message }],
                    };
                }
                return {
                    ok: true,
                    correlationId,
                    result: {
                        actionKey: spec.actionKey,
                        entityType: invocation.entityType,
                        entityId: t(invocation.entityId),
                        affectedId: outcome.value.id,
                        detail: { arrangement: outcome.value },
                    },
                };
            } catch (err) {
                return {
                    ok: false,
                    correlationId,
                    status: 500,
                    error: err instanceof Error ? err.message : "The Autopay arrangement could not be updated.",
                };
            }
        },
    };
}

const pause = lifecycleAction({
    actionKey: AUTOPAY_PAUSE_ACTION_KEY,
    label: "Pause",
    description: "Stop future automatic collection without discarding the payer's authorization.",
    sentence: "Pausing Autopay",
    summary: "Pause automatic collection",
    changes: [
        "No new collection is started while paused",
        "A collection already with the provider continues — money in flight has its own truth",
        "The authorization is kept, so resuming needs no new consent",
    ],
    confirmationPolicy: "none",
    run: (db, args) => pauseAutopay(db, args),
});

const resume = lifecycleAction({
    actionKey: AUTOPAY_RESUME_ACTION_KEY,
    label: "Resume",
    description: "Restore future automatic collection under the existing authorization.",
    sentence: "Resuming Autopay",
    summary: "Resume automatic collection",
    changes: [
        "The payment method is rechecked before Autopay becomes active again",
        "Periods missed while paused are NOT collected retrospectively",
    ],
    confirmationPolicy: "none",
    run: (db, args) => resumeAutopay(db, args),
});

const revoke = lifecycleAction({
    actionKey: AUTOPAY_REVOKE_ACTION_KEY,
    label: "Turn off Autopay",
    description: "End the payer's authorization. Restarting later requires a new authorization.",
    sentence: "Turning off Autopay",
    summary: "End this Autopay authorization",
    changes: [
        "No further automatic collection on this account",
        "A collection already with the provider continues — money in flight has its own truth",
        "This is permanent: setting Autopay up again records a NEW authorization",
    ],
    confirmationPolicy: "required",
    run: (db, args) => revokeAutopay(db, args),
});

export const autopayActions: RegisteredAction[] = [enroll, pause, resume, revoke];
