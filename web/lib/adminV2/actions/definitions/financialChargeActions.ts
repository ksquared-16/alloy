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
import {
    createChildcareCorrection,
    postChildcareCharge,
    type CorrectionKind,
} from "@/lib/financials/childcareChargeService";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CHARGE_ADD_ACTION_KEY = "charge.add";
export const CHARGE_POST_ACTION_KEY = "charge.post";
export const CHARGE_REVERSE_ACTION_KEY = "charge.reverse";

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
/**
 * WHAT THIS CHARGE IS WRITTEN AGAINST — an agreement when one exists, the household otherwise.
 *
 * ── THE PRODUCT RULE ──
 *
 * A family can be billed before enrollment. A waitlist fee, a registration or application fee and a
 * deposit are all incurred before anyone is enrolled, so requiring an enrollment agreement made
 * Financials enrollment-gated and answered "there is nothing to charge against" to a family that
 * plainly owed money.
 *
 * ── WHAT IS PRESERVED ──
 *
 * AGREEMENT-BACKED CHILD ATTRIBUTION. When the named child HAS an agreement, that agreement is
 * still the source, so an enrolled child's charges keep landing on their own ledger exactly as
 * before. The household source is the fallback, never the preference.
 *
 * HOUSEHOLD CHARGES STAY HOUSEHOLD TRUTH. A charge resolved to the customer is attributed to the
 * customer — it is never pinned onto whichever child happens to be first, which would put a family
 * expense on one sibling's ledger and is the failure this resolver exists to prevent.
 *
 * TEMPLATE AUTHORITY. Whether a PARTICULAR charge needs a child or an agreement is decided by its
 * template and by `resolveChargeFromTemplate` — a rate-derived tuition charge that cannot price
 * itself without an agreement still refuses, and nothing here weakens that.
 */
type ChargeSubject =
    | { ok: true; kind: "enrollment_agreement"; agreementId: string; customerMemberId: string }
    | { ok: true; kind: "customer"; customerId: string }
    | { ok: false; code: string; message: string };

async function resolveChargeSubject(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    /** The household, when the caller knows it. Required to fall back to a customer source. */
    customerId?: string | null,
): Promise<ChargeSubject> {
    const household = t(customerId) || null;

    if (customerMemberId) {
        const { data, error } = await supabase
            .from("child_enrollment_agreements")
            .select("id, status, created_at")
            .eq("org_id", orgId)
            .eq("customer_member_id", customerMemberId)
            .order("created_at", { ascending: false });
        if (error) return { ok: false, code: "db_error", message: error.message };
        const rows = (data ?? []) as Array<{ id: string; status: string }>;
        if (rows.length > 0) {
            // An active agreement is the billable source; otherwise the most recent one still owns
            // history. Unchanged — an enrolled child's attribution does not move.
            const active = rows.find((r) => t(r.status) === "active");
            return {
                ok: true,
                kind: "enrollment_agreement",
                agreementId: (active ?? rows[0]!).id,
                customerMemberId,
            };
        }
        // No agreement for this child. Fall through to the household rather than refusing —
        // a pre-enrolment child's fee is the FAMILY's, and that is a real, chargeable subject.
    }

    if (!household) {
        return {
            ok: false,
            code: "missing_billable_subject",
            message:
                "There is no enrollment agreement and no household in scope, so there is nothing to "
                + "charge against.",
        };
    }
    return { ok: true, kind: "customer", customerId: household };
}

/** The billable source pair for a resolved subject — one place, so callers cannot disagree. */
function billableSourceForSubject(
    subject: Extract<ChargeSubject, { ok: true }>,
): { agreementId: string | null; billableSource: { type: "enrollment_agreement" | "customer"; id: string } } {
    return subject.kind === "enrollment_agreement"
        ? {
              agreementId: subject.agreementId,
              billableSource: { type: "enrollment_agreement", id: subject.agreementId },
          }
        : { agreementId: null, billableSource: { type: "customer", id: subject.customerId } };
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
            t(payload?.customer_id) || null,
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
            t(payload?.customer_id) || null,
        );
        if (!subject.ok) return { summary: subject.message, changes: [] };
        try {
            const { intent } = await previewTemplateCharge(supabase as SupabaseClient, ctx.orgId, {
                templateId: t(payload?.template_id),
                ...billableSourceForSubject(subject),
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
            const subject = await resolveChargeSubject(
                supabase as SupabaseClient,
                ctx.orgId,
                childId,
                t(payload?.customer_id) || null,
            );
            if (!subject.ok) {
                return { ok: false, correlationId, status: 409, error: subject.message };
            }
            const written = await writeTemplateDraftCharge(supabase as SupabaseClient, ctx.orgId, {
                templateId: t(payload.template_id),
                ...billableSourceForSubject(subject),
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

/**
 * POST A DRAFT CHARGE — the step that makes a charge OWED.
 *
 * Add Charge deliberately creates a draft: `writeTemplateDraftCharge` "never posts", because posting
 * is a separate authoritative decision the platform keeps apart from resolution. Without a registered
 * post intent, though, nothing an operator can reach ever turns a draft into a balance, and the
 * Financials card's central question — what is owed — could only ever answer zero.
 *
 * It adds no rules. `postChildcareCharge` owns the transition, refuses an already-posted charge, and
 * the DB trigger makes the result immutable: a posted childcare charge cannot be deleted or edited in
 * place, only corrected through `source_charge_id`. That is the same append-only shape Attendance has.
 */
const postCharge: RegisteredAction = {
    actionKey: CHARGE_POST_ACTION_KEY,
    defaultLabel: "Post charge",
    description: "Post a draft charge so it becomes owed.",
    supportedEntityTypes: ["opportunity_customer_member", "child", "person", "opportunity"],
    supportedProcessKeys: [],
    /*
     * THE SUBJECT OF A POST IS THE CHARGE, not a child.
     *
     * `charge.add` needs a child because it has to resolve what the charge hangs off. Posting does
     * not: the charge id names the row, and the service is org-scoped. Demanding an entity id here
     * refused exactly the case the household source exists for — a family with a registration fee
     * and no enrolled child has no `customer_member_id` to send, so their charge could be created
     * and never posted. `validatePayload` enforces the context this action actually needs.
     */
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
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const chargeId = t(payload?.charge_id);
        return {
            eligible: Boolean(chargeId),
            blockers: chargeId ? [] : [{ code: "missing_charge", message: "A charge is required." }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        return {
            summary: `Post charge ${t(payload?.charge_label) || t(payload?.charge_id)}`,
            changes: ["The charge becomes owed and can no longer be edited in place."],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const { charge, alreadyPosted } = await postChildcareCharge(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                chargeId: t(payload.charge_id),
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: CHARGE_POST_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: charge.id,
                    /*
                     * A RETRY IS A SUCCESS, and says so.
                     *
                     * Posting is idempotent, so a resubmitted request returns the charge that is
                     * already posted rather than failing. `already_posted` is how the caller tells
                     * "I posted it" from "it was posted" without either being an error.
                     */
                    detail: { status: charge.status, already_posted: alreadyPosted },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

/**
 * CORRECT A POSTED CHARGE — the only way posted money changes.
 *
 * A posted childcare charge is immutable by DB rule: it cannot be deleted, and its financial fields
 * cannot be edited in place. `createChildcareCorrection` writes a NEW row pointing at the original
 * through `source_charge_id`, so the original stays exactly as it was posted and the correction is
 * visible as its own line in the ledger. Without a registered intent, the platform enforced
 * immutability and then offered no lawful way to fix a mistake — which is not immutability, it is a
 * dead end.
 *
 * `reversal` derives its amount (the negation of the source) and is the default. `credit` and
 * `replacement` take an explicit signed amount. All three rules live in the service; this adds none.
 */
const reverseCharge: RegisteredAction = {
    actionKey: CHARGE_REVERSE_ACTION_KEY,
    defaultLabel: "Reverse charge",
    description: "Reverse or adjust a posted charge with a new corrective record.",
    supportedEntityTypes: ["opportunity_customer_member", "child", "person", "opportunity"],
    supportedProcessKeys: [],
    // Same as posting: the corrective record's subject is the charge it references.
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
        const kind = t(src.kind) || "reversal";
        if (!["reversal", "credit", "replacement"].includes(kind)) {
            return {
                ok: false,
                blockers: [{ code: "invalid_correction_kind", message: `Unknown correction: ${kind}.`, field: "kind" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const chargeId = t(payload?.charge_id);
        return {
            eligible: Boolean(chargeId),
            blockers: chargeId ? [] : [{ code: "missing_charge", message: "A charge is required." }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        const kind = t(payload?.kind) || "reversal";
        return {
            summary: `${kind === "reversal" ? "Reverse" : kind === "credit" ? "Credit" : "Replace"} ${
                t(payload?.charge_label) || t(payload?.charge_id)
            }`,
            changes: [
                "The original posted charge is left exactly as posted.",
                "A new corrective line references it and moves the balance.",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const kind = (t(payload.kind) || "reversal") as CorrectionKind;
            const row = await createChildcareCorrection(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                sourceChargeId: t(payload.charge_id),
                kind,
                // A reversal DERIVES its amount; passing one is refused by the service. Only an
                // explicit credit/replacement carries an operator amount.
                ...(kind === "reversal"
                    ? {}
                    : { amountCents: payload.amount_cents == null ? undefined : Number(payload.amount_cents) }),
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: CHARGE_REVERSE_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId),
                    affectedId: row.id,
                    detail: {
                        correction_kind: kind,
                        source_charge_id: row.source_charge_id,
                        amount_cents: row.amount_cents,
                    },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

export const financialChargeActions: RegisteredAction[] = [addCharge, postCharge, reverseCharge];
