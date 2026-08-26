/**
 * REGISTERED ACTION FOR ADD CHARGE — one operator intent, no new financial rules.
 *
 * Every rule already exists in `lib/financials/chargeLifecycle`: template resolution, amount
 * strategy, `occurs_on` / `billable_on` derivation, the posting-review policy, GL mapping keys,
 * default responsibility, and idempotency by resolution key. This adapter adds exactly two things the
 * domain deliberately does not have — an operator-facing SUBJECT (a child, not an enrollment
 * agreement) and an operator-facing INTENT — and delegates everything else.
 *
 * ── APPLIES TO ≠ CHARGE TO ──
 *
 * `Applies to` is the FINANCIAL SUBJECT: the operator picks a child, and the agreement id is resolved
 * internally and never exposed. `Charge to` is payer responsibility, and it is NOT a control here:
 * `resolveChargeResponsibility` returns a single default party (the household account, falling back to
 * the child), with no splits and no payer-to-method relationship. Rendering a chooser over a resolver
 * that has exactly one answer would invent an allocation model Financials does not own — Processing
 * does — so the canonical default is used and the control is omitted.
 *
 * ── FUTURE DATING IS THE TEMPLATE'S, NOT THE FORM'S ──
 *
 * A charge that belongs to a later billing context is produced by `billable_on_strategy`
 * (`immediate` | `offset_days` | `next_billing_cycle`), and a draft whose `billable_on` has not
 * arrived IS "scheduled" — derived, with no new status and no extra date column. The operator supplies
 * the event date; the template decides when it becomes billable. An `event_date` input is accepted
 * only because `occurs_on_strategy = 'event_date'` templates genuinely require one.
 *
 * ── PREVIEW IS AUTHORITATIVE ──
 *
 * `previewTemplateCharge` writes nothing and returns the same intent the write would use, so the
 * preview cannot drift from the commit. Balance impact is composed from the read model rather than
 * arithmetic performed here.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import {
    previewTemplateCharge,
    writeTemplateDraftCharge,
} from "@/lib/financials/chargeLifecycle/chargeLifecycleService";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CHARGE_ADD_ACTION_KEY = "charge.add";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function childIdFrom(payload: Record<string, unknown> | undefined, entityId: string | undefined): string {
    return t(payload?.customer_member_id) || t(payload?.child_id) || t(entityId);
}

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * The child's billable source.
 *
 * `Applies to` names a CHILD; charges hang off an agreement. Resolving here is what keeps agreement
 * ids out of the operator surface entirely — and a child with no agreement fails closed rather than
 * having a charge attached to whatever agreement happens to exist.
 */
async function resolveChargeSubject(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
): Promise<{ ok: true; agreementId: string } | { ok: false; code: string; message: string }> {
    if (!customerMemberId) {
        return { ok: false, code: "missing_child", message: "A child is required." };
    }
    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("id, status, created_at")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId)
        .order("created_at", { ascending: false });
    if (error) return { ok: false, code: "db_error", message: error.message };
    const rows = (data ?? []) as Array<{ id: string; status: string }>;
    if (rows.length === 0) {
        return {
            ok: false,
            code: "no_enrollment_agreement",
            message: "This child has no enrollment agreement, so there is nothing to charge against.",
        };
    }
    // An active agreement is the billable source; otherwise the most recent one still owns history.
    const active = rows.find((r) => t(r.status) === "active");
    return { ok: true, agreementId: (active ?? rows[0]!).id };
}

function mapError(err: unknown, correlationId: string): ActionResult {
    if (err instanceof OperationalEnrollmentServiceError) {
        const status = err.code === "not_found" ? 404 : err.code === "invalid_input" ? 400 : 409;
        return { ok: false, correlationId, status, error: err.message };
    }
    return {
        ok: false,
        correlationId,
        status: 500,
        error: err instanceof Error ? err.message : "The charge could not be created.",
    };
}

const addCharge: RegisteredAction = {
    actionKey: CHARGE_ADD_ACTION_KEY,
    defaultLabel: "Add charge",
    description: "Create a charge for a child from a configured charge template.",
    supportedEntityTypes: ["opportunity_customer_member", "child", "person", "opportunity"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.template_id)) {
            return {
                ok: false,
                blockers: [
                    {
                        code: "missing_charge_template",
                        message: "Choose a charge type.",
                        field: "template_id",
                    },
                ],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ supabase, ctx, payload, invocation }) {
        const subject = await resolveChargeSubject(
            supabase as SupabaseClient,
            ctx.orgId,
            childIdFrom(payload, invocation?.entityId),
        );
        return {
            eligible: subject.ok,
            blockers: subject.ok ? [] : [{ code: subject.code, message: subject.message }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    /**
     * The preview is the DOMAIN's intent, not a description of the form.
     *
     * It resolves through the same `previewTemplateCharge` the write uses, so the amount, the dates
     * and the scheduled-vs-draft verdict shown to the operator are the ones that will be persisted.
     * When the template cannot resolve an amount, that is said plainly rather than shown as $0.
     */
    async buildPreview({ supabase, ctx, payload, invocation }) {
        const childLabel = t(payload?.child_label) || "this child";
        const subject = await resolveChargeSubject(
            supabase as SupabaseClient,
            ctx.orgId,
            childIdFrom(payload, invocation?.entityId),
        );
        if (!subject.ok) return { summary: subject.message, changes: [] };
        try {
            const { intent } = await previewTemplateCharge(supabase as SupabaseClient, ctx.orgId, {
                templateId: t(payload?.template_id),
                agreementId: subject.agreementId,
                eventDate: t(payload?.event_date) || null,
                servicePeriodStart: t(payload?.service_period_start) || null,
                unitAmountCents:
                    payload?.amount_cents == null ? null : Number(payload.amount_cents),
                today: t(payload?.today) || todayYmd(),
            });
            if (!intent.eligible) {
                return { summary: intent.reason ?? "This charge cannot be created right now.", changes: [] };
            }
            const amount =
                intent.amountCents == null
                    ? "amount resolved at commit"
                    : `${(intent.amountCents / 100).toLocaleString(undefined, {
                          style: "currency",
                          currency: intent.currencyCode || "USD",
                      })}`;
            const changes = [
                `Applies to · ${childLabel}`,
                intent.occursOn ? `Occurs ${intent.occursOn}` : null,
                intent.billableOn ? `Billable ${intent.billableOn}` : null,
                intent.lifecycleStatus === "scheduled" ? "Scheduled — a future billing context" : null,
            ].filter((v): v is string => Boolean(v));
            return { summary: `${intent.templateKey} ${amount}`, changes };
        } catch (err) {
            return {
                summary: err instanceof Error ? err.message : "This charge cannot be previewed.",
                changes: [],
            };
        }
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const childId = childIdFrom(payload, invocation.entityId);
            const subject = await resolveChargeSubject(supabase as SupabaseClient, ctx.orgId, childId);
            if (!subject.ok) {
                return { ok: false, correlationId, status: 409, error: subject.message };
            }
            const written = await writeTemplateDraftCharge(supabase as SupabaseClient, ctx.orgId, {
                templateId: t(payload.template_id),
                agreementId: subject.agreementId,
                eventDate: t(payload.event_date) || null,
                servicePeriodStart: t(payload.service_period_start) || null,
                unitAmountCents: payload.amount_cents == null ? null : Number(payload.amount_cents),
                today: t(payload.today) || todayYmd(),
                actorUserId: ctx.userId ?? null,
            });
            if (written.status === "not_writable") {
                // The domain refusing is an answer, not a failure to report.
                return { ok: false, correlationId, status: 409, error: written.reason };
            }
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: CHARGE_ADD_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: childId,
                    affectedId: written.chargeId,
                    detail: { write_status: written.status, resolution_key: written.resolutionKey },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

export const financialChargeActions: RegisteredAction[] = [addCharge];
