/**
 * Layout V2 — Waitlist Candidate Card VM (Phase 1, presentation bridge).
 *
 * A STABLE, READ-ONLY contract the placement runtime produces and Layout V2
 * consumes to compose the candidate card FACE. Every field here is already
 * resolved upstream — this module computes NOTHING: no ranking, no scoring, no
 * cohort grouping, no position math, no override mutation. See
 * docs/waitlist_candidate_card_vm_layout_v2_plan.md (§2, §3).
 *
 * Optional fields are genuinely optional: the proof renders blanks (never a
 * UUID or fabricated value) when a join is unavailable.
 */

/** Logical entity type used by Layout V2 for the candidate card surface. */
export const WAITLIST_CANDIDATE_ENTITY_TYPE = "placement_candidate" as const;
/** Layout key convention for the candidate card (see plan §5). */
export const WAITLIST_CANDIDATE_CARD_LAYOUT_KEY = "waitlist_candidate_card" as const;
/** `metadata.renderAs` marker for the queue-card renderer to switch on. */
export const WAITLIST_CARD_RENDER_AS = "waitlist_candidate_card" as const;

export type WaitlistCandidateCardVM = {
    // identity
    candidateId: string;
    opportunityId: string;
    householdId?: string;
    childId?: string;
    isSyntheticFallback: boolean;

    child: {
        name: string;
        ageLabel?: string;
        birthdate?: string;
        programLabel?: string;
        startDate?: string;
        schedulePreference?: string;
    };

    household: {
        name?: string;
        primaryContactName?: string;
        phone?: string;
        email?: string;
        locationName?: string;
    };

    waitlist: {
        cohortKey: string;
        cohortLabel?: string;
        cohortSectionTitle?: string;
        /** Tier bucket key (e.g. "tier_sibling_enrolled") — runtime-computed. */
        tierKey?: string;
        /** Human bucket label/reason — runtime-computed. */
        tierLabel?: string;
        /** Bucket priority_order (10/20/…). NOT a free numeric score. */
        tierPriorityOrder?: number;
        /** Runtime-computed position string ("Position 3/12"). */
        positionLabel?: string;
        positionMode?: "preview" | "live";
        positionHelp?: string;
        waitSince?: string;
        startDate?: string;
        status?: string;
        shadowMode: boolean;
        linkModeLabel?: string;
        siblingContextLines?: string[];
    };

    overrides: {
        hasActive: boolean;
        kinds: string[];
        pinned?: boolean;
        tierBoost?: boolean;
        temporary?: boolean;
        manuallyAdjusted?: boolean;
        reason?: string;
    };

    /**
     * Capability flags — computed by the runtime (permissions + lifecycle).
     * Layout V2 only decides whether/where to surface the corresponding action
     * button; the mutation itself stays runtime-owned.
     */
    actions: {
        canOpen?: boolean;
        canMessage?: boolean;
        canCreateOffer?: boolean;
        canOverride?: boolean;
        canAdjustPosition?: boolean;
        canAskBos?: boolean;
    };

    /**
     * Opaque payloads the runtime fills; Layout V2 reserves a slot and never
     * interprets them. `capacity`/`recommendation` are reserved (no engine yet).
     */
    widgets: {
        priority?: unknown;
        position?: unknown;
        capacity?: unknown;
        recommendation?: unknown;
    };
};

/**
 * Flatten the VM into a dot-keyed record so the existing Layout V2 value
 * resolver (resolveItemValue → record[refKey]) can resolve preset refKeys like
 * "child.name" or "waitlist.tierLabel" without a bespoke resolver. Only scalar
 * display values are projected; widget/override objects stay on the VM.
 */
export function waitlistCardVmToProofRecord(vm: WaitlistCandidateCardVM): Record<string, unknown> {
    const flags: string[] = [];
    if (vm.overrides.pinned) flags.push("Pinned");
    if (vm.overrides.manuallyAdjusted) flags.push("Manually adjusted");
    if (vm.overrides.tierBoost) flags.push("Tier boost");
    if (vm.overrides.temporary) flags.push("Temporary");

    return {
        // identity
        candidateId: vm.candidateId,
        // child
        "child.name": vm.child.name,
        "child.ageLabel": vm.child.ageLabel ?? null,
        "child.programLabel": vm.child.programLabel ?? null,
        "child.startDate": vm.child.startDate ?? null,
        "child.schedulePreference": vm.child.schedulePreference ?? null,
        // household
        "household.name": vm.household.name ?? null,
        "household.primaryContactName": vm.household.primaryContactName ?? null,
        "household.phone": vm.household.phone ?? null,
        "household.email": vm.household.email ?? null,
        "household.locationName": vm.household.locationName ?? null,
        // waitlist (all runtime-computed; may be absent in proof)
        "waitlist.cohortLabel": vm.waitlist.cohortLabel ?? null,
        "waitlist.cohortSectionTitle": vm.waitlist.cohortSectionTitle ?? null,
        "waitlist.tierLabel": vm.waitlist.tierLabel ?? null,
        "waitlist.positionLabel": vm.waitlist.positionLabel ?? null,
        "waitlist.waitSince": vm.waitlist.waitSince ?? null,
        "waitlist.startDate": vm.waitlist.startDate ?? null,
        "waitlist.status": vm.waitlist.status ?? null,
        "waitlist.linkModeLabel": vm.waitlist.linkModeLabel ?? null,
        "waitlist.siblingContext": vm.waitlist.siblingContextLines?.length ? vm.waitlist.siblingContextLines.join(" · ") : null,
        // override flags (display)
        "overrides.flags": flags.length ? flags.join(" · ") : null,
        "overrides.reason": vm.overrides.reason ?? null,
    };
}
