/**
 * POS — Record Resolution plug-in seam (consumer-side contract).
 *
 * Alloy is adding a PLATFORM-LEVEL Record Resolution layer for intake. POS must NOT
 * implement matching itself (no POS-specific duplicate detection). This module defines
 * the seam POS uses to call that future resolver, plus a deferred no-op stub so the
 * packet/submission flow can be wired today and swapped to the real resolver when it
 * lands — with zero call-site changes.
 *
 * Canonical platform flow this plugs into:
 *   intake → Intake Facts → Household Graph → Record Resolution → Create/Link/Update
 *   Proposal → Review → Commit
 *
 * The household graph type (`IntakeHouseholdCandidate`) is REUSED from the existing
 * platform module `@/lib/intake/types` — not redefined here. This file contains the
 * call contract and a stub ONLY; it performs no email/phone/child matching.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import { generateHouseholdGraphCandidates } from "@/lib/identity";
import { isProcessingRealResolverEnabled } from "@/lib/pos/processingIdentity/featureFlags";

/** Identifiers the platform resolver will match on (informational; POS does not match). */
export type RecordResolutionMatchKey =
    | "parent_email"
    | "parent_phone"
    | "child_name_dob"
    | "household_link"
    | "opportunity_lead";

/** Where the intake that produced the candidate came from. */
export interface RecordResolutionSourceContext {
    org_id: string;
    /** Mirrors `processing_case_sources.source_kind` (e.g. "form_packet_session"). */
    source_kind: string;
    /** Polymorphic id of the source row in its owning system. */
    source_id: string;
    /** Optional launch/CRM context already known at packet creation (prefill FKs etc.). */
    launch_context?: Record<string, unknown>;
}

export type RecordResolutionStatus =
    /** Resolver linked the candidate to an existing record. */
    | "matched"
    /** Resolver proposes creating a new record (Create Lead path). */
    | "create_proposed"
    /** Multiple plausible records — route to the review queue. */
    | "ambiguous"
    /** Resolver not available yet — caller should link to a processing case for manual review. */
    | "deferred";

/** Create/Link/Update proposal returned to POS. POS commits via existing review, never auto. */
export interface RecordResolutionProposal {
    status: RecordResolutionStatus;
    /** Which signals drove a match (empty unless status === "matched"). */
    matched_on: RecordResolutionMatchKey[];
    /** Linked/proposed identifiers (null when unknown or deferred). */
    lead_id: string | null;
    household_id: string | null;
    child_ids: string[];
    /** True when an operator must review before commit (always true for deferred/ambiguous). */
    review_required: boolean;
    notes?: string;
}

/**
 * The seam POS depends on. The platform supplies the real implementation later; POS
 * call sites depend only on this interface.
 */
export interface RecordResolver {
    resolve(candidate: IntakeHouseholdCandidate, context: RecordResolutionSourceContext): Promise<RecordResolutionProposal>;
}

/**
 * Inspect which match SIGNALS are present on a household candidate. This is a pure
 * presence check on the candidate object — it does NOT compare against any stored
 * record, so it is not matching logic. Used only to show "we'll be able to match on
 * email + phone later" in review UIs and to annotate the deferred proposal.
 */
export function availableMatchSignals(candidate: IntakeHouseholdCandidate): RecordResolutionMatchKey[] {
    const signals: RecordResolutionMatchKey[] = [];
    const guardians =
        candidate.parents_guardians?.length ? candidate.parents_guardians : (candidate.parents ?? []);
    const children = candidate.children ?? [];

    if (guardians.some((p) => (p.emails ?? []).some((e) => e.trim().length > 0))) signals.push("parent_email");
    if (guardians.some((p) => (p.phones ?? []).some((ph) => ph.trim().length > 0))) signals.push("parent_phone");
    if (children.some((c) => (c.first_name || c.last_name) && c.dob)) signals.push("child_name_dob");
    return signals;
}

function proposalFromGraph(input: {
    candidate: IntakeHouseholdCandidate;
    context: RecordResolutionSourceContext;
    graph: Awaited<ReturnType<typeof generateHouseholdGraphCandidates>>;
}): RecordResolutionProposal {
    const matchedOn = availableMatchSignals(input.candidate);
    const parent = input.graph.parents[0];
    const child = input.graph.children[0];
    const household = input.graph.household[0];
    const lead = input.graph.leads[0];

    if (parent?.confidenceBand === "conflicted" || lead?.confidenceBand === "conflicted") {
        return {
            status: "ambiguous",
            matched_on: matchedOn,
            lead_id: lead?.recordId !== "ambiguous" ? (lead?.recordId ?? null) : null,
            household_id: household?.recordId ?? null,
            child_ids: child?.recordId && child.recordId !== "none" ? [child.recordId] : [],
            review_required: true,
            notes: "Canonical resolver detected conflicts — operator review required.",
        };
    }

    if (
        parent &&
        (parent.confidenceBand === "confirmed" || parent.confidenceBand === "strong") &&
        parent.recordId !== "none"
    ) {
        return {
            status: "matched",
            matched_on: matchedOn,
            lead_id: lead?.recordId ?? null,
            household_id: household?.recordId ?? null,
            child_ids: child?.recordId && child.recordId !== "none" ? [child.recordId] : [],
            review_required: true,
            notes: "Canonical resolver matched existing records (proposal only — no commit).",
        };
    }

    return {
        status: "create_proposed",
        matched_on: matchedOn,
        lead_id: null,
        household_id: null,
        child_ids: [],
        review_required: true,
        notes: "Canonical resolver proposes creating new records (proposal only — no commit).",
    };
}

/**
 * Deferred resolver: the safe default until the platform Record Resolution layer ships.
 */
export const deferredRecordResolver: RecordResolver = {
    async resolve(candidate, context) {
        const signals = availableMatchSignals(candidate);
        return {
            status: "deferred",
            matched_on: [],
            lead_id: typeof context.launch_context?.opportunity_id === "string" ? (context.launch_context.opportunity_id as string) : null,
            household_id: typeof context.launch_context?.customer_id === "string" ? (context.launch_context.customer_id as string) : null,
            child_ids: [],
            review_required: true,
            notes:
                signals.length > 0
                    ? `Record Resolution layer not yet available; will match on ${signals.join(", ")} once live. Linked to ${context.source_kind} for manual review.`
                    : `Record Resolution layer not yet available and no match signals present. Linked to ${context.source_kind} for manual review.`,
        };
    },
};

/** Flag-gated canonical resolver (B3). Falls back to deferred when disabled. */
export function createProcessingRecordResolver(supabase: SupabaseClient): RecordResolver {
    return {
        async resolve(candidate, context) {
            if (!isProcessingRealResolverEnabled(context.org_id)) {
                return deferredRecordResolver.resolve(candidate, context);
            }
            const graph = await generateHouseholdGraphCandidates(supabase, {
                orgId: context.org_id,
                household: candidate,
                locationId:
                    typeof context.launch_context?.location_id === "string" ?
                        (context.launch_context.location_id as string)
                    :   (candidate.location?.resolved_value ?? null),
            });
            return proposalFromGraph({ candidate, context, graph });
        },
    };
}

/** Default resolver export for POS wiring — flag-gated, non-mutating. */
export function getDefaultRecordResolver(supabase: SupabaseClient): RecordResolver {
    return createProcessingRecordResolver(supabase);
}
