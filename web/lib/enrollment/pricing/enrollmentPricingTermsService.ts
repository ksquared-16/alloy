/**
 * ACCEPTING A PRICE — the server decides what was accepted, from facts it read itself.
 *
 * A browser may say which option the operator chose. It may not say what that option costs, which
 * facts it was chosen against, or whether it still applies. So this service re-reads the assignment
 * from its owners, re-resolves the options through Commercial Execution, and compares what it finds
 * with what the caller claims to have been looking at. Only then does anything persist.
 *
 * ── STALENESS IS A REFUSAL, NOT A WARNING ──
 *
 * The caller sends the `resolution_key` it was shown. That key is a hash over the assignment facts
 * and the config version, so if the schedule changed, the program changed, the site changed, the
 * date moved, or the catalog was republished between the operator seeing a price and pressing the
 * button, the recomputed key differs and the acceptance is refused. This is the whole of staleness:
 * no flag to maintain, no background job, nothing that can fall out of step.
 *
 * ── AN OVERRIDE IS AN EXCEPTION, AND EXCEPTIONS ARE AUTHORIZED AND EXPLAINED ──
 *
 * Acceptance takes the recommendation. Override does not, and needs three things acceptance does
 * not: a permission the actor actually holds, a reason in words, and an option that is still one of
 * the catalog's own. It cannot invent an amount — an override chooses a DIFFERENT AUTHORED OPTION,
 * never a number the operator typed, because a price with no authored source is untraceable by
 * construction and no later reader could explain it.
 *
 * Authorization is checked HERE, once, against grants the caller did not supply themselves, and the
 * database's own RLS is the second gate beneath it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { composeCommercialExport } from "@/lib/commercial/execution/export/composeCommercialExport";
import {
    resolveAssignmentPricingOptions,
    type ApplicableOption,
    type AssignmentPricingResolution,
} from "@/lib/commercial/execution/evaluate/resolveOptions";
import { readAssignmentPricingFacts } from "@/lib/enrollment/pricing/assignmentPricingFacts";

/** The permission an override requires. Acceptance is ordinary operational work and requires none. */
export const ENROLLMENT_PRICING_OVERRIDE_PERMISSION = "enrollment.pricing.override" as const;

export type EnrollmentPricingTermRow = {
    id: string;
    org_id: string;
    opportunity_customer_member_id: string;
    customer_member_id: string;
    enrollment_agreement_id: string | null;
    term_kind: string;
    source_entity: string;
    source_id: string;
    recommended_source_id: string | null;
    variant_id: string | null;
    offering_id: string | null;
    program_key: string | null;
    location_id: string | null;
    cadence_key: string;
    payer_type: string;
    amount_cents: number;
    currency_code: string;
    state: "accepted" | "overridden";
    override_reason: string | null;
    resolution_key: string;
    resolved_facts: Record<string, unknown>;
    config_version: string | null;
    effective_start: string;
    effective_end: string | null;
    supersedes_term_id: string | null;
    superseded_at: string | null;
    accepted_by: string | null;
    accepted_at: string;
};

export type PricingCommitRefusalCode =
    | "assignment_not_found"
    | "stale_resolution"
    | "option_no_longer_valid"
    | "no_recommendation"
    | "override_permission_required"
    | "override_reason_required"
    | "override_matches_recommendation"
    | "term_already_accepted"
    | "db_error";

export type PricingCommitResult =
    | { ok: true; term: EnrollmentPricingTermRow; idempotent: boolean; resolution: AssignmentPricingResolution }
    | { ok: false; code: PricingCommitRefusalCode; message: string };

export type PricingCommitArgs = {
    orgId: string;
    actorUserId: string | null;
    /** The actor's REAL grants, resolved server-side. Never taken from a payload. */
    permissionKeys: readonly string[];
    opportunityCustomerMemberId: string;
    /** The key the operator was shown. Its disagreement with the server's is staleness. */
    resolutionKey: string;
    /** The authored option chosen — a `commercial_tuition_rates` id, never an amount. */
    selectedSourceId: string;
    /** The billing frequency the operator settled on; part of the facts the key covers. */
    cadenceKey?: string | null;
    /** The date being priced. Defaults to the assignment's own start. */
    asOf?: string | null;
    overrideReason?: string | null;
    /** Explicit intent to replace a live term on the same date. Absent, a clash is refused. */
    supersede?: boolean;
};

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function optionById(resolution: AssignmentPricingResolution, id: string): ApplicableOption | null {
    if (resolution.kind === "no_match") return null;
    return resolution.applicable.find((o) => o.source.id === id) ?? null;
}

function recommendedIdOf(resolution: AssignmentPricingResolution): string | null {
    return resolution.kind === "recommended" ? resolution.recommended.source.id : null;
}

/**
 * Re-read, re-resolve, and check the caller's claim against what the server found.
 *
 * Shared by both commit paths so acceptance and override cannot come to differ about what "still
 * applies" means.
 */
export async function resolveForCommit(
    supabase: SupabaseClient,
    args: PricingCommitArgs,
): Promise<
    | { ok: true; read: Awaited<ReturnType<typeof readAssignmentPricingFacts>> & { ok: true }; resolution: AssignmentPricingResolution }
    | { ok: false; code: PricingCommitRefusalCode; message: string }
> {
    const read = await readAssignmentPricingFacts(supabase, {
        orgId: args.orgId,
        opportunityCustomerMemberId: args.opportunityCustomerMemberId,
        asOf: args.asOf ?? null,
        cadenceKey: args.cadenceKey ?? null,
    });
    if (!read.ok) return { ok: false, code: read.code, message: read.message };

    const exported = await composeCommercialExport({
        supabase,
        orgId: args.orgId,
        asOf: read.facts.asOf,
    });
    const resolution = resolveAssignmentPricingOptions(exported.export, read.facts);

    if (resolution.resolutionKey !== t(args.resolutionKey)) {
        return {
            ok: false,
            code: "stale_resolution",
            message:
                "This assignment has changed since the tuition was resolved. Resolve it again before "
                + "accepting, so the price matches the assignment as it now stands.",
        };
    }
    return { ok: true, read, resolution };
}

async function insertTerm(
    supabase: SupabaseClient,
    args: PricingCommitArgs & {
        read: Awaited<ReturnType<typeof readAssignmentPricingFacts>> & { ok: true };
        resolution: AssignmentPricingResolution;
        option: ApplicableOption;
        state: "accepted" | "overridden";
    },
): Promise<PricingCommitResult> {
    const { read, resolution, option } = args;
    const effectiveStart = read.facts.asOf;

    // A live term already standing for this assignment on this date.
    const { data: liveRows, error: liveError } = await supabase
        .from("enrollment_pricing_terms")
        .select("*")
        .eq("org_id", args.orgId)
        .eq("opportunity_customer_member_id", read.subject.opportunityCustomerMemberId)
        .eq("term_kind", "tuition")
        .eq("effective_start", effectiveStart)
        .is("superseded_at", null);
    if (liveError) return { ok: false, code: "db_error", message: liveError.message };
    const live = ((liveRows ?? []) as EnrollmentPricingTermRow[])[0] ?? null;

    if (live) {
        // THE RETRY. The same decision, sent twice, is one term — answered from the row that already
        // exists rather than by writing a second one.
        const equivalent =
            live.resolution_key === resolution.resolutionKey
            && live.source_id === option.source.id
            && live.amount_cents === option.amount.amountCents
            && live.state === args.state
            && t(live.override_reason) === t(args.overrideReason);
        if (equivalent) return { ok: true, term: live, idempotent: true, resolution };
        if (!args.supersede) {
            return {
                ok: false,
                code: "term_already_accepted",
                message:
                    "Tuition is already accepted for this assignment from this date. Supersede it "
                    + "explicitly, or accept the change from a later date.",
            };
        }
    }

    const row = {
        org_id: args.orgId,
        opportunity_customer_member_id: read.subject.opportunityCustomerMemberId,
        customer_member_id: read.subject.customerMemberId,
        // Recorded the moment it exists so charge generation can reach the billable source; learned
        // later, and never re-pointed, when the assignment enrols after being priced.
        enrollment_agreement_id: read.subject.enrollmentAgreementId,
        term_kind: "tuition",
        source_entity: option.source.entity,
        source_id: option.source.id,
        recommended_source_id: recommendedIdOf(resolution),
        variant_id: option.variantId,
        offering_id: option.offeringId,
        program_key: option.programKey,
        location_id: option.locationId,
        cadence_key: option.cadenceKey,
        payer_type: option.payerType,
        amount_cents: option.amount.amountCents,
        currency_code: option.amount.currency,
        state: args.state,
        override_reason: args.state === "overridden" ? t(args.overrideReason) : null,
        resolution_key: resolution.resolutionKey,
        // The whole of "why this price", kept where a later reader will find it.
        resolved_facts: {
            facts: read.facts,
            fact_sources: read.sources,
            matched: option.matched,
            scope: option.scope,
            effective: option.effective,
            resolution_kind: resolution.kind,
            recommended_source_id: recommendedIdOf(resolution),
            rejected: resolution.kind === "no_match" ? resolution.rejected : resolution.rejected,
        },
        config_version: resolution.configVersion.version,
        effective_start: effectiveStart,
        supersedes_term_id: live?.id ?? null,
        accepted_by: args.actorUserId,
    };

    if (live && args.supersede) {
        const { error: closeError } = await supabase
            .from("enrollment_pricing_terms")
            .update({ superseded_at: new Date().toISOString(), effective_end: effectiveStart })
            .eq("id", live.id);
        if (closeError) return { ok: false, code: "db_error", message: closeError.message };
    }

    const { data: inserted, error: insertError } = await supabase
        .from("enrollment_pricing_terms")
        .insert(row)
        .select("*")
        .single();
    if (insertError) {
        // Two identical submissions racing: the index refused the second, and the first is the
        // answer. Read it back rather than reporting a failure the operator did not cause.
        if (insertError.code === "23505") {
            const { data: raced } = await supabase
                .from("enrollment_pricing_terms")
                .select("*")
                .eq("org_id", args.orgId)
                .eq("opportunity_customer_member_id", read.subject.opportunityCustomerMemberId)
                .eq("term_kind", "tuition")
                .eq("effective_start", effectiveStart)
                .is("superseded_at", null)
                .maybeSingle();
            if (raced) {
                return { ok: true, term: raced as EnrollmentPricingTermRow, idempotent: true, resolution };
            }
        }
        return { ok: false, code: "db_error", message: insertError.message };
    }
    return { ok: true, term: inserted as EnrollmentPricingTermRow, idempotent: false, resolution };
}

/** Accept the recommendation, exactly as the server itself resolves it. */
export async function acceptEnrollmentPricingTerm(
    supabase: SupabaseClient,
    args: PricingCommitArgs,
): Promise<PricingCommitResult> {
    const re = await resolveForCommit(supabase, args);
    if (!re.ok) return re;
    const { read, resolution } = re;

    if (resolution.kind !== "recommended") {
        return {
            ok: false,
            code: "no_recommendation",
            message:
                resolution.kind === "ambiguous"
                    ? "More than one tuition option applies equally. Choose one — that choice is an override."
                    : "No configured tuition applies to this assignment.",
        };
    }
    // Accepting means accepting the RECOMMENDATION. A different option is an override, and goes
    // through the path that asks for authority and a reason.
    if (t(args.selectedSourceId) !== resolution.recommended.source.id) {
        return {
            ok: false,
            code: "option_no_longer_valid",
            message: "The option accepted is not the one now recommended. Resolve tuition again.",
        };
    }
    return insertTerm(supabase, { ...args, read, resolution, option: resolution.recommended, state: "accepted" });
}

/** Choose a different authored option than the one recommended — authorized, and explained. */
export async function overrideEnrollmentPricingTerm(
    supabase: SupabaseClient,
    args: PricingCommitArgs,
): Promise<PricingCommitResult> {
    // Authority first, and from grants the caller did not supply. An unauthorized override must fail
    // whatever the browser chose to render.
    if (!args.permissionKeys.includes(ENROLLMENT_PRICING_OVERRIDE_PERMISSION)) {
        return {
            ok: false,
            code: "override_permission_required",
            message: "Overriding recommended tuition requires the enrollment pricing override permission.",
        };
    }
    if (!t(args.overrideReason)) {
        return {
            ok: false,
            code: "override_reason_required",
            message: "An override must say why. Record the reason the recommended tuition does not apply.",
        };
    }

    const re = await resolveForCommit(supabase, args);
    if (!re.ok) return re;
    const { read, resolution } = re;

    // The chosen option must still be one the CATALOG offers this assignment. This is what stops an
    // override becoming an arbitrary amount: there is no path here that accepts a number.
    const option = optionById(resolution, t(args.selectedSourceId));
    if (!option) {
        return {
            ok: false,
            code: "option_no_longer_valid",
            message:
                "That tuition option no longer applies to this assignment. Resolve tuition again and "
                + "choose from what the catalog now offers.",
        };
    }
    if (option.source.id === recommendedIdOf(resolution)) {
        return {
            ok: false,
            code: "override_matches_recommendation",
            message: "That is the recommended tuition. Accept it rather than overriding to it.",
        };
    }
    return insertTerm(supabase, { ...args, read, resolution, option, state: "overridden" });
}

/**
 * THE DOWNSTREAM READ — what a later charge-generation thread consumes, and nothing more.
 *
 * Everything needed to raise an obligation is here: who, under which agreement, how much, how
 * often, from when, against which authored option, and why. Nothing here IS an obligation.
 */
export type AcceptedPricingTerm = {
    termId: string;
    opportunityCustomerMemberId: string;
    customerMemberId: string;
    enrollmentAgreementId: string | null;
    termKind: string;
    amountCents: number;
    currencyCode: string;
    cadenceKey: string;
    effectiveStart: string;
    effectiveEnd: string | null;
    source: { entity: string; id: string };
    variantId: string | null;
    offeringId: string | null;
    programKey: string | null;
    locationId: string | null;
    payerType: string;
    state: "accepted" | "overridden";
    overrideReason: string | null;
    recommendedSourceId: string | null;
    configVersion: string | null;
    resolutionKey: string;
    acceptedBy: string | null;
    acceptedAt: string;
};

function toAcceptedTerm(row: EnrollmentPricingTermRow): AcceptedPricingTerm {
    return {
        termId: row.id,
        opportunityCustomerMemberId: row.opportunity_customer_member_id,
        customerMemberId: row.customer_member_id,
        enrollmentAgreementId: row.enrollment_agreement_id,
        termKind: row.term_kind,
        amountCents: row.amount_cents,
        currencyCode: row.currency_code,
        cadenceKey: row.cadence_key,
        effectiveStart: row.effective_start,
        effectiveEnd: row.effective_end,
        source: { entity: row.source_entity, id: row.source_id },
        variantId: row.variant_id,
        offeringId: row.offering_id,
        programKey: row.program_key,
        locationId: row.location_id,
        payerType: row.payer_type,
        state: row.state,
        overrideReason: row.override_reason,
        recommendedSourceId: row.recommended_source_id,
        configVersion: row.config_version,
        resolutionKey: row.resolution_key,
        acceptedBy: row.accepted_by,
        acceptedAt: row.accepted_at,
    };
}

/** The live accepted terms for an org, optionally narrowed to one assignment or one agreement. */
export async function readAcceptedPricingTerms(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        opportunityCustomerMemberId?: string | null;
        enrollmentAgreementId?: string | null;
        /** Only terms in force on this date. */
        onDate?: string | null;
    },
): Promise<AcceptedPricingTerm[]> {
    let query = supabase
        .from("enrollment_pricing_terms")
        .select("*")
        .eq("org_id", args.orgId)
        .is("superseded_at", null)
        .order("effective_start", { ascending: false });
    if (t(args.opportunityCustomerMemberId)) {
        query = query.eq("opportunity_customer_member_id", t(args.opportunityCustomerMemberId));
    }
    if (t(args.enrollmentAgreementId)) {
        query = query.eq("enrollment_agreement_id", t(args.enrollmentAgreementId));
    }
    const { data } = await query;
    let rows = ((data ?? []) as EnrollmentPricingTermRow[]).map(toAcceptedTerm);
    const onDate = t(args.onDate);
    if (onDate) {
        rows = rows.filter(
            (r) => r.effectiveStart <= onDate && (r.effectiveEnd == null || r.effectiveEnd >= onDate),
        );
    }
    return rows;
}

/**
 * LEARNING THE AGREEMENT. An assignment priced before it enrolled gains its agreement id when the
 * enrolment exists. The database refuses to re-point one that is already set, so this is safe to
 * call repeatedly and safe to call late.
 */
export async function linkPricingTermsToAgreement(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityCustomerMemberId: string; enrollmentAgreementId: string },
): Promise<{ linked: number }> {
    const { data } = await supabase
        .from("enrollment_pricing_terms")
        .update({ enrollment_agreement_id: args.enrollmentAgreementId })
        .eq("org_id", args.orgId)
        .eq("opportunity_customer_member_id", args.opportunityCustomerMemberId)
        .is("enrollment_agreement_id", null)
        .select("id");
    return { linked: (data ?? []).length };
}

/**
 * WHAT WOULD BE RECORDED — the same re-read and re-resolution the commit performs, reported instead
 * of written. A preview that ran different logic would be a description of a different act.
 */
export async function previewEnrollmentPricingCommit(
    supabase: SupabaseClient,
    args: PricingCommitArgs,
    intent: "accept" | "override",
): Promise<{ summary: string; changes: string[] }> {
    const re = await resolveForCommit(supabase, args);
    if (!re.ok) return { summary: re.message, changes: [] };
    const { read, resolution } = re;
    if (resolution.kind === "no_match") {
        return { summary: "No configured tuition applies to this assignment.", changes: [] };
    }
    const option = optionById(resolution, t(args.selectedSourceId))
        ?? (resolution.kind === "recommended" ? resolution.recommended : null);
    if (!option) {
        return { summary: "That tuition option no longer applies to this assignment.", changes: [] };
    }
    const money = (option.amount.amountCents / 100).toLocaleString(undefined, {
        style: "currency",
        currency: option.amount.currency || "USD",
    });
    return {
        summary: `${money} ${option.cadenceKey}, effective ${read.facts.asOf}`,
        changes: [
            ...option.matched,
            intent === "override"
                ? `Override · recommended was ${recommendedIdOf(resolution) ?? "ambiguous"}`
                : "Accepts the recommendation",
            "Records an effective-dated pricing term — no charge is created.",
        ],
    };
}
