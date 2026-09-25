/**
 * ONE FAMILY JOURNEY OVER SEVERAL CHILD ENROLLMENTS — a composition, not a system of record.
 *
 * A parent with two children enrolling currently gets two disconnected experiences: two links, two
 * conversations, two signatures, and the household's own facts asked twice. Every RECORD underneath
 * is already correctly grained — one process instance, session, link, submission, artifact and
 * Processing case per child — and discovery measured that as right. The deficiency is the
 * experience.
 *
 * ── WHAT THIS FILE MAY NOT DO ──
 *
 * It composes. It does not merge child process instances, sessions, links, submissions, artifacts,
 * Processing cases or financial obligations, and it does not persist a rollup. Every number it
 * reports is carried in from the child's own projection or from Financials; the only arithmetic is
 * counting children and summing what Enrollment itself owns — which children are done.
 *
 * ── WHY THERE IS NO FAMILY SUBMISSION ──
 *
 * The authoritative completion actions are child-scoped, so a family-level "submit" would be a
 * second finalization authority over work that already has one. The family state is therefore
 * DERIVED — shared requirements, plus each child's requirement state, plus the financial state —
 * and one incomplete child stays visibly incomplete. The shell stays open while any intended
 * sibling is still going.
 *
 * ── WHY IT IS NOT LINK-CENTRIC ──
 *
 * `familyPacketPlan` already models a family packet as ONE session shared by several recipients,
 * and `form_packet_sessions.packet_instance_id` implements it. That model is right for a packet an
 * operator composes by hand and WRONG here: it merges the sessions, which is precisely what the
 * grain rule forbids for process-governed Enrollment, where each child's session realizes its own
 * `process_instance` (D-95) and opens its own Processing case. So this composes per-child sessions
 * rather than reusing that mechanism, and the two models stay separate on purpose.
 */

/** What Enrollment knows about one child's journey, quoted from that child's own projection. */
export type FamilyChildJourney = {
    readonly customerMemberId: string;
    readonly displayName: string;
    /** Null when the child has not been launched yet — a real state, not an error. */
    readonly processInstanceId: string | null;
    readonly sessionId: string | null;
    /** The participant path for THIS child. Each child keeps its own link. */
    readonly participantPath: string | null;
    readonly locationName: string | null;
    readonly totalRequirements: number;
    readonly satisfiedRequirements: number;
    readonly remainingRequirements: number;
    /** Whether this child's work has been submitted, as the child's own record reports it. */
    readonly submitted: boolean;
    /** Processing state for this child, when a case exists. Never merged with a sibling's. */
    readonly processingState: string | null;
};

export type FamilyFinancialLine = {
    readonly scope: "family" | "child";
    /** Null on the family line. */
    readonly subjectCustomerMemberId: string | null;
    readonly chargeId: string | null;
    readonly state: string;
    readonly collectibleNowCents: number;
};

export type FamilyEnrollmentFinancials = {
    readonly state: string;
    readonly grossCents: number;
    readonly expectedFundingCents: number;
    readonly collectibleNowCents: number;
    readonly appliedCents: number;
    readonly outstandingCents: number;
    readonly lines: readonly FamilyFinancialLine[];
};

/** One row of the family's progress list, as a parent reads it. Never a session or packet id. */
export type FamilyProgressRow = {
    readonly key: string;
    readonly label: string;
    readonly detail: string;
    readonly complete: boolean;
    /** Present on a child row, so a click can route to that child and nothing else. */
    readonly customerMemberId?: string;
};

export type FamilyEnrollmentExperience = {
    /** The enrolment episode every child journey below belongs to. */
    readonly opportunityId: string;
    readonly familyName: string;
    readonly headline: string;
    readonly childCount: number;
    readonly children: readonly FamilyChildJourney[];
    readonly progress: readonly FamilyProgressRow[];
    readonly financials: FamilyEnrollmentFinancials | null;
    /** True only when every child is submitted AND nothing financial is outstanding. */
    readonly complete: boolean;
    /** Which child the participant is currently working on, when they arrived on a child link. */
    readonly focusedCustomerMemberId: string | null;
};

export type ComposeFamilyEnrollmentInput = {
    readonly opportunityId: string;
    readonly familyName: string;
    readonly children: readonly FamilyChildJourney[];
    /** Whether the household's own shared information has been given. */
    readonly sharedInformationComplete: boolean;
    readonly financials: FamilyEnrollmentFinancials | null;
    readonly focusedCustomerMemberId?: string | null;
};

function childDetail(child: FamilyChildJourney): string {
    if (child.processInstanceId === null) return "Not started";
    if (child.submitted) return child.processingState ? `Submitted · ${child.processingState}` : "Submitted";
    return `${child.satisfiedRequirements} of ${child.totalRequirements} complete`;
}

/**
 * Compose the family experience. Pure.
 */
export function composeFamilyEnrollmentExperience(
    input: ComposeFamilyEnrollmentInput,
): FamilyEnrollmentExperience {
    const children = [...input.children].sort((a, b) => a.displayName.localeCompare(b.displayName));

    const progress: FamilyProgressRow[] = [
        {
            key: "family_information",
            label: "Family information",
            detail: input.sharedInformationComplete ? "Complete" : "Needs your attention",
            complete: input.sharedInformationComplete,
        },
        ...children.map((c) => ({
            key: `child:${c.customerMemberId}`,
            label: c.displayName,
            detail: childDetail(c),
            /*
             * A child row is complete when that CHILD's record says so — never because the family
             * looks finished. Rolling a sibling's completion onto another child is the exact bleed
             * the grain rule exists to prevent, and it would be invisible to the parent.
             */
            complete: c.submitted || (c.totalRequirements > 0 && c.remainingRequirements === 0),
            customerMemberId: c.customerMemberId,
        })),
    ];

    /*
     * The payment row appears only when a fee exists at all. A family with no configured fee should
     * not be shown a payment line reading "$0.00" — it invites a question that has no answer.
     */
    if (input.financials && input.financials.state !== "NOT_APPLICABLE") {
        const f = input.financials;
        const settled = f.state === "SATISFIED";
        progress.push({
            key: "payment",
            label: "Payment",
            detail: settled ? "Complete" : `${(f.collectibleNowCents / 100).toFixed(2)} due`,
            complete: settled,
        });
    }

    const everyChildSubmitted = children.length > 0 && children.every((c) => c.submitted);
    const moneySettled =
        !input.financials ||
        input.financials.state === "NOT_APPLICABLE" ||
        input.financials.state === "SATISFIED";

    return {
        opportunityId: input.opportunityId,
        familyName: input.familyName,
        headline: `${input.familyName} Enrollment`,
        childCount: children.length,
        children,
        progress,
        financials: input.financials,
        complete: everyChildSubmitted && moneySettled,
        focusedCustomerMemberId: input.focusedCustomerMemberId ?? null,
    };
}

/**
 * WHO OWNS WHICH FACT — the matrix the family experience is built on.
 *
 * Declared here rather than left implicit, because the whole risk of a family shell is
 * over-deduplication: asking once for something whose EVIDENCE belongs separately to each child.
 * `ownership` says what may be reused; `why` says what would break if it were not.
 */
export const FAMILY_FACT_OWNERSHIP = Object.freeze([
    {
        concept: "Parents and guardians",
        ownership: "reused_canonical" as const,
        why: "Canonical household party records. `resolveParticipantCanonicalValues` already prefills them into every child's session, so they are confirmed rather than retyped.",
    },
    {
        concept: "Home and mailing address",
        ownership: "reused_canonical" as const,
        why: "One canonical address per household, bound through `address_binding`. Two children cannot legitimately disagree about where the family lives.",
    },
    {
        concept: "Emergency contacts",
        ownership: "reused_canonical" as const,
        why: "Canonical household parties. The same people, whichever child is being enrolled.",
    },
    {
        concept: "Other children in the household",
        ownership: "shared_once" as const,
        why: "A household-grain question with a household-grain answer. Asking it per child would ask the same family to list its own children twice.",
    },
    {
        concept: "Health, allergies and medical providers",
        ownership: "repeated_per_child" as const,
        why: "Child-scoped fact AND held Form-only evidence (D-H5). Each child's answer is its own evidence on its own submission; deduplicating would attach one child's medical record to another.",
    },
    {
        concept: "Immunization record",
        ownership: "repeated_per_child" as const,
        why: "A document upload proving a fact about ONE child. The artifact is the evidence and cannot be shared.",
    },
    {
        concept: "Daily routines, eating, the child as a person",
        ownership: "repeated_per_child" as const,
        why: "Child-scoped by meaning. Two siblings genuinely differ, and a shared answer would be wrong rather than merely redundant.",
    },
    {
        concept: "Placement, schedule and location",
        ownership: "repeated_per_child" as const,
        why: "Resolved per child against its own agreement; siblings may attend different sites or patterns.",
    },
    {
        concept: "Handbook acknowledgment and signature",
        ownership: "shared_once" as const,
        why: "A recipient signs once as themselves. `familyPacketPlan` already models signatures per RECIPIENT rather than per child.",
    },
    {
        concept: "Consent",
        ownership: "repeated_per_child" as const,
        why: "Held Form-only (D-H3) with no canonical consent record. Consent given about one child is not consent about another.",
    },
    {
        concept: "Per-family fee obligation",
        ownership: "shared_once" as const,
        why: "One `customer`-sourced charge for the household. Appears once, however many children enrol.",
    },
    {
        concept: "Per-child fee obligation",
        ownership: "repeated_per_child" as const,
        why: "One `enrollment_agreement`-sourced charge per child, each keeping its own attribution.",
    },
]);
