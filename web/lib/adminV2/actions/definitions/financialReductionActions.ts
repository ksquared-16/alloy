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

import type { ActionEntityType, ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import { readPolicies } from "@/lib/commercial/execution/export/readCommercialConfig";
import { applyFinancialReductions } from "@/lib/financials/reductions/applyFinancialReductions";
import {
    createChargePolicyExclusion,
    endChargePolicyExclusion,
} from "@/lib/financials/reductions/chargePolicyExclusionService";
import {
    assignPolicyToRelationship,
    endPolicyAssignment,
} from "@/lib/financials/reductions/commercialPolicyAssignmentService";
import { billingPeriodFromKey } from "@/lib/financials/billingPeriod";
import { billingPeriodBindingHttpAnswer } from "@/lib/financials/billingPeriods/billingPeriodBindingHttp";
import { previewProspectiveCorrection } from "@/lib/financials/corrections/prospectiveCorrection";
import {
    ADJUSTMENT_DIRECTIONS,
    chargeCategoryForDirection,
    directionFromSignedCents,
    signedCentsForIntent,
    type AdjustmentDirection,
} from "@/lib/financials/corrections/correctionIntent";
import {
    MANUAL_REDUCTION_CATEGORIES,
    ManualReductionError,
    applyManualReduction,
    reverseManualReduction,
    type ManualReductionCategory,
} from "@/lib/financials/reductions/manualReductionService";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ── THE GRAINS AN ACCOUNT-MOUNTED FINANCIAL ACT IS INVOKED AT ───────────────────────────────
 *
 * `customer` is the account grain, and it is the one the Financials account card dispatches: a
 * ledger, its charges and its adjustments belong to the HOUSEHOLD. It was missing here for the
 * same reason it was missing from the payments and deposit families, and with the same
 * consequence — `checkContext` refuses an undeclared grain before the action runs, so a click
 * from the surface that offers the control reached a 400 instead of its authority.
 *
 * Only the acts this surface actually mounts are widened. An action that is not offered from an
 * account is not given the grain just because its neighbours have it.
 */
const ACCOUNT_GRAIN_ENTITY_TYPES: readonly ActionEntityType[] = [
    "customer",
    "opportunity_customer_member",
    "child",
    "person",
    "opportunity",
];


export const BILLING_APPLY_DISCOUNTS_ACTION_KEY = "billing.apply_discounts";
export const BILLING_ADJUST_ACCOUNT_ACTION_KEY = "billing.adjust_account";
export const BILLING_REVERSE_ADJUSTMENT_ACTION_KEY = "billing.reverse_adjustment";
/** Taking an otherwise-applicable policy off ONE charge, and putting it back. */
export const BILLING_WAIVE_CHARGE_DISCOUNT_ACTION_KEY = "billing.waive_charge_discount";
export const BILLING_RESTORE_CHARGE_DISCOUNT_ACTION_KEY = "billing.restore_charge_discount";
/** Giving one commercial relationship a configured policy, and taking it back. */
export const BILLING_ASSIGN_POLICY_ACTION_KEY = "billing.assign_commercial_policy";
export const BILLING_END_POLICY_ASSIGNMENT_ACTION_KEY = "billing.end_commercial_policy_assignment";

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

    /**
     * WHAT THE RUN WOULD DO, IN MONEY — resolved by the run's own planner, writing nothing.
     *
     * This used to list the policies IN FORCE and stop there, with a comment arguing that
     * predicting eligibility would be "telling an operator a number the run might not produce".
     * The argument was sound about GUESSING and wrong about this: the same function can resolve
     * eligibility for real and decline to write. Measured on the running app, the old preview said
     * "1 discount policy in force" and Confirm then created six reductions worth $237.50 — a figure
     * the operator had never been shown.
     *
     * So the preview now runs `applyFinancialReductions` in preview mode: every read, every
     * eligibility fact and every policy evaluation is the code the run itself uses, and only the
     * writes are skipped. The policies stay in `changes`, because who qualified is still the
     * explanation for the number.
     */
    async buildPreview({ supabase, ctx, payload }) {
        const periodKey = t(payload?.period_key);
        const period = billingPeriodFromKey(periodKey);
        const policies = await readPolicies({ supabase, orgId: ctx.orgId } as never);
        const inForce = policies.filter(
            (p) =>
                p.isActive
                && (["waiver", "sibling_discount", "discount"] as readonly string[]).includes(p.kind)
                && (!p.effective.start || p.effective.start <= period.end)
                && (!p.effective.end || p.effective.end >= period.start),
        );
        if (inForce.length === 0) {
            return { summary: `No discount policy is in force for ${periodKey}.`, changes: [] };
        }

        const customerId = t(payload?.customer_id);
        const planned = await applyFinancialReductions(supabase as SupabaseClient, {
            orgId: ctx.orgId,
            periodKey,
            customerIds: customerId ? [customerId] : null,
            mode: "preview",
        });
        const totalCents = planned.outcomes.reduce(
            (sum, o) => sum + (o.kind === "applied" ? o.amountCents : 0),
            0,
        );
        const money = (cents: number) =>
            (Math.abs(cents) / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
        return {
            summary:
                `${planned.counts.applied} ${planned.counts.applied === 1 ? "obligation" : "obligations"} would be `
                + `reduced by ${money(totalCents)} for ${periodKey} · ${planned.counts.unchanged} unchanged, `
                + `${planned.counts.alreadyPosted} already posted, ${planned.counts.notEligible} not eligible, `
                + `${planned.counts.refused} refused`,
            changes: inForce.map((p) => `${p.kind} · ${JSON.stringify(p.params)}`),
            after: {
                period_key: periodKey,
                service_period: planned.servicePeriod,
                counts: planned.counts,
                total_reduction_cents: totalCents,
                refused_outcomes: planned.outcomes.filter((o) => o.kind === "refused"),
                not_eligible_outcomes: planned.outcomes.filter((o) => o.kind === "not_eligible"),
            },
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

/**
 * ── THE OPERATOR'S INTENT BECOMES SIGNED CENTS HERE, ONCE ────────────────────────────────────
 *
 * §4: an operator states WHICH WAY the family's balance moves and HOW MUCH. They do not state a
 * sign, and they are not asked whether the thing they are recording is called a credit or an
 * adjustment — that was the storage taxonomy wearing an operator label, and the two controls
 * disagreed about which one decided the sign.
 *
 * So this action accepts the intent shape — `direction` + `magnitude_cents` — and converts it
 * through the one canonical conversion. `charge_category` is DERIVED, and a category sent
 * alongside a direction is ignored rather than honoured: honouring it would restore exactly the
 * two-controls-one-decision conflict, and refusing it would break a caller for sending a field it
 * has always sent.
 *
 * ── WHY THE SIGNED SHAPE STILL WORKS ─────────────────────────────────────────────────────────
 *
 * `amount_cents` is the canonical SERVICE contract and has non-operator callers — subsidy
 * remittance writes through the same reduction authority, and the live suites drive it directly.
 * Those are not people reasoning about signs; they are code expressing an already-signed economic
 * fact. So the legacy shape is preserved unchanged and the intent shape takes precedence when
 * present. One normalizer answers for validate, preview and execute, which is what keeps a preview
 * from describing one direction while execute writes the other.
 */
type NormalizedAdjustment =
    | { ok: true; amountCents: number; chargeCategory: ManualReductionCategory; direction: AdjustmentDirection | null }
    | { ok: false; code: string; message: string; field: string };

function normalizeAdjustmentIntent(payload: Record<string, unknown> | null | undefined): NormalizedAdjustment {
    const direction = t(payload?.direction);
    if (direction) {
        if (!(ADJUSTMENT_DIRECTIONS as readonly string[]).includes(direction)) {
            return {
                ok: false,
                code: "invalid_direction",
                message: "Say whether this reduces or increases what the family owes.",
                field: "direction",
            };
        }
        const magnitude = Number(payload?.magnitude_cents);
        if (!Number.isInteger(magnitude) || magnitude <= 0) {
            return {
                ok: false,
                code: "invalid_amount",
                message: "Enter an amount greater than zero.",
                field: "magnitude_cents",
            };
        }
        const typed = direction as AdjustmentDirection;
        return {
            ok: true,
            amountCents: signedCentsForIntent({ direction: typed, magnitudeCents: magnitude }),
            chargeCategory: chargeCategoryForDirection(typed),
            direction: typed,
        };
    }

    const amount = Number(payload?.amount_cents);
    if (!Number.isInteger(amount) || amount === 0) {
        return {
            ok: false,
            code: "invalid_amount",
            message: "A reduction needs a whole, non-zero amount in cents.",
            field: "amount_cents",
        };
    }
    const category = t(payload?.charge_category) || "credit";
    if (!(MANUAL_REDUCTION_CATEGORIES as readonly string[]).includes(category)) {
        return {
            ok: false,
            code: "invalid_category",
            message: `Unknown reduction category: ${category}.`,
            field: "charge_category",
        };
    }
    return { ok: true, amountCents: amount, chargeCategory: category as ManualReductionCategory, direction: null };
}

const adjustAccount: RegisteredAction = {
    actionKey: BILLING_ADJUST_ACCOUNT_ACTION_KEY,
    defaultLabel: "Adjust account",
    description: "Record a manual credit, waiver or write-off against a family's account, with a reason.",
    supportedEntityTypes: ACCOUNT_GRAIN_ENTITY_TYPES,
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
        const normalized = normalizeAdjustmentIntent(payload);
        if (!normalized.ok) {
            blockers.push({ code: normalized.code, message: normalized.message, field: normalized.field });
        }
        if (t(payload?.reason).length < 3) {
            blockers.push({
                code: "reason_required",
                message: "Say why the account is being reduced. A manual credit with no reason cannot be explained later.",
                field: "reason",
            });
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

    /**
     * WHAT WILL HAPPEN, resolved the way execute resolves it.
     *
     * This used to be arithmetic on the submitted payload: it restated the operator's own number
     * and could not say which commercial period the adjustment would land in, nor that the period
     * was closed, nor what historical fact was being corrected. An operator could therefore preview
     * something that execute then refused.
     *
     * It now calls the canonical resolver, which shares the calendar authority with the binder and
     * reaches the same verdict — including the closed-destination refusal — without writing
     * anything. A refusal is surfaced as the preview itself, in the operator's language, rather
     * than thrown: being told why the action is unavailable is more useful than an empty preview.
     */
    async buildPreview({ supabase, ctx, payload }) {
        const normalized = normalizeAdjustmentIntent(payload);
        if (!normalized.ok) {
            return { summary: normalized.message, changes: [] };
        }
        try {
            const preview = await previewProspectiveCorrection(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                enrollmentAgreementId: t(payload?.enrollment_agreement_id),
                customerId: t(payload?.customer_id) || null,
                /*
                 * THE GRAIN RESPONSIBILITY IS ASKED AT. Without it the preview asks strictly about
                 * the household and would tell an operator correcting one child's charge that the
                 * household bears it, while a child-scoped arrangement governs.
                 */
                customerMemberId: t(payload?.customer_member_id) || null,
                amountCents: normalized.amountCents,
                effectiveDate: t(payload?.effective_date),
                sourceChargeId: t(payload?.source_charge_id) || null,
            });
            return {
                summary: preview.summary,
                changes: [...preview.changes, `Reason: ${t(payload?.reason) || "—"}`],
            };
        } catch (err) {
            /* The same mapping the route boundary uses, so the words match what execute would say. */
            const binding = billingPeriodBindingHttpAnswer(err);
            return {
                summary: binding?.message ?? "This adjustment cannot be previewed yet.",
                changes: [`Effective ${t(payload?.effective_date) || "—"}`],
            };
        }
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
            const normalized = normalizeAdjustmentIntent(payload);
            if (!normalized.ok) {
                return {
                    ok: false,
                    correlationId,
                    status: 400,
                    error: normalized.message,
                    blockers: [{ code: normalized.code, message: normalized.message }],
                };
            }
            const result = await applyManualReduction(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                enrollmentAgreementId: t(payload?.enrollment_agreement_id),
                customerId: t(payload?.customer_id) || null,
                customerMemberId: t(payload?.customer_member_id) || null,
                /* DERIVED from the direction when one was stated — see `normalizeAdjustmentIntent`. */
                chargeCategory: normalized.chargeCategory,
                amountCents: normalized.amountCents,
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
                        /*
                         * ── A TRUE OUTCOME THAT IS NOT A NEW WRITE ───────────────────────────
                         *
                         * §18: a repeat submit must have one economic consequence AND the surface
                         * must be able to say so. The service has always answered this honestly;
                         * the result carried it and every caller discarded it, so a resubmit
                         * reported "Recorded" twice and an operator had no way to tell whether
                         * they had just credited the family again.
                         */
                        idempotent: result.idempotent,
                        /*
                         * The direction, stated rather than left to be inferred from the sign of
                         * `amount_cents`. A surface that re-derives it is a second place for the
                         * convention to be read backwards.
                         */
                        direction: directionFromSignedCents(result.amountCents),
                    },
                },
            };
        } catch (err) {
            /*
             * CONVERGED ON THE ONE BILLING-PERIOD MAPPING rather than keeping a second error model.
             *
             * This catch already returned usable business language, because it forwards the thrown
             * message and the binder's sentences are written for operators. What it got wrong was
             * the SHAPE: a configuration conflict answered 400 with the generic
             * `adjustment_failed`, and an infrastructure read failure answered 400 while forwarding
             * a raw database string. Both now take the same status and the same stable code as
             * every other boundary that can see this error.
             */
            const binding = billingPeriodBindingHttpAnswer(err);
            if (binding) {
                return {
                    ok: false,
                    correlationId,
                    status: binding.status,
                    error: binding.message,
                    blockers: [{ code: binding.code, message: binding.message }],
                };
            }
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
    supportedEntityTypes: ACCOUNT_GRAIN_ENTITY_TYPES,
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

// ── ONE CHARGE, ONE POLICY, EXCLUDED ─────────────────────────────────────────────────────────
/*
 * ── WHY THIS IS NOT AN ADJUSTMENT ────────────────────────────────────────────────────────────
 *
 * An operator who wants "the sibling discount should not reduce THIS charge" has, until now, had
 * one instrument: adjust the account by the discount's worth, which lands as a manual reduction of
 * a number a human computed. That is wrong twice — the discount still shows as applied on every
 * surface that resolves policy, and the offsetting adjustment reads as a decision about this
 * family rather than about this charge.
 *
 * An exclusion says the true thing instead: the policy did not apply here, and here is why. The
 * resolver reports `excluded_by_charge_exception`, the reason is NOT NULL in the table, and the
 * money is recomputed rather than countered.
 *
 * ── AND WHY IT TAKES `fin.adjust` ────────────────────────────────────────────────────────────
 *
 * Applying authored policy is billing (`fin.write`): the machine runs and decides nothing.
 * Refusing authored policy for one charge is a decision that INCREASES what a real family owes.
 * That is the same class of act as adjusting an account by hand, and it takes the same grant.
 */
const waiveChargeDiscount: RegisteredAction = {
    actionKey: BILLING_WAIVE_CHARGE_DISCOUNT_ACTION_KEY,
    defaultLabel: "Waive discount for this charge",
    description: "Record that an otherwise-applicable commercial policy does not reduce one charge, and why.",
    /*
     * THE ENTITY IS THE SUBJECT, THE CHARGE IS THE PAYLOAD. There is no `charge` entity type in
     * the action runtime, and inventing one here would be a second entity vocabulary. The charge
     * this exclusion is about travels as `charge_id`, exactly as it does for every other
     * charge-scoped financial action.
     */
    supportedEntityTypes: ["child", "person", "opportunity_customer_member", "opportunity"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!t(payload?.charge_id)) {
            blockers.push({ code: "charge_required", message: "Name the charge this applies to.", field: "charge_id" });
        }
        if (!t(payload?.policy_id)) {
            blockers.push({ code: "policy_required", message: "Name the policy being excluded.", field: "policy_id" });
        }
        /*
         * THE REASON IS REFUSED HERE AS WELL AS IN THE SERVICE. Not redundancy: the service refuses
         * a write, this refuses a COMMAND, so the operator is told before they confirm rather than
         * after. The rule is the same one stated twice to two different audiences.
         */
        if (t(payload?.reason).length < 3) {
            blockers.push({
                code: "reason_required",
                message: "Say why this discount is being waived. It changes what a real family owes.",
                field: "reason",
            });
        }
        /* The exclusion is a fact about applicability. It may not carry a number. */
        const money = POLICY_FORBIDDEN_FIELDS.filter((f) => payload && f in payload);
        if (money.length > 0) {
            blockers.push({
                code: "policy_owns_amount",
                message: `An exclusion states that a policy did not apply, never what it was worth (${money.join(", ")}).`,
                field: money[0],
            });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_ADJUST_PERMISSION);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "adjust_permission_required", message: `Waiving a discount requires ${BILLING_ADJUST_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        return {
            summary: "This policy will not reduce this charge.",
            /* The reason is the change worth showing: it is the part that outlives the operator. */
            changes: [`Reason: ${t(payload?.reason)}`],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_ADJUST_PERMISSION))) {
            return {
                ok: false,
                correlationId,
                status: 403,
                error: `Waiving a discount requires ${BILLING_ADJUST_PERMISSION}.`,
                blockers: [{ code: "adjust_permission_required", message: "Permission required." }],
            };
        }
        const result = await createChargePolicyExclusion(supabase as SupabaseClient, {
            orgId: ctx.orgId,
            policyId: t(payload?.policy_id),
            chargeId: t(payload?.charge_id),
            reason: t(payload?.reason),
            actorUserId: ctx.userId ?? null,
        });
        if (!result.ok) {
            return {
                ok: false,
                correlationId,
                status: 400,
                error: result.message,
                blockers: [{ code: result.code, message: result.message }],
            };
        }
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: BILLING_WAIVE_CHARGE_DISCOUNT_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: t(invocation.entityId) || result.exclusion.chargeId,
                affectedId: result.exclusion.id,
                detail: {
                    exclusion_id: result.exclusion.id,
                    charge_id: result.exclusion.chargeId,
                    policy_id: result.exclusion.policyId,
                    reason: result.exclusion.reason,
                },
            },
        };
    },
};

/*
 * THE WAY BACK. A waiver an operator cannot undo is a waiver they will work around — with an
 * adjustment, which is the instrument this action exists to stop them reaching for. Ending an
 * exclusion is the same class of decision as making one and takes the same grant.
 */
const restoreChargeDiscount: RegisteredAction = {
    actionKey: BILLING_RESTORE_CHARGE_DISCOUNT_ACTION_KEY,
    defaultLabel: "Restore discount for this charge",
    description: "End a charge-level policy exclusion, so the policy reduces the charge again.",
    /*
     * THE ENTITY IS THE SUBJECT, THE CHARGE IS THE PAYLOAD. There is no `charge` entity type in
     * the action runtime, and inventing one here would be a second entity vocabulary. The charge
     * this exclusion is about travels as `charge_id`, exactly as it does for every other
     * charge-scoped financial action.
     */
    supportedEntityTypes: ["child", "person", "opportunity_customer_member", "opportunity"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        if (!t(payload?.exclusion_id)) {
            return {
                ok: false,
                blockers: [{ code: "exclusion_required", message: "Name the waiver being ended.", field: "exclusion_id" }],
            };
        }
        return { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_ADJUST_PERMISSION);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "adjust_permission_required", message: `Restoring a discount requires ${BILLING_ADJUST_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview() {
        return { summary: "This policy will reduce this charge again.", changes: [] };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_ADJUST_PERMISSION))) {
            return {
                ok: false,
                correlationId,
                status: 403,
                error: `Restoring a discount requires ${BILLING_ADJUST_PERMISSION}.`,
                blockers: [{ code: "adjust_permission_required", message: "Permission required." }],
            };
        }
        const result = await endChargePolicyExclusion(supabase as SupabaseClient, {
            orgId: ctx.orgId,
            exclusionId: t(payload?.exclusion_id),
            actorUserId: ctx.userId ?? null,
        });
        if (!result.ok) {
            return {
                ok: false,
                correlationId,
                status: 400,
                error: result.message,
                blockers: [{ code: result.code, message: result.message }],
            };
        }
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: BILLING_RESTORE_CHARGE_DISCOUNT_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: t(invocation.entityId) || result.exclusion.chargeId,
                affectedId: result.exclusion.id,
                detail: { exclusion_id: result.exclusion.id, charge_id: result.exclusion.chargeId },
            },
        };
    },
};

// ── GIVING A RELATIONSHIP A CONFIGURED POLICY ────────────────────────────────────────────────
/*
 * ── THE AFFIRMATIVE HALF ─────────────────────────────────────────────────────────────────────
 *
 * Every existing discount action is negative: except a relationship, exclude a charge, waive,
 * restore. The product could refuse a discount and could not grant one, because a child received
 * a policy only by satisfying a rule.
 *
 * ── WHY IT TAKES `fin.write` AND NOT `fin.adjust` ────────────────────────────────────────────
 *
 * Waiving takes money's worth away from a family and is the same class of act as adjusting an
 * account by hand, so it takes `fin.adjust`. Giving a family a discount the organisation has
 * already authored — at a rate the organisation set, under eligibility the organisation wrote —
 * decides nothing about what that discount is worth. It says which configured policy this family
 * receives, which is ordinary billing administration.
 */
const assignPolicy: RegisteredAction = {
    actionKey: BILLING_ASSIGN_POLICY_ACTION_KEY,
    defaultLabel: "Add discount",
    description: "Record that one commercial relationship receives a configured commercial policy.",
    supportedEntityTypes: ["child", "person", "opportunity_customer_member", "opportunity"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!t(payload?.policy_id)) {
            blockers.push({ code: "policy_required", message: "Name the discount to add.", field: "policy_id" });
        }
        if (!t(payload?.opportunity_customer_member_id)) {
            blockers.push({
                code: "relationship_required",
                message: "Name the child this is for.",
                field: "opportunity_customer_member_id",
            });
        }
        if (!t(payload?.customer_member_id)) {
            blockers.push({ code: "member_required", message: "Name the child this is for.", field: "customer_member_id" });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(t(payload?.effective_start))) {
            blockers.push({
                code: "invalid_effective_start",
                message: "Name the date this discount starts.",
                field: "effective_start",
            });
        }
        /*
         * THE POLICY OWNS ITS ECONOMICS. A caller naming a rate here has misunderstood what an
         * assignment is — and would be authoring a second place the discount is worth something.
         */
        const money = POLICY_FORBIDDEN_FIELDS.filter((f) => payload && f in payload);
        if (money.length > 0) {
            blockers.push({
                code: "policy_owns_amount",
                message: `An assignment names which policy a child receives, never what it is worth (${money.join(", ")}).`,
                field: money[0],
            });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_APPLY_DISCOUNTS_PERMISSION);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "billing_permission_required", message: `Adding a discount requires ${BILLING_APPLY_DISCOUNTS_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        return {
            summary: "This child will receive this configured discount.",
            /* What it is WORTH is the policy's answer and the resolver's; this states neither. */
            changes: [`From ${t(payload?.effective_start)}`],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_APPLY_DISCOUNTS_PERMISSION))) {
            return {
                ok: false,
                correlationId,
                status: 403,
                error: `Adding a discount requires ${BILLING_APPLY_DISCOUNTS_PERMISSION}.`,
                blockers: [{ code: "billing_permission_required", message: "Permission required." }],
            };
        }
        const result = await assignPolicyToRelationship(supabase as SupabaseClient, {
            orgId: ctx.orgId,
            policyId: t(payload?.policy_id),
            opportunityCustomerMemberId: t(payload?.opportunity_customer_member_id),
            customerMemberId: t(payload?.customer_member_id),
            effectiveStart: t(payload?.effective_start),
            reason: t(payload?.reason) || null,
            actorUserId: ctx.userId ?? null,
        });
        if (!result.ok) {
            return {
                ok: false,
                correlationId,
                status: 400,
                error: result.message,
                blockers: [{ code: result.code, message: result.message }],
            };
        }
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: BILLING_ASSIGN_POLICY_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: t(invocation.entityId) || result.assignment.customerMemberId,
                affectedId: result.assignment.id,
                detail: {
                    assignment_id: result.assignment.id,
                    policy_id: result.assignment.policyId,
                    customer_member_id: result.assignment.customerMemberId,
                    effective_start: result.assignment.effectiveStart,
                },
            },
        };
    },
};

/*
 * TAKING IT BACK. Ended, never deleted: the row is the record that somebody gave this family this
 * discount and for how long, and removing it would make money that was already reduced
 * unexplainable.
 */
const endAssignment: RegisteredAction = {
    actionKey: BILLING_END_POLICY_ASSIGNMENT_ACTION_KEY,
    defaultLabel: "Remove discount",
    description: "End a relationship's assignment of a configured commercial policy, from a date.",
    supportedEntityTypes: ["child", "person", "opportunity_customer_member", "opportunity"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!t(payload?.assignment_id)) {
            blockers.push({ code: "not_assigned", message: "Name the discount being removed.", field: "assignment_id" });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(t(payload?.effective_end))) {
            blockers.push({ code: "invalid_effective_end", message: "Name the date this discount ends.", field: "effective_end" });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_APPLY_DISCOUNTS_PERMISSION);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "billing_permission_required", message: `Removing a discount requires ${BILLING_APPLY_DISCOUNTS_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        return { summary: "This child will stop receiving this discount.", changes: [`From ${t(payload?.effective_end)}`] };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_APPLY_DISCOUNTS_PERMISSION))) {
            return {
                ok: false,
                correlationId,
                status: 403,
                error: `Removing a discount requires ${BILLING_APPLY_DISCOUNTS_PERMISSION}.`,
                blockers: [{ code: "billing_permission_required", message: "Permission required." }],
            };
        }
        const result = await endPolicyAssignment(supabase as SupabaseClient, {
            orgId: ctx.orgId,
            assignmentId: t(payload?.assignment_id),
            effectiveEnd: t(payload?.effective_end),
            actorUserId: ctx.userId ?? null,
        });
        if (!result.ok) {
            return {
                ok: false,
                correlationId,
                status: 400,
                error: result.message,
                blockers: [{ code: result.code, message: result.message }],
            };
        }
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: BILLING_END_POLICY_ASSIGNMENT_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: t(invocation.entityId) || result.assignment.customerMemberId,
                affectedId: result.assignment.id,
                detail: {
                    assignment_id: result.assignment.id,
                    policy_id: result.assignment.policyId,
                    effective_end: result.assignment.effectiveEnd,
                },
            },
        };
    },
};

export const financialReductionActions: RegisteredAction[] = [
    applyDiscounts,
    adjustAccount,
    reverseAdjustment,
    waiveChargeDiscount,
    restoreChargeDiscount,
    assignPolicy,
    endAssignment,
];
