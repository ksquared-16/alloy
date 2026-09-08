/**
 * Registered actions: `billing.apply_discounts`, `billing.adjust_account`, `billing.reverse_adjustment`.
 *
 * The production entry points for reducing what a family owes. They run on the same action runtime
 * every other operator intent uses — authorized, audited, invocable without a screen — so Thread 4
 * can place a surface over them later rather than have one rebuilt around them.
 *
 * ── TWO PERMISSIONS, BECAUSE THEY ARE TWO DIFFERENT ACTS ──
 *
 * Applying authored discount policy is billing: the amounts came from `commercial_policies` and the
 * operator is running the machine, so `fin.write`. Deciding by hand that a family owes less is not
 * billing, and it is gated by `fin.adjust` — otherwise everyone who can bill can also forgive, and
 * nothing in the record tells them apart.
 *
 * ── WHAT NO CALLER MAY SEND ──
 *
 * For the policy path: no amount, no percentage, no eligibility. Those come from the authored
 * policy and from canonical facts the server reads itself, and a payload carrying one is REFUSED
 * rather than ignored — a browser that could declare a household employed could grant itself money.
 *
 * @see web/lib/financials/reductions/applyFinancialReductions.ts
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import { readPolicies } from "@/lib/commercial/execution/export/readCommercialConfig";
import { applyFinancialReductions } from "@/lib/financials/reductions/applyFinancialReductions";
import { billingPeriodBounds } from "@/lib/financials/reductions/reductionPeriod";
import {
    MANUAL_REDUCTION_CATEGORIES,
    ManualReductionError,
    applyManualReduction,
    reverseManualReduction,
    type ManualReductionCategory,
} from "@/lib/financials/reductions/manualReductionService";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BILLING_APPLY_DISCOUNTS_ACTION_KEY = "billing.apply_discounts";
export const BILLING_ADJUST_ACCOUNT_ACTION_KEY = "billing.adjust_account";
export const BILLING_REVERSE_ADJUSTMENT_ACTION_KEY = "billing.reverse_adjustment";

/** Running authored policy is billing. */
export const BILLING_APPLY_DISCOUNTS_PERMISSION = "fin.write" as const;
/** Deciding a reduction by hand is not. */
export const BILLING_ADJUST_PERMISSION = "fin.adjust" as const;

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** A caller may say WHICH period. It may not say what the policy is worth, or who qualifies. */
const POLICY_FORBIDDEN_FIELDS = [
    "amount_cents",
    "amount",
    "percent",
    "percentage",
    "discount_cents",
    "sibling_rank",
    "sibling_count",
    "employee_household",
    "eligible",
];

async function permitted(
    supabase: SupabaseClient,
    orgId: string,
    // The runtime hands `userId` as optional; a missing actor must reach the grant read as null and
    // be DENIED there, not be coerced into looking like an anonymous-but-valid one here.
    userId: string | null | undefined,
    key: string,
): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(key);
}

const applyDiscounts: RegisteredAction = {
    actionKey: BILLING_APPLY_DISCOUNTS_ACTION_KEY,
    defaultLabel: "Apply discounts",
    description:
        "Apply the organisation's authored discount policies to a service period's gross tuition. "
        + "Creates reduction drafts only; posting stays a separate, authoritative step.",
    /*
     * `customer` is NOT an action entity type in this runtime, and adding one to the shared union to
     * suit this thread would be the money domain widening a platform vocabulary for its own
     * convenience. The household travels in the payload — which is where the services already read
     * it from — and the SUBJECT an operator names is the child or the assignment, as everywhere else.
     */
    supportedEntityTypes: ["opportunity_customer_member", "opportunity", "child", "person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!/^\d{4}-\d{2}$/.test(t(payload?.period_key))) {
            blockers.push({
                code: "missing_period",
                message: "Name the service period to discount, as YYYY-MM.",
                field: "period_key",
            });
        }
        const sent = POLICY_FORBIDDEN_FIELDS.filter((f) => payload && f in payload);
        if (sent.length > 0) {
            blockers.push({
                code: "policy_not_accepted_from_caller",
                message:
                    `A discount's value and who qualifies come from the authored policy and the org's own `
                    + `records, never from the caller (${sent.join(", ")}). Change the policy if the discount is wrong.`,
                field: sent[0],
            });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_APPLY_DISCOUNTS_PERMISSION);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "billing_permission_required", message: `Applying discounts requires ${BILLING_APPLY_DISCOUNTS_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    /** What the run would consider: the policies actually in force for that period. No writes. */
    async buildPreview({ supabase, ctx, payload }) {
        const periodKey = t(payload?.period_key);
        const period = billingPeriodBounds(periodKey);
        const policies = await readPolicies({ supabase, orgId: ctx.orgId } as never);
        const inForce = policies.filter(
            (p) =>
                p.isActive
                && (["waiver", "sibling_discount", "discount"] as readonly string[]).includes(p.kind)
                && (!p.effective.start || p.effective.start <= period.end)
                && (!p.effective.end || p.effective.end >= period.start),
        );
        return {
            summary:
                inForce.length === 0
                    ? `No discount policy is in force for ${periodKey}.`
                    : `${inForce.length} discount ${inForce.length === 1 ? "policy" : "policies"} in force for ${periodKey}.`,
            /*
             * The POLICIES, not a predicted set of amounts. Who qualifies depends on enrolments and
             * employments read at execution, and a preview that guessed at eligibility would be
             * telling an operator a number the run might not produce.
             */
            changes: inForce.map((p) => `${p.kind} · ${JSON.stringify(p.params)}`),
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_APPLY_DISCOUNTS_PERMISSION))) {
            return {
                ok: false,
                correlationId,
                status: 403,
                error: `Applying discounts requires ${BILLING_APPLY_DISCOUNTS_PERMISSION}.`,
                blockers: [{ code: "billing_permission_required", message: "Permission required." }],
            };
        }
        try {
            const customerId = t(payload?.customer_id) || null;
            const result = await applyFinancialReductions(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                periodKey: t(payload?.period_key),
                actorUserId: ctx.userId ?? null,
                customerIds: customerId ? [customerId] : null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: BILLING_APPLY_DISCOUNTS_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId) || result.periodKey,
                    affectedId: result.outcomes.find((o) => o.kind === "applied")?.sourceChargeId ?? null,
                    detail: {
                        period_key: result.periodKey,
                        service_period: result.servicePeriod,
                        ...result.counts,
                        // Counts stay counts; the outcomes an operator must act on are named apart.
                        refused_outcomes: result.outcomes.filter((o) => o.kind === "refused"),
                    },
                },
            };
        } catch (err) {
            return { ok: false, correlationId, status: 400, error: err instanceof Error ? err.message : "Applying discounts failed." };
        }
    },
};

const adjustAccount: RegisteredAction = {
    actionKey: BILLING_ADJUST_ACCOUNT_ACTION_KEY,
    defaultLabel: "Adjust account",
    description: "Record a manual credit, waiver or write-off against a family's account, with a reason.",
    supportedEntityTypes: ["child", "person", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!t(payload?.enrollment_agreement_id)) {
            blockers.push({ code: "missing_subject", message: "Name the enrolment this reduction is against.", field: "enrollment_agreement_id" });
        }
        const amount = Number(payload?.amount_cents);
        if (!Number.isInteger(amount) || amount === 0) {
            blockers.push({ code: "invalid_amount", message: "A reduction needs a whole, non-zero amount in cents.", field: "amount_cents" });
        }
        if (t(payload?.reason).length < 3) {
            blockers.push({
                code: "reason_required",
                message: "Say why the account is being reduced. A manual credit with no reason cannot be explained later.",
                field: "reason",
            });
        }
        const category = t(payload?.charge_category) || "credit";
        if (!(MANUAL_REDUCTION_CATEGORIES as readonly string[]).includes(category)) {
            blockers.push({ code: "invalid_category", message: `Unknown reduction category: ${category}.`, field: "charge_category" });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(t(payload?.effective_date))) {
            blockers.push({ code: "invalid_effective_date", message: "Name the date this reduction takes effect.", field: "effective_date" });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_ADJUST_PERMISSION);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "adjust_permission_required", message: `Adjusting an account requires ${BILLING_ADJUST_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    /** The operator's own numbers, read back before they commit them. */
    async buildPreview({ payload }) {
        const amount = Number(payload?.amount_cents);
        const direction = Number.isFinite(amount) && amount < 0 ? "reduces" : "increases";
        const money = Number.isFinite(amount) ? `$${(Math.abs(amount) / 100).toFixed(2)}` : "an unstated amount";
        return {
            summary: `${t(payload?.charge_category) || "credit"} of ${money} — ${direction} what the family owes.`,
            changes: [`Effective ${t(payload?.effective_date) || "—"}`, `Reason: ${t(payload?.reason) || "—"}`],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_ADJUST_PERMISSION))) {
            return {
                ok: false,
                correlationId,
                status: 403,
                error: `Adjusting an account requires ${BILLING_ADJUST_PERMISSION}.`,
                blockers: [{ code: "adjust_permission_required", message: "Permission required." }],
            };
        }
        try {
            const result = await applyManualReduction(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                enrollmentAgreementId: t(payload?.enrollment_agreement_id),
                customerId: t(payload?.customer_id) || null,
                customerMemberId: t(payload?.customer_member_id) || null,
                chargeCategory: (t(payload?.charge_category) || "credit") as ManualReductionCategory,
                amountCents: Number(payload?.amount_cents),
                currencyCode: t(payload?.currency_code) || null,
                reason: t(payload?.reason),
                effectiveDate: t(payload?.effective_date),
                sourceChargeId: t(payload?.source_charge_id) || null,
                note: t(payload?.note) || null,
                actorUserId: ctx.userId ?? null,
                // Caller identity when given, so a double-submit is one credit; otherwise this call.
                idempotencyKey: t(payload?.idempotency_key) || `fred:manual:${correlationId}`,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: BILLING_ADJUST_ACCOUNT_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId) || result.chargeId,
                    affectedId: result.chargeId,
                    detail: {
                        application_id: result.applicationId,
                        charge_id: result.chargeId,
                        amount_cents: result.amountCents,
                        idempotent: result.idempotent,
                    },
                },
            };
        } catch (err) {
            const code = err instanceof ManualReductionError ? err.code : "adjustment_failed";
            return {
                ok: false,
                correlationId,
                status: 400,
                error: err instanceof Error ? err.message : "Adjusting the account failed.",
                blockers: [{ code, message: err instanceof Error ? err.message : "Adjusting the account failed." }],
            };
        }
    },
};

const reverseAdjustment: RegisteredAction = {
    actionKey: BILLING_REVERSE_ADJUSTMENT_ACTION_KEY,
    defaultLabel: "Reverse adjustment",
    description: "Undo a manual reduction by appending its opposite. The original is left standing.",
    supportedEntityTypes: ["child", "person", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!t(payload?.application_id)) {
            blockers.push({ code: "missing_application", message: "Name the reduction to reverse.", field: "application_id" });
        }
        if (t(payload?.reason).length < 3) {
            blockers.push({ code: "reason_required", message: "Say why the reduction is being reversed.", field: "reason" });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_ADJUST_PERMISSION);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "adjust_permission_required", message: `Reversing an adjustment requires ${BILLING_ADJUST_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    /** What stands today, so the operator reverses the reduction they meant to. */
    async buildPreview({ supabase, ctx, payload }) {
        const { data } = await (supabase as SupabaseClient)
            .from("financial_reduction_applications")
            .select("amount_cents, currency_code, reason, period_key, reversed_by_id")
            .eq("org_id", ctx.orgId)
            .eq("id", t(payload?.application_id))
            .maybeSingle();
        const row = data as
            | { amount_cents: number; reason: string | null; period_key: string | null; reversed_by_id: string | null }
            | null;
        if (!row) return { summary: "No such reduction on this account.", changes: [] };
        return {
            summary: row.reversed_by_id
                ? "This reduction has already been reversed."
                : `Reverses $${(Math.abs(row.amount_cents) / 100).toFixed(2)} from ${row.period_key ?? "an unstated period"}.`,
            changes: [`Original reason: ${row.reason ?? "—"}`, "The original stays in the ledger; its opposite is appended."],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_ADJUST_PERMISSION))) {
            return {
                ok: false,
                correlationId,
                status: 403,
                error: `Reversing an adjustment requires ${BILLING_ADJUST_PERMISSION}.`,
                blockers: [{ code: "adjust_permission_required", message: "Permission required." }],
            };
        }
        try {
            const result = await reverseManualReduction(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                applicationId: t(payload?.application_id),
                reason: t(payload?.reason),
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: BILLING_REVERSE_ADJUSTMENT_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId) || result.chargeId,
                    affectedId: result.chargeId,
                    detail: { application_id: result.applicationId, charge_id: result.chargeId, amount_cents: result.amountCents },
                },
            };
        } catch (err) {
            const code = err instanceof ManualReductionError ? err.code : "reversal_failed";
            return {
                ok: false,
                correlationId,
                status: 400,
                error: err instanceof Error ? err.message : "Reversing the adjustment failed.",
                blockers: [{ code, message: err instanceof Error ? err.message : "Reversing the adjustment failed." }],
            };
        }
    },
};

export const financialReductionActions: RegisteredAction[] = [applyDiscounts, adjustAccount, reverseAdjustment];
