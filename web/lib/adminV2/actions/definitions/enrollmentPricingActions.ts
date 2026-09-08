/**
 * Registered actions: `enrollment.pricing.accept` and `enrollment.pricing.override`.
 *
 * The operator's decision about tuition, expressed through the same action runtime every other
 * operator intent already uses — not a direct client write, not a pricing workspace, not a second
 * command surface.
 *
 * ── THE SUBJECT IS THE ASSIGNMENT ──
 *
 * `entityId` is `opportunity_customer_members.id`, the same durable Enrollment subject the
 * requirement-exception actions use. It exists from the moment an assignment is proposed, which is
 * exactly when a family first needs a price — long before any enrollment agreement.
 *
 * ── WHAT THE CALLER MAY AND MAY NOT SAY ──
 *
 * It names the option it chose and the resolution it was shown. It does NOT send an amount: the
 * service re-reads the assignment from its owners, re-resolves through Commercial Execution, and
 * takes the price from the catalog. A payload amount would be a number the browser authored, and
 * there is nowhere in this path to put one.
 *
 * ── AUTHORIZATION IS ENFORCED BENEATH, NOT HERE ──
 *
 * Both adapters pass the caller's REAL grants to the service, which refuses an override without
 * `enrollment.pricing.override`. The check is not repeated in this file: a second copy is a second
 * thing to keep in agreement, and the laxer one would be the one guarding the write.
 *
 * @see web/lib/enrollment/pricing/enrollmentPricingTermsService.ts
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import {
    acceptEnrollmentPricingTerm,
    overrideEnrollmentPricingTerm,
    previewEnrollmentPricingCommit,
    type PricingCommitArgs,
    type PricingCommitResult,
} from "@/lib/enrollment/pricing/enrollmentPricingTermsService";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ENROLLMENT_PRICING_ACCEPT_ACTION_KEY = "enrollment.pricing.accept";
export const ENROLLMENT_PRICING_OVERRIDE_ACTION_KEY = "enrollment.pricing.override";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** A refusal is the domain speaking: 403 for authority, 409 for staleness, 400 for a bad ask. */
function refuse(result: Extract<PricingCommitResult, { ok: false }>, correlationId: string): ActionResult {
    const status =
        result.code === "override_permission_required"
            ? 403
            : result.code === "stale_resolution"
                || result.code === "option_no_longer_valid"
                || result.code === "term_already_accepted"
                || result.code === "no_recommendation"
                || result.code === "override_matches_recommendation"
              ? 409
              : result.code === "override_reason_required" || result.code === "assignment_not_found"
                ? 400
                : 500;
    return { ok: false, correlationId, status, error: result.message, blockers: [{ code: result.code, message: result.message }] };
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

async function commitArgsFrom(
    supabase: SupabaseClient,
    ctx: { orgId: string; userId?: string | null },
    payload: Record<string, unknown> | undefined,
    entityId: string | undefined,
): Promise<PricingCommitArgs> {
    const grants = await resolveActorPermissionGrants(supabase, ctx.orgId, ctx.userId);
    return {
        orgId: ctx.orgId,
        actorUserId: ctx.userId ?? null,
        // `null` from the resolver means the grant read FAILED — deny, never treat as "no grants
        // needed". An empty list is a real answer; a failed read is not.
        permissionKeys: grants.permissionKeys ?? [],
        opportunityCustomerMemberId:
            t(payload?.opportunity_customer_member_id) || t(payload?.assignment_id) || t(entityId),
        resolutionKey: t(payload?.resolution_key),
        selectedSourceId: t(payload?.selected_source_id) || t(payload?.tuition_rate_id),
        cadenceKey: t(payload?.cadence_key) || null,
        asOf: t(payload?.as_of) || null,
        overrideReason: t(payload?.override_reason) || null,
        supersede: payload?.supersede === true,
    };
}

/** Both actions ask for the same two things, so both validate them the same way. */
function validateCommitPayload(payload: Record<string, unknown> | undefined) {
    const blockers: Array<{ code: string; message: string; field?: string }> = [];
    if (!t(payload?.resolution_key)) {
        blockers.push({
            code: "missing_resolution",
            message: "Resolve tuition before committing it.",
            field: "resolution_key",
        });
    }
    if (!t(payload?.selected_source_id) && !t(payload?.tuition_rate_id)) {
        blockers.push({
            code: "missing_option",
            message: "Choose a tuition option.",
            field: "selected_source_id",
        });
    }
    /*
     * A PAYLOAD AMOUNT IS REFUSED RATHER THAN IGNORED.
     *
     * Silently dropping it would let a caller believe it had set a price and leave the difference
     * to be discovered in a ledger. There is no override-by-amount in this platform: an override
     * chooses another AUTHORED option, so an amount in the payload is a misunderstanding worth
     * naming.
     */
    if (payload && ("amount_cents" in payload || "rate_cents" in payload || "amount" in payload)) {
        blockers.push({
            code: "amount_not_accepted",
            message:
                "Tuition amounts come from the catalog, never from the caller. Choose an authored "
                + "option instead of sending an amount.",
            field: "amount_cents",
        });
    }
    return blockers.length > 0 ? { ok: false as const, blockers } : { ok: true as const, value: payload ?? {} };
}

const acceptAction: RegisteredAction = {
    ...BASE,
    actionKey: ENROLLMENT_PRICING_ACCEPT_ACTION_KEY,
    defaultLabel: "Accept tuition",
    description:
        "Accept the recommended tuition for this assignment and record it as an effective-dated "
        + "pricing term. Creates no charge.",
    validatePayload: validateCommitPayload,

    async resolveEligibility({ supabase, ctx, payload, invocation }) {
        const args = await commitArgsFrom(supabase as SupabaseClient, ctx, payload, invocation?.entityId);
        return {
            eligible: Boolean(args.opportunityCustomerMemberId),
            blockers: args.opportunityCustomerMemberId
                ? []
                : [{ code: "missing_assignment", message: "No assignment is in scope." }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },


    async buildPreview({ supabase, ctx, payload, invocation }) {
        const args = await commitArgsFrom(supabase as SupabaseClient, ctx, payload, invocation?.entityId);
        return previewEnrollmentPricingCommit(supabase as SupabaseClient, args, "accept");
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const args = await commitArgsFrom(supabase as SupabaseClient, ctx, payload, invocation.entityId);
        const result = await acceptEnrollmentPricingTerm(supabase as SupabaseClient, args);
        if (!result.ok) return refuse(result, correlationId);
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: ENROLLMENT_PRICING_ACCEPT_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: args.opportunityCustomerMemberId,
                affectedId: result.term.id,
                detail: {
                    state: result.term.state,
                    amount_cents: result.term.amount_cents,
                    currency_code: result.term.currency_code,
                    cadence_key: result.term.cadence_key,
                    effective_start: result.term.effective_start,
                    source_id: result.term.source_id,
                    config_version: result.term.config_version,
                    // A retry says so, rather than pretending it wrote something.
                    idempotent: result.idempotent,
                },
            },
        };
    },
};

const overrideAction: RegisteredAction = {
    ...BASE,
    actionKey: ENROLLMENT_PRICING_OVERRIDE_ACTION_KEY,
    defaultLabel: "Override tuition",
    description:
        "Record a different authored tuition option than the one recommended, with the reason it "
        + "applies. Requires the enrollment pricing override permission. Creates no charge.",

    validatePayload(payload) {
        const base = validateCommitPayload(payload);
        const blockers = base.ok ? [] : [...base.blockers];
        if (!t(payload?.override_reason)) {
            blockers.push({
                code: "missing_override_reason",
                message: "An override must say why the recommended tuition does not apply.",
                field: "override_reason",
            });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx, payload, invocation }) {
        const args = await commitArgsFrom(supabase as SupabaseClient, ctx, payload, invocation?.entityId);
        const permitted = args.permissionKeys.includes("enrollment.pricing.override");
        return {
            eligible: permitted && Boolean(args.opportunityCustomerMemberId),
            blockers: permitted
                ? args.opportunityCustomerMemberId
                    ? []
                    : [{ code: "missing_assignment", message: "No assignment is in scope." }]
                : [
                      {
                          code: "override_permission_required",
                          message: "Overriding recommended tuition requires the enrollment pricing override permission.",
                      },
                  ],
            availableTransitions: [],
            requiredInputs: [],
        };
    },


    async buildPreview({ supabase, ctx, payload, invocation }) {
        const args = await commitArgsFrom(supabase as SupabaseClient, ctx, payload, invocation?.entityId);
        return previewEnrollmentPricingCommit(supabase as SupabaseClient, args, "override");
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const args = await commitArgsFrom(supabase as SupabaseClient, ctx, payload, invocation.entityId);
        const result = await overrideEnrollmentPricingTerm(supabase as SupabaseClient, args);
        if (!result.ok) return refuse(result, correlationId);
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: ENROLLMENT_PRICING_OVERRIDE_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: args.opportunityCustomerMemberId,
                affectedId: result.term.id,
                detail: {
                    state: result.term.state,
                    amount_cents: result.term.amount_cents,
                    cadence_key: result.term.cadence_key,
                    effective_start: result.term.effective_start,
                    source_id: result.term.source_id,
                    // Both halves stay reconstructable: what was recommended, and what was chosen.
                    recommended_source_id: result.term.recommended_source_id,
                    override_reason: result.term.override_reason,
                    idempotent: result.idempotent,
                },
            },
        };
    },
};

export const enrollmentPricingActions: RegisteredAction[] = [acceptAction, overrideAction];
