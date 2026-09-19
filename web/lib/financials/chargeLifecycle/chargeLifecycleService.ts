/**
 * Charge lifecycle service (Commercial Model, Slice D) — template-driven draft
 * Charge resolution. Turns a configured Charge Template + context into a draft/
 * scheduled Charge, consuming Services, Charge Templates, and Financial Policies.
 *
 * Doctrine: docs/platform/modules/financial-platform-domain.md
 *   * Charge is the lifecycle spine; resolution is recomputable.
 *   * Posting is the ONLY authoritative money write; posted charges are never
 *     mutated. This service writes `status='draft'` rows ONLY, is idempotent via
 *     `metadata.resolution_key` (the same convention as P3.3 draft resolution),
 *     and skips any existing posted charge. No invoices/ledger/payments/AR.
 *
 * Reuses the `charges` substrate (no parallel table) and the financial policy
 * resolver. rate_derived / usage_derived / attendance_derived templates preview
 * as placeholders unless an amount is resolvable; only fixed-amount templates
 * write a draft today.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { listChargeTemplates } from "@/lib/financials/chargeTemplates/chargeTemplateAuthoringService";
import { listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
import { resolveDueDate } from "@/lib/financials/policies/resolveDueDate";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import {
    resolveChargeFromTemplate,
    type ChargeIntent,
} from "@/lib/financials/chargeLifecycle/resolveChargeFromTemplate";

const TABLE = "charges";
const ENROLLMENT = "enrollment_agreement";

type Code = OperationalEnrollmentServiceError["code"];
function fail(code: Code, message: string): never {
    throw new OperationalEnrollmentServiceError(code, message);
}

type ChargeLifecycleRow = {
    id: string;
    status: string;
    amount_cents: number;
    occurs_on: string | null;
    billable_on: string | null;
    due_date: string | null;
    charge_template_id: string | null;
    metadata: Record<string, unknown> | null;
};

export type SimulateArgs = {
    templateId: string;
    agreementId?: string | null;
    /**
     * THE BILLABLE SOURCE, when it is not an enrollment agreement.
     *
     * A family incurs charges before anyone is enrolled — a waitlist fee, a registration fee, a
     * deposit — and those have no agreement to hang off. `customer` is an existing canonical
     * durable subject, so this carries the pair the charge is actually written against rather than
     * forcing every charge through an agreement that may not exist.
     *
     * Absent means "agreement", which keeps every existing caller and every enrolled-child charge
     * behaving exactly as before.
     */
    billableSource?: { type: "enrollment_agreement" | "customer"; id: string } | null;
    occursDate?: string | null;
    eventDate?: string | null;
    servicePeriodStart?: string | null;
    quantity?: number | null;
    unitAmountCents?: number | null;
    /**
     * Amount (cents) resolved by Rate Resolution for a `rate_derived` template.
     * Supplied by Operational Consumption (recurring tuition / drop-in) so the
     * existing resolver prices the charge — Consumption never reimplements pricing.
     */
    resolvedAmountCents?: number | null;
    /**
     * The AGREED commercial amount (cents) from an accepted `enrollment_pricing_terms` row.
     * Authoritative over the template's `amount_strategy`; see `ChargeResolutionContext`.
     */
    acceptedAmountCents?: number | null;
    today: string;
};

export type DraftWriteIntent = "create" | "recalculate" | "unchanged" | "skipped_posted" | "not_writable";

export type ChargePreviewResult = {
    intent: ChargeIntent;
    /** Advisory: what a draft write WOULD do. Preview writes nothing. */
    wouldWrite: DraftWriteIntent;
    existing: { id: string; status: string } | null;
};

async function loadTemplate(supabase: SupabaseClient, orgId: string, templateId: string) {
    const templates = await listChargeTemplates(supabase, orgId);
    const t = templates.find((x) => x.id === templateId);
    if (!t) fail("not_found", "Charge template not found");
    return t;
}

/**
 * THE ORGANISATION'S FINANCIAL POLICIES, READ ONCE PER RESOLUTION.
 *
 * Posting review and the due date are two questions for the same set of rows, and loading them
 * twice would be two reads and two chances to disagree about the effective window.
 */
async function resolveChargePolicies(
    supabase: SupabaseClient,
    orgId: string,
    serviceId: string | null,
    today: string,
): Promise<{ reviewRequired: boolean; policies: readonly FinancialPolicyRow[] }> {
    const policies = await listFinancialPolicies(supabase, orgId);
    const r = resolveFinancialPolicy(policies, "posting_review", { serviceId: serviceId ?? undefined }, today);
    return { reviewRequired: r.resolved ? r.policy.value.required === true : false, policies };
}

/**
 * ── WHEN THIS OBLIGATION IS DUE, FROM THE ORGANISATION'S OWN TERMS ───────────────────────────
 *
 * `resolveDueDate` has existed since the due-date policy work, with four strategies and a
 * deliberate `null` for "no rule configured". It had NO CALLER: `ChargeResolutionContext.dueDate`
 * was declared and never supplied, so every charge recorded `due_date: null` and a tenant could
 * configure terms that nothing in the product consumed.
 *
 * It runs AFTER the intent, not inside it, because it needs the two dates the intent computes —
 * the invoice date (`billable_on`) and the period this obligation belongs to. Resolving it earlier
 * would mean guessing them, and the whole point of the five-date model is that they are separate
 * facts rather than one fact wearing different names.
 *
 * `null` still means LEAVE IT ALONE. An organisation that has stated no terms keeps exactly the
 * behaviour it has today; nothing here defaults to "due on the invoice date" or to "due today",
 * because a collections deadline nobody configured is a consequence nobody chose.
 */
function dueDateForIntent(
    policies: readonly FinancialPolicyRow[],
    template: { service_id: string | null },
    intent: { billableOn: string | null; occursOn: string | null },
    servicePeriodStart: string | null,
): string | null {
    return resolveDueDate(policies, {
        invoiceDate: intent.billableOn,
        /* The commercial period this obligation sits in — the caller's when it named one. */
        periodStart: servicePeriodStart ?? intent.occursOn ?? null,
        serviceId: template.service_id,
    }).dueDate;
}

/**
 * The existing charge for this resolution key, searched IN THE SCOPE THE CHARGE WOULD BE WRITTEN.
 *
 * This used to be hardcoded to `enrollment_agreement`, and was only called when the caller had an
 * agreement. A household charge therefore had no idempotency at all: two submissions of the same
 * waitlist fee wrote two drafts, and the family owed it twice. The dedupe scope has to be the same
 * pair the insert uses, or it is not dedupe.
 */
async function findExistingByResolutionKey(
    supabase: SupabaseClient,
    orgId: string,
    source: { type: "enrollment_agreement" | "customer"; id: string },
    resolutionKey: string,
): Promise<ChargeLifecycleRow | null> {
    const { data, error } = await supabase
        .from(TABLE)
        .select("id, status, amount_cents, occurs_on, billable_on, due_date, charge_template_id, metadata")
        .eq("org_id", orgId)
        .eq("billable_source_type", source.type)
        .eq("billable_source_id", source.id);
    if (error) fail("db_error", error.message);
    const rows = (data ?? []) as ChargeLifecycleRow[];
    return rows.find((c) => (c.metadata as { resolution_key?: string } | null)?.resolution_key === resolutionKey) ?? null;
}

function isWritable(intent: ChargeIntent): boolean {
    // Only a resolvable, positive amount can become a draft (charges.amount_cents <> 0).
    return intent.eligible && intent.amountCents != null && intent.amountCents > 0;
}

/** Resolve a Charge intent + idempotency status for a template/context. No write. */
export async function previewTemplateCharge(
    supabase: SupabaseClient,
    orgId: string,
    args: SimulateArgs,
): Promise<ChargePreviewResult> {
    const template = await loadTemplate(supabase, orgId, args.templateId);
    const { reviewRequired: reviewByPolicy, policies } = await resolveChargePolicies(
        supabase, orgId, template.service_id, args.today,
    );
    const source = billableSourceFor(args);
    const intent = resolveChargeFromTemplate(template, {
        today: args.today,
        eventDate: args.eventDate,
        servicePeriodStart: args.servicePeriodStart,
        resolvedAmountCents: args.resolvedAmountCents,
        acceptedAmountCents: args.acceptedAmountCents,
        quantity: args.quantity,
        unitAmountCents: args.unitAmountCents,
        reviewRequiredByPolicy: reviewByPolicy,
        /*
         * THE SCOPE IS THE BILLABLE SOURCE, not the agreement.
         *
         * `tpl:<key>:<occurs_on>:<scopeKey>` was scoped to the agreement id, falling back to the
         * literal `"org"`. For a household charge that fallback made the key ORG-WIDE: two different
         * families' registration fees resolved to the same key on the same day. Scoping to the
         * source id makes the key mean what it says — this template, this date, this payer.
         */
        scopeKey: source?.id ?? "org",
    });
    /*
     * The organisation's due-date terms, applied to the dates this intent just produced. Only ever
     * narrows from null to a real date — an unconfigured tenant keeps today's behaviour exactly.
     */
    if (intent.eligible) {
        const due = dueDateForIntent(policies, template, intent, args.servicePeriodStart ?? null);
        if (due) intent.dueDate = due;
    }

    let existing: ChargeLifecycleRow | null = null;
    if (intent.eligible && source) {
        existing = await findExistingByResolutionKey(supabase, orgId, source, intent.resolutionKey);
    }

    let wouldWrite: DraftWriteIntent;
    if (!isWritable(intent) || !source) {
        wouldWrite = "not_writable";
    } else if (!existing) {
        wouldWrite = "create";
    } else if (existing.status !== "draft") {
        wouldWrite = "skipped_posted";
    } else if (
        existing.amount_cents !== intent.amountCents
        || existing.billable_on !== intent.billableOn
        /*
         * THE DUE DATE IS PART OF THE INTENT, SO IT IS PART OF CONVERGENCE.
         *
         * Only amount and billable date were compared, so a tenant who authored due-date terms
         * after a draft already stood never saw them reach it: the rerun answered `unchanged` and
         * the charge kept reading "No configured terms" forever. Measured on the certification
         * tenant, whose due-date policies begin 2026-09-18 while the September obligations invoice
         * on 2026-09-01.
         *
         * Guarded on a resolved date so an organisation with NO due-date policy keeps today's
         * behaviour exactly — a null intent never rewrites a date a charge already carries.
         */
        || (intent.dueDate != null && existing.due_date !== intent.dueDate)
    ) {
        wouldWrite = "recalculate";
    } else {
        wouldWrite = "unchanged";
    }

    return { intent, wouldWrite, existing: existing ? { id: existing.id, status: existing.status } : null };
}

export type DraftWriteResult =
    | {
          status: "created" | "recalculated" | "unchanged" | "skipped_posted";
          chargeId: string;
          resolutionKey: string;
          /**
           * WHETHER THIS CHARGE IS WAITING FOR A HUMAN, as CONFIGURATION already decided.
           *
           * The resolver has always computed this — the template's `review_required` OR'd with the
           * org's `posting_review` policy ("Whether draft charges require review before they can be
           * posted") — and this function has always thrown it away. Callers could not honour a
           * decision the tenant had already made, so every charge got the same ceremony whatever
           * the policy said.
           *
           * Reported, never acted on here: this service writes drafts and only drafts, and posting
           * stays the separate authoritative act it has always been. What changes is that a caller
           * can now ask whether a review boundary exists before deciding to cross it.
           */
          reviewRequired: boolean;
      }
    | { status: "not_writable"; reason: string };

/**
 * Idempotently write a DRAFT charge from a template (requires an agreement as the
 * billable source). Never posts; never mutates a posted charge. Re-running with
 * the same template/context recalculates the draft (no duplicates).
 */
/**
 * The pair a charge is written against — resolved ONCE so the guard, the dedupe scope and the
 * insert cannot disagree about what this charge belongs to.
 *
 * `agreementId` still wins when present, which is what preserves child attribution for an enrolled
 * child. Only when there is no agreement does a customer source apply, and it must be stated
 * explicitly by the caller — this never invents one.
 */
function billableSourceFor(
    args: SimulateArgs,
): { type: "enrollment_agreement" | "customer"; id: string } | null {
    if (args.agreementId) return { type: ENROLLMENT, id: args.agreementId };
    if (args.billableSource?.id) return { type: args.billableSource.type, id: args.billableSource.id };
    return null;
}

export async function writeTemplateDraftCharge(
    supabase: SupabaseClient,
    orgId: string,
    args: SimulateArgs & { actorUserId?: string | null },
): Promise<DraftWriteResult> {
    /*
     * A BILLABLE SOURCE is required; an ENROLLMENT AGREEMENT is not.
     *
     * This used to demand an agreement, which is what made Financials enrollment-gated: a family
     * with a registration fee and no enrolment had nothing to charge against. The requirement is a
     * source — and `customer` is one. Whether a PARTICULAR charge needs an agreement stays with its
     * template and the resolver, which is where that rule belongs.
     */
    const source = billableSourceFor(args);
    if (!source) fail("invalid_input", "a billable source is required to write a draft charge");
    const { intent, existing, wouldWrite } = await previewTemplateCharge(supabase, orgId, args);
    if (wouldWrite === "not_writable") {
        return { status: "not_writable", reason: intent.eligible ? "amount_not_resolvable" : intent.reason ?? "ineligible" };
    }
    if (wouldWrite === "skipped_posted") {
        return {
            status: "skipped_posted",
            chargeId: existing!.id,
            resolutionKey: intent.resolutionKey,
            reviewRequired: intent.reviewRequired,
        };
    }
    if (wouldWrite === "unchanged") {
        return {
            status: "unchanged",
            chargeId: existing!.id,
            resolutionKey: intent.resolutionKey,
            reviewRequired: intent.reviewRequired,
        };
    }

    const metadata = {
        resolution_key: intent.resolutionKey,
        charge_template_key: intent.templateKey,
        gl_mapping_key: intent.glMappingKey,
        responsibility_key: intent.responsibilityKey,
        review_required: intent.reviewRequired,
        lifecycle_status: intent.lifecycleStatus,
        source: "charge_template",
    };

    if (wouldWrite === "recalculate") {
        const { data, error } = await supabase
            .from(TABLE)
            .update({
                amount_cents: intent.amountCents,
                occurs_on: intent.occursOn,
                billable_on: intent.billableOn,
                /* A recalculated draft re-dates its due date from the same terms. */
                due_date: intent.dueDate,
                service_id: intent.serviceId,
                metadata,
                updated_by: args.actorUserId ?? null,
            })
            .eq("org_id", orgId)
            .eq("id", existing!.id)
            .eq("status", "draft") // never touch a posted row
            .select("id")
            .single();
        if (error || !data) fail("db_error", error?.message ?? "draft recalculate failed");
        return {
            status: "recalculated",
            chargeId: (data as { id: string }).id,
            resolutionKey: intent.resolutionKey,
            reviewRequired: intent.reviewRequired,
        };
    }

    // create
    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            org_id: orgId,
            job_id: null,
            // The resolved source, not a hardcoded one. An enrolled child still writes against its
            // agreement; a pre-enrolment family writes against the household.
            billable_source_type: source.type,
            billable_source_id: source.id,
            charge_type: "fee",
            charge_category: intent.chargeCategory,
            status: "draft",
            currency_code: intent.currencyCode,
            amount_cents: intent.amountCents,
            service_date: intent.occursOn,
            occurs_on: intent.occursOn,
            billable_on: intent.billableOn,
            /*
             * WHEN PAYMENT IS EXPECTED — separate from the invoice date beside it, and written only
             * where the organisation configured terms. `null` is the unconfigured tenant keeping
             * exactly the behaviour it has today, not "due on the invoice date".
             */
            due_date: intent.dueDate,
            charge_template_id: intent.templateId,
            service_id: intent.serviceId,
            description: intent.templateKey,
            metadata,
            // Actor attribution. The recalculate path above already wrote `updated_by`; the create
            // path did not, so a charge's original author was unrecoverable.
            created_by: args.actorUserId ?? null,
            updated_by: args.actorUserId ?? null,
        })
        .select("id")
        .single();
    /*
     * THE LOSER OF A RACE IS NOT AN ERROR.
     *
     * `charges_resolution_key_unique` makes the database the authority on "one charge per
     * resolution key per billable source", so two runs generating the same occurrence collide here
     * instead of both inserting. The read above cannot prevent that — it is a read — and the
     * collision means the other writer already created exactly the charge this one was about to.
     * So the winner is fetched and reported as `unchanged`, which is what a second identical run
     * has always meant on this path.
     */
    if (error && (error as { code?: string }).code === "23505") {
        const winner = await findExistingByResolutionKey(supabase, orgId, source, intent.resolutionKey);
        if (winner) {
            return {
                status: "unchanged",
                chargeId: winner.id,
                resolutionKey: intent.resolutionKey,
                reviewRequired: intent.reviewRequired,
            };
        }
    }
    if (error || !data) fail("db_error", error?.message ?? "draft create failed");
    return {
        status: "created",
        chargeId: (data as { id: string }).id,
        resolutionKey: intent.resolutionKey,
        reviewRequired: intent.reviewRequired,
    };
}
