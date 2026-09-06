/**
 * THE ONE PLACE AN ASSIGNMENT'S TUITION IS COMPOSED FOR AN OPERATOR SURFACE.
 *
 * Both routes that answer "what does this child's tuition look like" call this, so neither can grow
 * a second matching algorithm. That is not a stylistic preference: the surfaces drifted apart once
 * already, and the drift was invisible because each had its own green unit tests over rows it
 * invented itself.
 *
 * Resolution is NOT performed here. It is performed by Commercial Execution
 * (`resolveAssignmentPricingOptions`) over facts read from their owners
 * (`readAssignmentPricingFacts`). This module only assembles what a surface needs to render:
 * the state, the recommendation, the alternatives, the explanation, and whatever has been accepted.
 *
 * ── STALENESS IS A COMPARISON, NOT A FLAG ──
 *
 * An accepted term recorded the resolution key it was accepted under. Re-resolving today produces a
 * key from today's facts. When they differ, the assignment has moved since the price was agreed —
 * and the surface says so rather than presenting an old number as current. The accepted term itself
 * is untouched: history is not wrong, it is just no longer the answer to today's question.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { composeCommercialExport } from "@/lib/commercial/execution/export/composeCommercialExport";
import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";
import {
    resolveAssignmentPricingOptions,
    type ApplicableOption,
    type AssignmentPricingFacts,
} from "@/lib/commercial/execution/evaluate/resolveOptions";
import { readAssignmentPricingFacts } from "@/lib/enrollment/pricing/assignmentPricingFacts";
import {
    readAcceptedPricingTerms,
    type AcceptedPricingTerm,
} from "@/lib/enrollment/pricing/enrollmentPricingTermsService";

/** One option as an operator surface renders it. */
export type TuitionOptionView = {
    sourceId: string;
    offeringId: string;
    variantId: string;
    variantLabel: string;
    programKey: string;
    attendanceType: string;
    cadenceKey: string;
    amountCents: number;
    currencyCode: string;
    /** "$1,200.00/monthly" — formatted once, so two surfaces cannot format it differently. */
    amountLabel: string;
    scope: "location" | "org_default";
    effectiveStart: string | null;
    effectiveEnd: string | null;
    /** Why it applies, in operator-readable fragments. */
    matched: string[];
};

export type AssignmentTuitionView = {
    opportunityCustomerMemberId: string;
    customerMemberId: string;
    childLabel: string;
    enrollmentAgreementId: string | null;
    facts: AssignmentPricingFacts;
    /** Which owner supplied each fact — the answer to "why five days". */
    factSources: Record<string, string>;
    /** The resolution's own identity, carried so a commit can prove what it was looking at. */
    resolutionKey: string;
    configVersion: string;
    state: "recommended" | "ambiguous" | "no_match";
    /** Present only when the resolution is deterministic. */
    recommended: TuitionOptionView | null;
    /** The equally-surviving candidates when the configuration has not said which applies. */
    tied: TuitionOptionView[];
    /** Every option that applies, recommendation included. */
    applicable: TuitionOptionView[];
    /** Why the others did not, told apart by reason. */
    rejected: Array<{ sourceId: string; reason: string; detail: string }>;
    /** Why nothing applies, when nothing does. */
    noMatchReason: string | null;
    /** What has actually been agreed, if anything. */
    accepted: AcceptedPricingTerm | null;
    /** True when the accepted term was agreed against facts that have since changed. */
    acceptedIsStale: boolean;
};

function money(cents: number, currency: string): string {
    return (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
}

function toOptionView(o: ApplicableOption): TuitionOptionView {
    return {
        sourceId: o.source.id,
        offeringId: o.offeringId,
        variantId: o.variantId,
        variantLabel: o.variantLabel,
        programKey: o.programKey,
        attendanceType: o.attendanceType,
        cadenceKey: o.cadenceKey,
        amountCents: o.amount.amountCents,
        currencyCode: o.amount.currency,
        amountLabel: `${money(o.amount.amountCents, o.amount.currency)}/${o.cadenceKey}`,
        scope: o.scope,
        effectiveStart: o.effective.start,
        effectiveEnd: o.effective.end,
        matched: o.matched,
    };
}

/**
 * Compose the tuition view for ONE assignment.
 *
 * @param exported pass a shared `CommercialExport` when composing several assignments at once — the
 *   catalog is the same for all of them, and reading it per child would make the config version vary
 *   across a single answer.
 */
export async function buildAssignmentTuitionView(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        opportunityCustomerMemberId: string;
        childLabel?: string | null;
        cadenceKey?: string | null;
        asOf?: string | null;
        exported?: CommercialExport;
    },
): Promise<AssignmentTuitionView | null> {
    const read = await readAssignmentPricingFacts(supabase, {
        orgId: args.orgId,
        opportunityCustomerMemberId: args.opportunityCustomerMemberId,
        asOf: args.asOf ?? null,
        cadenceKey: args.cadenceKey ?? null,
    });
    if (!read.ok) return null;

    const exported =
        args.exported
        ?? (await composeCommercialExport({ supabase, orgId: args.orgId, asOf: read.facts.asOf })).export;
    const resolution = resolveAssignmentPricingOptions(exported, read.facts);

    const accepted = (
        await readAcceptedPricingTerms(supabase, {
            orgId: args.orgId,
            opportunityCustomerMemberId: args.opportunityCustomerMemberId,
        })
    )[0] ?? null;

    const applicable = resolution.kind === "no_match" ? [] : resolution.applicable.map(toOptionView);

    return {
        opportunityCustomerMemberId: read.subject.opportunityCustomerMemberId,
        customerMemberId: read.subject.customerMemberId,
        childLabel: (args.childLabel ?? "").trim() || "Child",
        enrollmentAgreementId: read.subject.enrollmentAgreementId,
        facts: read.facts,
        factSources: read.sources as unknown as Record<string, string>,
        resolutionKey: resolution.resolutionKey,
        configVersion: resolution.configVersion.version,
        state: resolution.kind === "recommended" ? "recommended" : resolution.kind,
        recommended: resolution.kind === "recommended" ? toOptionView(resolution.recommended) : null,
        tied: resolution.kind === "ambiguous" ? resolution.tied.map(toOptionView) : [],
        applicable,
        rejected: resolution.rejected.map((r) => ({
            sourceId: r.source.id,
            reason: r.reason,
            detail: r.detail,
        })),
        noMatchReason: resolution.kind === "no_match" ? resolution.reason : null,
        accepted,
        // Compared against the CURRENT resolution, so a change to the assignment or a republished
        // catalog both surface as staleness — which they both are.
        acceptedIsStale: Boolean(accepted && accepted.resolutionKey !== resolution.resolutionKey),
    };
}

/** Compose the tuition view for every assignment on an opportunity, over one shared catalog read. */
export async function buildOpportunityTuitionViews(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string; asOf?: string | null },
): Promise<AssignmentTuitionView[]> {
    const { data: ocmRows } = await supabase
        .from("opportunity_customer_members")
        .select("id, customer_member_id, customer_members(first_name, last_name)")
        .eq("org_id", args.orgId)
        .eq("opportunity_id", args.opportunityId);

    const rows = (ocmRows ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return [];

    // ONE catalog read for the whole answer: a config version that varied between two children of
    // the same family would make their prices incomparable.
    const exported = (
        await composeCommercialExport({
            supabase,
            orgId: args.orgId,
            asOf: (args.asOf ?? "").trim() || new Date().toISOString().slice(0, 10),
        })
    ).export;

    const views: AssignmentTuitionView[] = [];
    for (const row of rows) {
        const member = row.customer_members as { first_name?: string | null; last_name?: string | null } | null;
        const childLabel = [member?.first_name, member?.last_name].filter(Boolean).join(" ").trim();
        const view = await buildAssignmentTuitionView(supabase, {
            orgId: args.orgId,
            opportunityCustomerMemberId: String(row.id),
            childLabel,
            asOf: args.asOf ?? null,
            exported,
        });
        if (view) views.push(view);
    }
    return views;
}
