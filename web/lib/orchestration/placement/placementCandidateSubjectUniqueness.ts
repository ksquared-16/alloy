/**
 * PLACEMENT CANDIDATE UNIQUENESS — one active canonical candidate per semantic subject.
 *
 * ── WHY THE SEED KEY ALONE IS NOT THE INVARIANT ──
 *
 * `buildPlacementCandidateSeedKey` is `pc_v1:{opportunity}:{ocm|missing_ocm}:{cohort}` — deterministic,
 * but not STABLE, because the cohort is part of it. Every creation path deduped on that key alone, so a
 * child whose cohort key changed (a vocabulary normalisation such as `infant` → `infant_0_18_months`,
 * or a real cohort transition) produced a key the check had never seen, and the path inserted a SECOND
 * active candidate for the same child instead of moving the first.
 *
 * Certified on Firefly: three children — Wrigley, PassA, Lennon — each carried two active candidates
 * with the same `customer_member_id`, the same `process_instance_id` and the same `source`, differing
 * only by cohort key. 20 candidates produced 17 rows. Only one of each pair projects, so the duplicate
 * is invisible until something attaches to it: PassA's operator pin landed on the candidate that does
 * NOT project, which is why that pin could never have had an effect.
 *
 * ── THE INVARIANT ──
 *
 * The semantic subject is (org, opportunity, customer_member) for a real candidate. A cohort change
 * MOVES that candidate; it never mints a rival. Moving rather than re-creating is also what preserves
 * `wait_since` (the operator's queue position clock) and any active overrides, which are keyed to the
 * candidate id — re-creating silently resets a child's waiting time and orphans their pin.
 *
 * Synthetic fallback candidates are keyed on the opportunity, not a member, and are excluded here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveCandidateForSubject = {
    id: string;
    seed_key: string | null;
    program_room_cohort_key: string | null;
};

/** The subject a real placement candidate belongs to. Synthetic candidates have no member subject. */
export function placementCandidateSubjectKey(args: {
    opportunityId: string;
    customerMemberId: string;
}): string {
    return `${args.opportunityId.trim()}:${args.customerMemberId.trim()}`;
}

/**
 * Load the ACTIVE real candidates for these opportunities, keyed by subject.
 * Batched so the bulk ensure path costs one query, not one per child.
 */
export async function loadActiveCandidatesBySubject(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityIds: readonly string[] },
): Promise<Map<string, ActiveCandidateForSubject>> {
    const out = new Map<string, ActiveCandidateForSubject>();
    const ids = [...new Set(args.opportunityIds.map((v) => v.trim()).filter(Boolean))];
    if (!ids.length) return out;

    const { data, error } = await supabase
        .from("placement_candidates")
        .select("id, seed_key, opportunity_id, customer_member_id, program_room_cohort_key, is_synthetic_fallback, status")
        .eq("org_id", args.orgId)
        .eq("status", "active")
        .in("opportunity_id", ids);
    if (error) return out;

    for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
        if (raw.is_synthetic_fallback === true) continue;
        const opportunityId = typeof raw.opportunity_id === "string" ? raw.opportunity_id : "";
        const customerMemberId = typeof raw.customer_member_id === "string" ? raw.customer_member_id : "";
        const id = typeof raw.id === "string" ? raw.id : "";
        if (!opportunityId || !customerMemberId || !id) continue;
        const key = placementCandidateSubjectKey({ opportunityId, customerMemberId });
        // First writer wins: a set that already has a duplicate keeps the earliest, and the caller
        // reconciles onto it rather than adding a third.
        if (out.has(key)) continue;
        out.set(key, {
            id,
            seed_key: typeof raw.seed_key === "string" ? raw.seed_key : null,
            program_room_cohort_key:
                typeof raw.program_room_cohort_key === "string" ? raw.program_room_cohort_key : null,
        });
    }
    return out;
}

/**
 * Move an existing candidate onto the newly derived cohort/seed key.
 * Returns false when the write fails — the caller must NOT then fall through to an insert, or the
 * duplicate this function exists to prevent is created anyway.
 */
export async function movePlacementCandidateToDerivedCohort(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        candidateId: string;
        seedKey: string;
        programRoomCohortKey: string | null;
        programRoomGroupLabel: string | null;
    },
): Promise<boolean> {
    const patch: Record<string, unknown> = { seed_key: args.seedKey };
    if (args.programRoomCohortKey != null) patch.program_room_cohort_key = args.programRoomCohortKey;
    if (args.programRoomGroupLabel != null) patch.program_room_group_label = args.programRoomGroupLabel;

    const { error } = await supabase
        .from("placement_candidates")
        .update(patch)
        .eq("org_id", args.orgId)
        .eq("id", args.candidateId);
    return !error;
}


/**
 * ── HEALING EXISTING DUPLICATES ──
 *
 * Prevention alone leaves the rows that are already wrong, and they are not inert: an operator pin can
 * land on the candidate that does NOT project (PassA's did), so the operator's action is recorded
 * against a record the runtime never reads.
 *
 * Survivor rule, chosen to keep the queue still: the candidate whose cohort matches what the ensure
 * pass derives NOW is the live one, because that is the row the projection resolves. When none matches
 * (both stale), the EARLIEST candidate survives — it carries the child's real `wait_since`, and a
 * child must never lose queue time to a system repair.
 *
 * Retirement is `withdrawn` + a metadata marker, because the status vocabulary has no "superseded" and
 * inventing operator meaning is worse than annotating: `withdrawn` alone would read as "the family
 * withdrew". Active overrides are MIGRATED to the survivor rather than dropped — an operator pin is a
 * decision, and a deduplication is not a reason to discard it.
 */
export type DuplicateRepairOutcome = {
    subjects_examined: number;
    duplicates_found: number;
    retired: number;
    overrides_migrated: number;
    /** Survivors this repair had previously retired under a less-informed rule. */
    reinstated: number;
};

type CandidateForRepair = {
    id: string;
    opportunity_id: string;
    customer_member_id: string;
    program_room_cohort_key: string | null;
    created_at: string | null;
    metadata: Record<string, unknown> | null;
    status: string;
};

export async function retireDuplicateActiveCandidates(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        opportunityIds: readonly string[];
        /** Cohort the ensure pass derives now, by subject key. Absent → fall back to earliest. */
        derivedCohortBySubject?: Map<string, string | null>;
    },
): Promise<DuplicateRepairOutcome> {
    const out: DuplicateRepairOutcome = { subjects_examined: 0, duplicates_found: 0, retired: 0, overrides_migrated: 0, reinstated: 0 };
    const ids = [...new Set(args.opportunityIds.map((v) => v.trim()).filter(Boolean))];
    if (!ids.length) return out;

    /*
     * ACTIVE **and** previously-superseded rows are loaded, because this repair must be able to correct
     * ITSELF. The survivor rule depends on the cohort the ensure pass derives now; if that information
     * was unavailable on an earlier run the rule degrades to "earliest", which can retire the candidate
     * the projection actually resolves. A one-way repair would then leave that mistake permanent.
     * Only rows this function retired are reconsidered — an operator withdrawal carries no marker and
     * is never resurrected.
     */
    const { data, error } = await supabase
        .from("placement_candidates")
        .select("id, opportunity_id, customer_member_id, program_room_cohort_key, created_at, metadata, is_synthetic_fallback, status")
        .eq("org_id", args.orgId)
        .in("status", ["active", "withdrawn"])
        .in("opportunity_id", ids);
    if (error) return out;

    const bySubject = new Map<string, CandidateForRepair[]>();
    for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
        if (raw.is_synthetic_fallback === true) continue;
        const meta =
            raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
                ? (raw.metadata as Record<string, unknown>)
                : null;
        const status = typeof raw.status === "string" ? raw.status : "";
        // A withdrawal without OUR marker is an operator decision. Leave it alone.
        if (status !== "active" && !meta?.superseded_by_placement_candidate_id) continue;
        const opportunity_id = typeof raw.opportunity_id === "string" ? raw.opportunity_id : "";
        const customer_member_id = typeof raw.customer_member_id === "string" ? raw.customer_member_id : "";
        const id = typeof raw.id === "string" ? raw.id : "";
        if (!opportunity_id || !customer_member_id || !id) continue;
        const key = placementCandidateSubjectKey({ opportunityId: opportunity_id, customerMemberId: customer_member_id });
        const list = bySubject.get(key) ?? [];
        list.push({
            id,
            opportunity_id,
            customer_member_id,
            program_room_cohort_key:
                typeof raw.program_room_cohort_key === "string" ? raw.program_room_cohort_key : null,
            created_at: typeof raw.created_at === "string" ? raw.created_at : null,
            metadata: meta,
            status,
        });
        bySubject.set(key, list);
    }

    out.subjects_examined = bySubject.size;

    for (const [subjectKey, list] of bySubject) {
        if (list.length < 2) continue;
        out.duplicates_found += 1;

        const derived = args.derivedCohortBySubject?.get(subjectKey) ?? null;
        const byDerivedCohort = derived ? list.find((c) => c.program_room_cohort_key === derived) : undefined;
        const earliest = [...list].sort((a, b) =>
            String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
        )[0]!;
        const survivor = byDerivedCohort ?? earliest;
        const losers = list.filter((c) => c.id !== survivor.id);
        if (!losers.length) continue;

        // Reinstate a survivor this repair had previously retired under a worse rule.
        if (survivor.status !== "active") {
            const { error: reErr } = await supabase
                .from("placement_candidates")
                .update({
                    status: "active",
                    metadata: (() => {
                        const { superseded_by_placement_candidate_id: _a, superseded_reason: _b, ...rest } =
                            survivor.metadata ?? {};
                        return rest;
                    })(),
                })
                .eq("org_id", args.orgId)
                .eq("id", survivor.id);
            if (reErr) continue;
            out.reinstated += 1;
        }

        // Migrate active overrides BEFORE retiring, so a failure never strands an operator decision
        // on a withdrawn record.
        const loserIds = losers.map((c) => c.id);
        const { data: overrides } = await supabase
            .from("placement_overrides")
            .select("id")
            .eq("org_id", args.orgId)
            .eq("is_active", true)
            .in("placement_candidate_id", loserIds);
        const overrideIds = ((overrides ?? []) as Array<{ id?: unknown }>)
            .map((o) => (typeof o.id === "string" ? o.id : ""))
            .filter(Boolean);
        if (overrideIds.length) {
            const { error: mvErr } = await supabase
                .from("placement_overrides")
                .update({ placement_candidate_id: survivor.id })
                .eq("org_id", args.orgId)
                .in("id", overrideIds);
            if (mvErr) continue; // leave the whole set intact rather than half-repair it
            out.overrides_migrated += overrideIds.length;
        }

        for (const loser of losers) {
            if (loser.status !== "active") continue; // already retired by an earlier run
            const { error: retErr } = await supabase
                .from("placement_candidates")
                .update({
                    status: "withdrawn",
                    metadata: {
                        ...(loser.metadata ?? {}),
                        superseded_by_placement_candidate_id: survivor.id,
                        superseded_reason: "duplicate_subject_cohort_transition",
                    },
                })
                .eq("org_id", args.orgId)
                .eq("id", loser.id);
            if (!retErr) out.retired += 1;
        }
    }

    return out;
}
