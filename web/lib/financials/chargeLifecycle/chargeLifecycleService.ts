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

/** Resolve posting-review policy for a template's context (real policy consumption). */
async function resolveReviewPolicy(
    supabase: SupabaseClient,
    orgId: string,
    serviceId: string | null,
    today: string,
): Promise<boolean> {
    const policies = await listFinancialPolicies(supabase, orgId);
    const r = resolveFinancialPolicy(policies, "posting_review", { serviceId: serviceId ?? undefined }, today);
    return r.resolved ? r.policy.value.required === true : false;
}

async function findExistingByResolutionKey(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string,
    resolutionKey: string,
): Promise<ChargeLifecycleRow | null> {
    const { data, error } = await supabase
        .from(TABLE)
        .select("id, status, amount_cents, occurs_on, billable_on, charge_template_id, metadata")
        .eq("org_id", orgId)
        .eq("billable_source_type", ENROLLMENT)
        .eq("billable_source_id", agreementId);
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
    const reviewByPolicy = await resolveReviewPolicy(supabase, orgId, template.service_id, args.today);
    const intent = resolveChargeFromTemplate(template, {
        today: args.today,
        eventDate: args.eventDate,
        servicePeriodStart: args.servicePeriodStart,
        resolvedAmountCents: args.resolvedAmountCents,
        quantity: args.quantity,
        unitAmountCents: args.unitAmountCents,
        reviewRequiredByPolicy: reviewByPolicy,
        scopeKey: args.agreementId ?? "org",
    });

    let existing: ChargeLifecycleRow | null = null;
    if (intent.eligible && args.agreementId) {
        existing = await findExistingByResolutionKey(supabase, orgId, args.agreementId, intent.resolutionKey);
    }

    let wouldWrite: DraftWriteIntent;
    if (!isWritable(intent) || !billableSourceFor(args)) {
        wouldWrite = "not_writable";
    } else if (!existing) {
        wouldWrite = "create";
    } else if (existing.status !== "draft") {
        wouldWrite = "skipped_posted";
    } else if (existing.amount_cents !== intent.amountCents || existing.billable_on !== intent.billableOn) {
        wouldWrite = "recalculate";
    } else {
        wouldWrite = "unchanged";
    }

    return { intent, wouldWrite, existing: existing ? { id: existing.id, status: existing.status } : null };
}

export type DraftWriteResult =
    | { status: "created" | "recalculated" | "unchanged" | "skipped_posted"; chargeId: string; resolutionKey: string }
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
        return { status: "skipped_posted", chargeId: existing!.id, resolutionKey: intent.resolutionKey };
    }
    if (wouldWrite === "unchanged") {
        return { status: "unchanged", chargeId: existing!.id, resolutionKey: intent.resolutionKey };
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
        return { status: "recalculated", chargeId: (data as { id: string }).id, resolutionKey: intent.resolutionKey };
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
            charge_template_id: intent.templateId,
            service_id: intent.serviceId,
            description: intent.templateKey,
            metadata,
        })
        .select("id")
        .single();
    if (error || !data) fail("db_error", error?.message ?? "draft create failed");
    return { status: "created", chargeId: (data as { id: string }).id, resolutionKey: intent.resolutionKey };
}
