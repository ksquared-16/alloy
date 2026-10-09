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
import {
    EMPTY_FINANCIAL_POLICY_SCOPE,
    policyScopeNarrowingNeeded,
    resolveFinancialPolicyScope,
    type FinancialPolicyScope,
} from "@/lib/financials/policies/resolveFinancialPolicyScope";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import {
    bindChargeBillingPeriodWithBounds,
    previewChargeBillingPeriod,
} from "@/lib/financials/billingPeriods/bindChargeBillingPeriod";
import {
    chargeDateProvenance,
    resolveChargeDateChain,
    resolveInvoiceTimingRule,
    type ChargeDateChain,
    type ChargeDatePeriod,
} from "@/lib/financials/chargeDates/resolveChargeDateChain";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";
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
 * Posting review, invoice timing and the due date are three questions for the same set of rows, and
 * loading them separately would be three reads and three chances to disagree about the window.
 */
async function loadChargePolicies(supabase: SupabaseClient, orgId: string): Promise<readonly FinancialPolicyRow[]> {
    return listFinancialPolicies(supabase, orgId);
}

/**
 * POSTING REVIEW, NARROWED BY THE SUBJECT'S OWN SCOPE.
 *
 * This resolved with `serviceId` alone, so a review rule scoped to a location or to one account
 * could never match on the write path, while consumption — which passes the location — honoured it.
 * Two writers, two answers to "does this charge need a person?". It now narrows by the same scope
 * the due date and invoice timing use.
 */
function reviewRequiredByPolicy(
    policies: readonly FinancialPolicyRow[],
    serviceId: string | null,
    scope: FinancialPolicyScope,
    today: string,
): boolean {
    const r = resolveFinancialPolicy(
        policies,
        "posting_review",
        {
            serviceId: serviceId ?? undefined,
            locationId: scope.locationId ?? undefined,
            customerId: scope.customerId ?? undefined,
        },
        today,
    );
    return r.resolved ? r.policy.value.required === true : false;
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

/**
 * THE DATE CHAIN FOR ONE INTENT, given the billing period it belongs to.
 *
 * Shared by preview (period read without writing) and commit (period read back from the binding),
 * so the two run the same pure resolver over the same kind of input and cannot disagree about the
 * invoice date, the due date or whether the charge waits for its period.
 */
function chainForIntent(args: {
    intent: ChargeIntent;
    template: ChargeTemplateRow;
    policies: readonly FinancialPolicyRow[];
    period: ChargeDatePeriod | null;
    scope: FinancialPolicyScope;
    /** Where invoice timing narrows by site: the enrolment's, else the location whose calendar governs. */
    invoiceLocationId: string | null;
    createdOn: string;
    today: string;
}): ChargeDateChain {
    const serviceDate = args.intent.occursOn as string;
    const invoiceRule = resolveInvoiceTimingRule({
        policies: args.policies,
        template: args.template,
        locationId: args.invoiceLocationId,
        customerId: args.scope.customerId,
        serviceId: args.template.service_id,
        asOf: args.period?.startsOn ?? serviceDate,
    });
    return resolveChargeDateChain({
        serviceDate,
        period: args.period,
        invoiceRule,
        policies: args.policies,
        scope: {
            serviceId: args.template.service_id,
            customerId: args.scope.customerId,
            locationId: args.scope.locationId,
        },
        createdOn: args.createdOn,
        businessDate: args.today,
    });
}

/** Apply a resolved chain to the intent: the chain is the authority for every date it decides. */
function applyChain(intent: ChargeIntent, chain: ChargeDateChain): void {
    intent.dateChain = chain;
    intent.billableOn = chain.invoice.actual;
    intent.dueDate = chain.due.actual;
    intent.lifecycleStatus = chain.posting.gate === "awaits_period" ? "scheduled" : "draft";
}

/** The day this draft was first created, so a recalculation never re-dates its invoice forward. */
function createdOnOf(existing: ChargeLifecycleRow | null, today: string): string {
    const dates = (existing?.metadata as { charge_dates?: { created_on?: unknown } } | null)?.charge_dates;
    const v = typeof dates?.created_on === "string" ? dates.created_on : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : today;
}

/** Resolve a Charge intent + idempotency status for a template/context. No write. */
export async function previewTemplateCharge(
    supabase: SupabaseClient,
    orgId: string,
    args: SimulateArgs,
): Promise<ChargePreviewResult> {
    return (await resolveTemplateCharge(supabase, orgId, args)).result;
}

/** What the write path needs to re-run the chain against the period it actually binds. */
type ResolutionContext = {
    template: ChargeTemplateRow;
    policies: readonly FinancialPolicyRow[];
    existing: ChargeLifecycleRow | null;
    /** The scope the chain narrowed by (the subject's, completed by the household the period resolved). */
    chainScope: FinancialPolicyScope;
    invoiceLocationId: string | null;
};

async function resolveTemplateCharge(
    supabase: SupabaseClient,
    orgId: string,
    args: SimulateArgs,
): Promise<{ result: ChargePreviewResult; ctx: ResolutionContext }> {
    const template = await loadTemplate(supabase, orgId, args.templateId);
    const policies = await loadChargePolicies(supabase, orgId);
    const source = billableSourceFor(args);
    /*
     * THE SUBJECT'S SCOPE, read only when some rule of a type this resolution consumes is scoped to an
     * account or a site — otherwise it cannot change any answer and the round trip is skipped.
     */
    const scope = source && (
        policyScopeNarrowingNeeded(policies, "due_date")
        || policyScopeNarrowingNeeded(policies, "posting_review")
        || policyScopeNarrowingNeeded(policies, "invoice_timing")
    )
        ? await resolveFinancialPolicyScope(supabase, {
              orgId,
              billableSourceType: source.type,
              billableSourceId: source.id,
          })
        : EMPTY_FINANCIAL_POLICY_SCOPE;
    const intent = resolveChargeFromTemplate(template, {
        today: args.today,
        eventDate: args.eventDate,
        servicePeriodStart: args.servicePeriodStart,
        resolvedAmountCents: args.resolvedAmountCents,
        acceptedAmountCents: args.acceptedAmountCents,
        quantity: args.quantity,
        unitAmountCents: args.unitAmountCents,
        reviewRequiredByPolicy: reviewRequiredByPolicy(policies, template.service_id, scope, args.today),
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

    let existing: ChargeLifecycleRow | null = null;
    if (intent.eligible && source) {
        existing = await findExistingByResolutionKey(supabase, orgId, source, intent.resolutionKey);
    }

    /*
     * ── SERVICE DATE → BILLING PERIOD → INVOICE → DUE → POSTING ──────────────────────────────
     *
     * The period is resolved from the SERVICE DATE (Director decision, W7): invoice timing decides
     * when we bill, never which interval the obligation belongs to. Read without writing — a
     * preview mints no billing period. A refusal (no calendar, an ambiguous household) is carried
     * on the intent so the surface can say so; the write path will refuse the same way.
     */
    let invoiceLocationId = scope.locationId;
    let chainScope = scope;
    if (intent.eligible && intent.occursOn) {
        let period: ChargeDatePeriod | null = null;
        if (source) {
            const found = await previewChargeBillingPeriod(supabase, {
                orgId,
                billableSourceType: source.type,
                billableSourceId: source.id,
                placementDate: intent.occursOn,
            });
            if (found.kind === "resolved") {
                period = found.period;
                invoiceLocationId = scope.locationId ?? found.calendarSourceLocationId;
                chainScope = { customerId: scope.customerId ?? found.customerId, locationId: scope.locationId };
            } else if (found.kind === "unresolved") {
                intent.periodIssue = { code: found.code, message: found.message };
            }
        }
        applyChain(intent, chainForIntent({
            intent,
            template,
            policies,
            period,
            scope: chainScope,
            invoiceLocationId,
            createdOn: createdOnOf(existing, args.today),
            today: args.today,
        }));
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

    return {
        result: { intent, wouldWrite, existing: existing ? { id: existing.id, status: existing.status } : null },
        ctx: { template, policies, existing, chainScope, invoiceLocationId },
    };
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
    const { result, ctx } = await resolveTemplateCharge(supabase, orgId, args);
    const { intent, existing, wouldWrite } = result;
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

    const metadataFor = (chain: ChargeDateChain | null | undefined) => ({
        resolution_key: intent.resolutionKey,
        charge_template_key: intent.templateKey,
        gl_mapping_key: intent.glMappingKey,
        responsibility_key: intent.responsibilityKey,
        review_required: intent.reviewRequired,
        lifecycle_status: intent.lifecycleStatus,
        source: "charge_template",
        /* How every date on this charge was reached, so it can be explained without re-resolving. */
        ...(chain ? { charge_dates: chargeDateProvenance(chain) } : {}),
    });

    if (wouldWrite === "recalculate") {
        /*
         * The prior metadata is kept and the resolution's keys laid over it, so a recalculation does
         * not erase what other authorities recorded on the draft (a posting gate, a failed attempt).
         */
        const metadata = {
            ...((ctx.existing?.metadata ?? {}) as Record<string, unknown>),
            ...metadataFor(intent.dateChain),
        };
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

    /*
     * ── CREATE: BIND THE PERIOD FROM THE SERVICE DATE, THEN DATE THE CHARGE FROM THAT PERIOD ──
     *
     * The binder is the only function that turns a household and a date into a period id. The
     * chain is re-run against the period it actually bound — the same pure resolver the preview
     * ran — so the invoice and due dates written are derived from the row this charge references.
     */
    const bound = await bindChargeBillingPeriodWithBounds(supabase, {
        orgId,
        billableSourceType: source.type,
        billableSourceId: source.id,
        placementDate: intent.occursOn ?? args.today,
    });
    if (bound.period && intent.occursOn) {
        applyChain(intent, chainForIntent({
            intent,
            template: ctx.template,
            policies: ctx.policies,
            period: bound.period,
            scope: ctx.chainScope,
            invoiceLocationId: ctx.invoiceLocationId,
            createdOn: createdOnOf(ctx.existing, args.today),
            today: args.today,
        }));
    }
    const metadata = metadataFor(intent.dateChain);

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
            /* The household's commercial period, bound from the SERVICE date above. */
            ...bound.binding,
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
