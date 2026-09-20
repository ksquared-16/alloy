/**
 * Registered action: `billing.except_commercial_policy`.
 *
 * The one governed way an operator says "this commercial policy does not apply to this
 * relationship, from this date, because of this". Assignment requests it; it does not own the
 * writer, and no surface touches `commercial_policy_exceptions` directly.
 *
 * ── THE SUBJECT IS THE ASSIGNMENT ─────────────────────────────────────────────────────────────
 *
 * `entityId` is `opportunity_customer_members.id`, the same durable Enrollment subject
 * `enrollment.pricing.accept` uses — an exception is scoped to exactly the thing an accepted price
 * is scoped to.
 *
 * ── WHAT THE CALLER MAY AND MAY NOT SAY ───────────────────────────────────────────────────────
 *
 * It names the policy, the window and the reason. It does NOT send a financial effect: the
 * consequence of an exception is decided by `resolveFinancialReductions` when an obligation is
 * evaluated, and there is nowhere in this path to put an amount.
 */

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import {
    createPolicyException,
    endPolicyException,
    readExceptionHistory,
} from "@/lib/financials/reductions/commercialPolicyExceptionService";

export const POLICY_EXCEPTION_ACTION_KEY = "billing.except_commercial_policy";
export const POLICY_EXCEPTION_END_ACTION_KEY = "billing.end_commercial_policy_exception";

/* Excepting a family from a commercial policy is a financial decision, not portal admission. */
export const POLICY_EXCEPTION_PERMISSION = "fin.write" as const;

/**
 * An exception is a statement about applicability, never about money, and never about a grain the
 * caller chose. `discount_enabled` is named explicitly because it is the shape this feature must
 * not become: a per-assignment on/off switch over a configured policy.
 */
const FORBIDDEN_FIELDS = [
    "amount_cents",
    "percent",
    "percentage",
    "discount_enabled",
    "enabled",
    "customer_member_id",
    "org_id",
] as const;

const t = (v: unknown): string => (v != null ? String(v).trim() : "");

async function permitted(supabase: SupabaseClient, orgId: string, userId: string | null | undefined): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(POLICY_EXCEPTION_PERMISSION);
}

function denied(correlationId: string): ActionResult {
    return {
        ok: false,
        correlationId,
        status: 403,
        error: `Requires ${POLICY_EXCEPTION_PERMISSION}.`,
        blockers: [{ code: "exception_permission_required", message: `Requires ${POLICY_EXCEPTION_PERMISSION}.` }],
    };
}

const BASE: Pick<
    RegisteredAction,
    "supportedEntityTypes" | "supportedProcessKeys" | "requiredContext" | "audit" | "bosProposalSupport" | "confirmationPolicy"
> = {
    supportedEntityTypes: ["opportunity_customer_member", "child", "opportunity"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",
};

function relationshipFrom(payload: Record<string, unknown> | undefined, entityId: string | undefined): string {
    return t(payload?.opportunity_customer_member_id) || t(payload?.assignment_id) || t(entityId);
}

const exceptAction: RegisteredAction = {
    ...BASE,
    actionKey: POLICY_EXCEPTION_ACTION_KEY,
    defaultLabel: "Exclude this policy",
    description:
        "Record that a commercial policy does not apply to this assignment from a date, with a "
        + "reason. Writes no charge and no reduction; it changes what future eligibility decides.",

    validatePayload: (payload) => {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!t(payload?.policy_id)) {
            blockers.push({ code: "policy_required", message: "Name the policy being excepted.", field: "policy_id" });
        }
        /* The reason is required by the model, so it is required here rather than defaulted. */
        if (!t(payload?.reason)) {
            blockers.push({
                code: "reason_required",
                message: "An exception to commercial policy must say why.",
                field: "reason",
            });
        }
        /*
         * A caller that sends a financial effect is REFUSED, not quietly ignored. Ignoring it would
         * let a surface believe it had set a price here and ship that belief; refusing makes the
         * disagreement visible at the boundary. `customer_member_id` is on the list for the same
         * reason: the grain is read from the assignment, so a caller naming it is naming a second
         * opinion about who the exception is for.
         */
        for (const field of FORBIDDEN_FIELDS) {
            if (payload?.[field] !== undefined) {
                blockers.push({
                    code: "effect_not_caller_supplied",
                    message: `An exception says a policy does not apply; it cannot carry ${field}.`,
                    field,
                });
            }
        }
        return blockers.length === 0
            ? { ok: true, value: { ...(payload ?? {}) } }
            : { ok: false, blockers };
    },

    async resolveEligibility({ supabase, ctx, payload, invocation }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId);
        const relationship = relationshipFrom(payload, invocation?.entityId);
        return {
            eligible: ok && Boolean(relationship),
            blockers: [
                ...(ok ? [] : [{ code: "exception_permission_required", message: `Requires ${POLICY_EXCEPTION_PERMISSION}.` }]),
                ...(relationship ? [] : [{ code: "missing_assignment", message: "No assignment is in scope." }]),
            ],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload, invocation }) {
        /*
         * WHAT IT WILL MEAN, not what it will cost. The financial consequence belongs to the
         * eligibility path when an obligation is evaluated; promising money here would be a second
         * opinion about it.
         */
        const from = t(payload?.effective_start) || new Date().toISOString().slice(0, 10);
        const until = t(payload?.effective_end);
        return {
            summary: "This policy will not apply to eligible obligations for this commercial relationship.",
            changes: [
                `Policy ${t(payload?.policy_id)}`,
                `Assignment ${relationshipFrom(payload, invocation?.entityId)}`,
                until ? `Effective ${from} until ${until}` : `Effective ${from} onward`,
                `Reason: ${t(payload?.reason)}`,
                "Obligations already posted are unaffected.",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) return denied(correlationId);
        const result = await createPolicyException(supabase as SupabaseClient, {
            orgId: ctx.orgId,
            policyId: t(payload?.policy_id),
            opportunityCustomerMemberId: relationshipFrom(payload, invocation.entityId),
            effectiveStart: t(payload?.effective_start) || new Date().toISOString().slice(0, 10),
            effectiveEnd: t(payload?.effective_end) || null,
            reason: t(payload?.reason),
            actorUserId: ctx.userId ?? null,
        });
        if (!result.ok) {
            const status = result.code === "reason_required" || result.code === "dates_out_of_order" ? 400 : 409;
            return { ok: false, correlationId, status, error: result.message, blockers: [{ code: result.code, message: result.message }] };
        }
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: POLICY_EXCEPTION_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: result.exception.opportunityCustomerMemberId,
                affectedId: result.exception.id,
                detail: {
                    policy_id: result.exception.policyId,
                    effective_start: result.exception.effectiveStart,
                    effective_end: result.exception.effectiveEnd,
                    reason: result.exception.reason,
                    /* A supersession says so, rather than looking like a first decision. */
                    supersedes: result.superseded,
                },
            },
        };
    },
};

const endAction: RegisteredAction = {
    ...BASE,
    actionKey: POLICY_EXCEPTION_END_ACTION_KEY,
    defaultLabel: "End this exception",
    description:
        "End a policy exception from a date, so the policy may apply again to later eligible "
        + "obligations. The exception is kept, not deleted.",
    validatePayload: (payload) =>
        t(payload?.exception_id)
            ? { ok: true, value: { ...(payload ?? {}) } }
            : { ok: false, blockers: [{ code: "exception_required", message: "Name the exception to end.", field: "exception_id" }] },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "exception_permission_required", message: `Requires ${POLICY_EXCEPTION_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ supabase, ctx, payload, invocation }) {
        const history = await readExceptionHistory(supabase as SupabaseClient, {
            orgId: ctx.orgId,
            opportunityCustomerMemberId: relationshipFrom(payload, invocation?.entityId),
        }).catch(() => []);
        const target = history.find((e) => e.id === t(payload?.exception_id));
        return {
            summary: target
                ? "The policy may apply again to obligations effective after this date."
                : "End this exception.",
            changes: target ? [`Policy ${target.policyId}`, `In force from ${target.effectiveStart}`, `Reason: ${target.reason}`] : [],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) return denied(correlationId);
        const result = await endPolicyException(supabase as SupabaseClient, {
            orgId: ctx.orgId,
            exceptionId: t(payload?.exception_id),
            effectiveEnd: t(payload?.effective_end) || new Date().toISOString().slice(0, 10),
            actorUserId: ctx.userId ?? null,
        });
        if (!result.ok) {
            return { ok: false, correlationId, status: 409, error: result.message, blockers: [{ code: result.code, message: result.message }] };
        }
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: POLICY_EXCEPTION_END_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: result.exception.opportunityCustomerMemberId,
                affectedId: result.exception.id,
                detail: { policy_id: result.exception.policyId, effective_end: result.exception.effectiveEnd },
            },
        };
    },
};

export const commercialPolicyExceptionActions: RegisteredAction[] = [exceptAction, endAction];
