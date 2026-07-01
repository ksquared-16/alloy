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

import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

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
    const parents = candidate.parents ?? [];
    const children = candidate.children ?? [];

    if (parents.some((p) => (p.emails ?? []).some((e) => e.trim().length > 0))) signals.push("parent_email");
    if (parents.some((p) => (p.phones ?? []).some((ph) => ph.trim().length > 0))) signals.push("parent_phone");
    if (children.some((c) => (c.first_name || c.last_name) && c.dob)) signals.push("child_name_dob");
    // household_link / opportunity_lead are derivable from launch context at call time,
    // not from the candidate alone, so they are not asserted here.
    return signals;
}

/**
 * Deferred resolver: the safe default until the platform Record Resolution layer ships.
 *
 * It performs NO matching. It returns `deferred` and surfaces which signals WILL be
 * usable once the real resolver is in place, so POS can link the packet to a processing
 * case for manual review without creating duplicate leads.
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
