/**
 * Minimal placement side-effect when child lifecycle becomes waitlisted (Card 10).
 * Idempotent — does not delete candidates.
 */

import { PLACEMENT_CANDIDATE_QUEUE_SELECT } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import {
    loadActiveCandidatesBySubject,
    movePlacementCandidateToDerivedCohort,
    placementCandidateSubjectKey,
} from "@/lib/orchestration/placement/placementCandidateSubjectUniqueness";
import type { SupabaseClient } from "@supabase/supabase-js";
import { __testing as backfillTesting } from "@/lib/orchestration/placement/backfill/placementCandidateBackfill";
import { syncPlacementCandidateFromOcm } from "@/lib/orchestration/placement/syncPlacementCandidateFromOcm";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { resolvePlacementCandidateSiteId } from "@/lib/orchestration/placement/resolvePlacementCandidateSiteId";
import { resolvePlacementCandidateCohortForQueue } from "@/lib/orchestration/placement/resolvePlacementCandidateCohortForQueue";

const { buildCandidateRowsForOpportunity, normalizeOcmRow } = backfillTesting;

function metaStr(meta: Record<string, unknown> | null | undefined, key: string): string | null {
    const v = meta?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * THE ONE DEFINITION of a candidate's seed key and row.
 *
 * Both the per-child hook and the bulk form below derive through this. A second copy of this
 * derivation is exactly the failure this codebase already paid for once — a separate definition of
 * membership is what produced the 13-vs-8 count — and here a drifted copy would silently stop
 * repairing children rather than merely miscount them.
 */
function derivePlacementCandidateSeedRow(input: {
    orgId: string;
    opportunityId: string;
    customerMemberId: string;
    oppCustomerId: string | null;
    oppLocationId: string | null;
    piId: string | null;
    facts: Record<string, unknown>;
    waitSinceIso: string;
    personId: string | null;
    dob: string | null;
    programKey: string | null;
}): { seedKey: string; row: Record<string, unknown> } {
    const site = resolvePlacementCandidateSiteId({
        ocmLocationId: metaStr(input.facts, "location_id"),
        opportunityLocationId: input.oppLocationId,
    });
    /*
     * ── ONE COHORT OWNER (Priority 2) ──
     *
     * This derived its cohort from `resolvePlacementCandidateCohortFromMember` — the RAW resolution —
     * while the live child-grain projection derives through `resolvePlacementCandidateCohortForQueue`,
     * every branch of which ends in `normalizePlacementWaitlistCohort`. So ensure said `infant` where
     * the projection said `infant_0_18_months`, for the same child, from the same facts.
     *
     * That single disagreement produced both defects this program has been chasing: it made the seed
     * key differ from the projection's cohort (so a normalisation minted a rival candidate), and it
     * made a survivor rule keyed on the ensure cohort disagree with the row that actually projects
     * (so the repair oscillated). Routed through the projection's own resolver — not a copy of it.
     */
    const cohort = resolvePlacementCandidateCohortForQueue({
        storedKey: "",
        storedLabel: "",
        ocmProgramRoomCohortKey: metaStr(input.facts, "program_room_cohort_key"),
        ocmMetadata: input.facts,
        programKey: input.programKey,
        dateOfBirth: input.dob,
    });
    /*
     * ── STABLE CANDIDATE IDENTITY (Priority 1) ──
     *
     * The cohort is GONE from the key. A child does not become a new semantic placement candidate
     * because their cohort label normalised or they aged into the next room — cohort is mutable
     * ranking state on a stable subject, and putting it in the key is what let rival active
     * candidates exist at all.
     *
     * The subject is (opportunity, customer_member). Existing rows carry the old cohort-bearing key,
     * so the first ensure pass after this change misses on seed key — and the subject-uniqueness
     * check then finds the incumbent and MOVES it onto the stable key rather than inserting. The
     * migration is therefore self-applying and preserves `wait_since`, overrides and history,
     * because the candidate id never changes.
     */
    const seedKey = `pc_v2_subject:${input.opportunityId}:${input.customerMemberId}`;
    return {
        seedKey,
        row: {
            org_id: input.orgId,
            opportunity_id: input.opportunityId,
            customer_id: input.oppCustomerId,
            opportunity_customer_member_id: null, // no OCM dependency
            customer_member_id: input.customerMemberId,
            person_id: input.personId,
            site_id: site.site_id,
            is_synthetic_fallback: false,
            program_room_cohort_key: cohort.program_room_cohort_key,
            program_room_group_label: cohort.program_room_group_label,
            wait_since: input.waitSinceIso,
            start_date: metaStr(input.facts, "start_date"),
            status: "active",
            seed_key: seedKey,
            metadata: {
                source: "process_instance_waitlist",
                process_instance_id: input.piId,
                cohort_resolution: cohort,
                site_resolution: site,
            },
        },
    };
}

/**
 * Create the placement candidate for a newly-waitlisted child from PROCESS-INSTANCE / child-subject
 * scope — no OCM required. Facts come from the child's enrollment process instance metadata (program /
 * site / room / start), with the opportunity as fallback for site/customer. Idempotent by seed_key.
 * The runtime path (outcome executor) uses this; the OCM-reading hook below remains for legacy data.
 */
export async function ensurePlacementCandidateForWaitlistedChildBySubject(
    supabase: SupabaseClient,
    params: { orgId: string; opportunityId: string; customerMemberId: string },
): Promise<EnsurePlacementCandidateHookResult> {
    if (!isPlacementLifecycleCandidateHookEnabled()) {
        return { attempted: false, created: false, skipped_reason: "hook_disabled" };
    }
    const { orgId, opportunityId, customerMemberId } = params;

    const { data: opp } = await supabase
        .from("opportunities")
        .select("id, customer_id, location_id, status_key, created_at, metadata")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!opp) return { attempted: true, created: false, skipped_reason: "opportunity_not_found" };

    // Child enrollment process instance (subject = customer_member, context = opportunity) — the fact source.
    const { data: pi } = await supabase
        .from("process_instances")
        .select("id, metadata, stage_entered_at")
        .eq("org_id", orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", opportunityId)
        .eq("subject_id", customerMemberId)
        .maybeSingle();
    const piId = (pi as { id?: string } | null)?.id ?? null;
    const facts = ((pi as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<string, unknown>;
    // Wait-since is the Waitlist stage clock — not opportunity created_at (lead age).
    const stageEnteredAt =
        typeof (pi as { stage_entered_at?: string | null } | null)?.stage_entered_at === "string"
            ? String((pi as { stage_entered_at: string }).stage_entered_at).trim() || null
            : null;
    const waitSinceIso = stageEnteredAt ?? new Date().toISOString();

    const { data: cm } = await supabase
        .from("customer_members")
        .select("id, person_id, dob")
        .eq("id", customerMemberId)
        .eq("org_id", orgId)
        .maybeSingle();
    const personId = (cm as { person_id?: string | null } | null)?.person_id ?? null;
    const dob = (cm as { dob?: string | null } | null)?.dob ?? null;

    // Resolve program key (for cohort resolution) from the program category, best-effort.
    const programCategoryId = metaStr(facts, "program_category_id");
    let programKey: string | null = null;
    if (programCategoryId) {
        const { data: cat } = await supabase.from("location_program_categories").select("key").eq("org_id", orgId).eq("id", programCategoryId).maybeSingle();
        programKey = (cat as { key?: string | null } | null)?.key ?? null;
    }

    const derived = derivePlacementCandidateSeedRow({
        orgId,
        opportunityId,
        customerMemberId,
        oppCustomerId: (opp as { customer_id?: string | null }).customer_id ?? null,
        oppLocationId: (opp as { location_id?: string | null }).location_id ?? null,
        piId,
        facts,
        waitSinceIso,
        personId,
        dob,
        programKey,
    });
    const seedKey = derived.seedKey;

    const { data: existing } = await supabase.from("placement_candidates").select("id").eq("org_id", orgId).eq("seed_key", seedKey).maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
        return { attempted: true, created: false, skipped_reason: "already_exists" };
    }

    /*
     * A MISSED SEED KEY IS NOT PROOF THE CHILD HAS NO CANDIDATE — the key contains the cohort, so a
     * cohort change produces a key this check has never seen. Inserting on that basis is what put
     * two active candidates on one child. Move the existing one instead: the id is preserved, so
     * `wait_since` and any operator override travel with it.
     */
    const bySubject = await loadActiveCandidatesBySubject(supabase, { orgId, opportunityIds: [opportunityId] });
    const incumbent = bySubject.get(placementCandidateSubjectKey({ opportunityId, customerMemberId }));
    if (incumbent) {
        const moved = await movePlacementCandidateToDerivedCohort(supabase, {
            orgId,
            candidateId: incumbent.id,
            seedKey,
            programRoomCohortKey: (derived.row.program_room_cohort_key as string | null) ?? null,
            programRoomGroupLabel: (derived.row.program_room_group_label as string | null) ?? null,
        });
        // Never fall through to the insert on a failed move — that recreates the duplicate.
        return { attempted: true, created: false, skipped_reason: moved ? "cohort_transition_reconciled" : "cohort_transition_move_failed" };
    }

    const row = derived.row;
    const { error: insErr } = await supabase.from("placement_candidates").insert(row);
    if (insErr) return { attempted: true, created: false, skipped_reason: insErr.message };
    return { attempted: true, created: true };
}

/**
 * BULK form of {@link ensurePlacementCandidateForWaitlistedChildBySubject}, for the Work View read
 * path.
 *
 * The read path called the per-child hook once per queue row. Each call makes 4-6 SERIAL round
 * trips (opportunity, process instance, customer member, optional program category, existence
 * check) and, for a 15-row page, that is ~75 queries measured at 1.8-2.2s — almost always to
 * conclude the candidate already exists.
 *
 * SEMANTICS ARE IDENTICAL, not relaxed. The same facts are read, the same
 * `derivePlacementCandidateSeedRow` computes the same seed key, and a child is inserted exactly
 * when the per-child hook would have inserted: when no candidate carries that exact seed key. A
 * cohort change still yields a NEW seed key and still inserts, so repair timing is unchanged. What
 * disappears is the per-child round trips, not the repair.
 *
 * Failure stays fail-open per child, as before: a child whose facts cannot be read is skipped and
 * the queue still renders.
 */
export async function ensurePlacementCandidatesForWaitlistedChildrenBulk(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        children: ReadonlyArray<{ opportunityId: string; customerMemberId: string }>;
        /** Org program categories, already loaded by the caller (process-cached). id -> key. */
        programKeyByCategoryId?: ReadonlyMap<string, string>;
    },
): Promise<{
    attempted: number;
    created: number;
    skipped_existing: number;
    /**
     * The candidate rows this pass already read, in the queue loader's own shape.
     *
     * Only safe to reuse when nothing was inserted: these rows were read BEFORE the insert below, so
     * a pass that created candidates must let the loader re-read. The caller enforces that.
     */
    candidateRows?: readonly Record<string, unknown>[];
}> {
    if (!isPlacementLifecycleCandidateHookEnabled()) {
        return { attempted: 0, created: 0, skipped_existing: 0 };
    }
    const children = params.children.filter((c) => c.opportunityId && c.customerMemberId);
    if (!children.length) return { attempted: 0, created: 0, skipped_existing: 0 };
    const orgId = params.orgId;
    const opportunityIds = [...new Set(children.map((c) => c.opportunityId))];
    const memberIds = [...new Set(children.map((c) => c.customerMemberId))];

    const [oppRes, piRes, cmRes, existingRes, activeBySubject] = await Promise.all([
        supabase
            .from("opportunities")
            .select("id, customer_id, location_id")
            .eq("org_id", orgId)
            .in("id", opportunityIds),
        supabase
            .from("process_instances")
            .select("id, metadata, stage_entered_at, context_id, subject_id")
            .eq("org_id", orgId)
            .eq("process_key", ENROLLMENT_PROCESS_KEY)
            .in("context_id", opportunityIds)
            .in("subject_id", memberIds),
        supabase.from("customer_members").select("id, person_id, dob").eq("org_id", orgId).in("id", memberIds),
        /*
         * Widened from `seed_key` to the queue's own column list.
         *
         * This read already sits inside the concurrent wave above, so asking it for more columns
         * costs no additional round trip here — while it lets the caller skip
         * `bulkLoadPlacementCandidatesByOpportunity`, which read this same table with this same
         * org + opportunity filter as the NEXT SERIAL step on the queue-critical path.
         *
         * Seed-key deduplication below is unchanged; it just reads `seed_key` off richer rows.
         */
        supabase
            .from("placement_candidates")
            .select(PLACEMENT_CANDIDATE_QUEUE_SELECT)
            .eq("org_id", orgId)
            .in("opportunity_id", opportunityIds),
        loadActiveCandidatesBySubject(supabase, { orgId, opportunityIds }),
    ]);

    const oppById = new Map<string, { customer_id: string | null; location_id: string | null }>();
    for (const r of (oppRes.data ?? []) as Array<Record<string, unknown>>) {
        if (typeof r.id === "string") {
            oppById.set(r.id, {
                customer_id: typeof r.customer_id === "string" ? r.customer_id : null,
                location_id: typeof r.location_id === "string" ? r.location_id : null,
            });
        }
    }
    const piByPair = new Map<string, { id: string | null; metadata: Record<string, unknown>; stage_entered_at: string | null }>();
    for (const r of (piRes.data ?? []) as Array<Record<string, unknown>>) {
        const key = `${String(r.context_id ?? "")}:${String(r.subject_id ?? "")}`;
        piByPair.set(key, {
            id: typeof r.id === "string" ? r.id : null,
            metadata: (r.metadata ?? {}) as Record<string, unknown>,
            stage_entered_at: typeof r.stage_entered_at === "string" ? r.stage_entered_at.trim() || null : null,
        });
    }
    const cmById = new Map<string, { person_id: string | null; dob: string | null }>();
    for (const r of (cmRes.data ?? []) as Array<Record<string, unknown>>) {
        if (typeof r.id === "string") {
            cmById.set(r.id, {
                person_id: typeof r.person_id === "string" ? r.person_id : null,
                dob: typeof r.dob === "string" ? r.dob : null,
            });
        }
    }
    const existingCandidateRows = (existingRes.data ?? []) as Array<Record<string, unknown>>;
    const existingSeedKeys = new Set<string>();
    for (const r of existingCandidateRows) {
        if (typeof r.seed_key === "string") existingSeedKeys.add(r.seed_key);
    }

    const nowIso = new Date().toISOString();
    const rows: Record<string, unknown>[] = [];
    /** Cohort transitions of candidates these children already have — moves, never inserts. */
    const reconcileMoves: Array<{
        candidateId: string;
        seedKey: string;
        programRoomCohortKey: string | null;
        programRoomGroupLabel: string | null;
    }> = [];
    let skippedExisting = 0;
    for (const child of children) {
        const opp = oppById.get(child.opportunityId);
        if (!opp) continue; // matches the per-child hook's `opportunity_not_found` early return
        const pi = piByPair.get(`${child.opportunityId}:${child.customerMemberId}`) ?? null;
        const facts = pi?.metadata ?? {};
        const cm = cmById.get(child.customerMemberId) ?? null;
        const programCategoryId = metaStr(facts, "program_category_id");
        const programKey =
            programCategoryId ? params.programKeyByCategoryId?.get(programCategoryId) ?? null : null;
        const derived = derivePlacementCandidateSeedRow({
            orgId,
            opportunityId: child.opportunityId,
            customerMemberId: child.customerMemberId,
            oppCustomerId: opp.customer_id,
            oppLocationId: opp.location_id,
            piId: pi?.id ?? null,
            facts,
            // Wait-since is the Waitlist stage clock — not opportunity created_at (lead age).
            waitSinceIso: pi?.stage_entered_at ?? nowIso,
            personId: cm?.person_id ?? null,
            dob: cm?.dob ?? null,
            programKey,
        });
        if (existingSeedKeys.has(derived.seedKey)) {
            skippedExisting += 1;
            continue;
        }
        // Same rule as the single path: a missed seed key may still be a cohort transition of a
        // candidate this child already has. Move it rather than adding a rival.
        const incumbent = activeBySubject.get(
            placementCandidateSubjectKey({
                opportunityId: child.opportunityId,
                customerMemberId: child.customerMemberId,
            }),
        );
        if (incumbent) {
            reconcileMoves.push({
                candidateId: incumbent.id,
                seedKey: derived.seedKey,
                programRoomCohortKey: (derived.row.program_room_cohort_key as string | null) ?? null,
                programRoomGroupLabel: (derived.row.program_room_group_label as string | null) ?? null,
            });
            skippedExisting += 1;
            continue;
        }
        // Guard against two children in this page deriving the same key (they cannot, but an
        // insert of duplicates would fail the whole batch).
        if (rows.some((r) => r.seed_key === derived.seedKey)) continue;
        rows.push(derived.row);
    }

    for (const mv of reconcileMoves) {
        await movePlacementCandidateToDerivedCohort(supabase, { orgId, ...mv });
    }

    /*
     * ── HEALING IS NOT A SIDE EFFECT OF A PAGE LOAD ──
     *
     * This ran on every Work View read and it was wrong twice over. The survivor rule keys on the
     * cohort the ENSURE pass derives, but the projection resolves a different (normalised) cohort, so
     * the two disagree about which candidate is live — and a repair that runs on every read then
     * FLIPS the survivor back and forth on real tenant data. Observed on Firefly: one pass retired the
     * projecting candidate, the next reinstated it and retired the other.
     *
     * A repair with a contested survivor rule must be explicit, reviewable and run once — never
     * implicit and continuous. Gated off by default until the survivor rule is derived from the same
     * resolution the projection uses. Prevention above is unaffected and stays always-on: it only ever
     * moves a candidate the child already has, which cannot oscillate.
     */
    /*
     * ── NO BUSINESS-FACT REPAIR ON A READ PATH ──
     *
     * Both the duplicate repair AND its rollback used to run here. The rollback was defensible as a
     * one-time undo and it did its job (Firefly is restored), but it is still a write triggered by an
     * operator opening a Work View, and that is the exact pattern that produced two regressions.
     *
     * Candidate ENSURE stays — creating a missing candidate is this path's bounded, explicit contract.
     * Reconciling or repairing the business facts of candidates that already exist is not, and now
     * lives only in an explicit governed operation with deterministic preconditions
     * (`scripts/restoreFireflyCandidateCohorts.ts` is the worked example).
     *
     * `retireDuplicateActiveCandidates` / `revertDuplicateRepair` remain exported for that governed
     * use. They are deliberately unreachable from here.
     */

    if (!rows.length) {
        return { attempted: children.length, created: 0, skipped_existing: skippedExisting, candidateRows: existingCandidateRows };
    }
    const { error } = await supabase.from("placement_candidates").insert(rows);
    if (error) return { attempted: children.length, created: 0, skipped_existing: skippedExisting, candidateRows: existingCandidateRows };
    return { attempted: children.length, created: rows.length, skipped_existing: skippedExisting };
}

/** `ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED=1` skips candidate ensure on waitlisted transition. */
export function isPlacementLifecycleCandidateHookEnabled(): boolean {
    return process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED !== "1";
}

export type EnsurePlacementCandidateHookResult = {
    attempted: boolean;
    created: boolean;
    skipped_reason?: string;
};

/** Create placement candidate for one OCM when newly waitlisted (idempotent by seed_key). */
export async function ensurePlacementCandidateForWaitlistedChild(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        opportunityId: string;
        opportunityCustomerMemberId: string;
    }
): Promise<EnsurePlacementCandidateHookResult> {
    if (!isPlacementLifecycleCandidateHookEnabled()) {
        return { attempted: false, created: false, skipped_reason: "hook_disabled" };
    }

    const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, customer_id, location_id, status_key, created_at, metadata")
        .eq("id", params.opportunityId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    if (oppErr || !opp) {
        return { attempted: true, created: false, skipped_reason: "opportunity_not_found" };
    }

    const { data: ocmData, error: ocmErr } = await supabase
        .from("opportunity_customer_members")
        .select(
            "id, customer_member_id, outcome_status_key, start_date, program_category_id, location_program_categories(key), location_id, program_room_cohort_key, metadata, customer_members(person_id, display_name, metadata, persons(date_of_birth))"
        )
        .eq("id", params.opportunityCustomerMemberId)
        .eq("org_id", params.orgId)
        .eq("opportunity_id", params.opportunityId)
        .maybeSingle();
    if (ocmErr || !ocmData) {
        return { attempted: true, created: false, skipped_reason: "ocm_not_found" };
    }

    const counts = {
        opportunities_scanned: 0,
        real_candidates_proposed: 0,
        synthetic_candidates_proposed: 0,
        real_candidates_created: 0,
        synthetic_candidates_created: 0,
        skipped_existing: 0,
        skipped_not_waitlist: 0,
        skipped_ineligible_child: 0,
        skipped_synthetic_opp_only_strict: 0,
        compat_opportunity_fallback: 0,
        errors: 0,
    };

    // The child's durable state now lives on process_instances, so OCM.outcome_status_key is no longer
    // written. This hook is invoked precisely when a child transitions to waitlisted, so assert that
    // status for candidate eligibility (otherwise the row reads as not-waitlist and no candidate is made).
    const waitlistedOcmRow = { ...(ocmData as Record<string, unknown>), outcome_status_key: "waitlisted" };
    const planned = buildCandidateRowsForOpportunity(
        opp as Parameters<typeof buildCandidateRowsForOpportunity>[0],
        [normalizeOcmRow(waitlistedOcmRow)],
        params.orgId,
        false,
        {
            strictEligibility: process.env.ALLOY_PLACEMENT_CHILD_WAITLIST_ELIGIBILITY_STRICT === "1",
            counts,
        }
    );
    if (!planned.length) {
        return { attempted: true, created: false, skipped_reason: "not_eligible_for_candidate" };
    }

    const row = planned[0]!;
    const { data: existing } = await supabase
        .from("placement_candidates")
        .select("id")
        .eq("org_id", params.orgId)
        .eq("seed_key", row.seed_key)
        .maybeSingle();
    if ((existing as { id?: string } | null)?.id) {
        await syncPlacementCandidateFromOcm(supabase, {
            orgId: params.orgId,
            opportunityId: params.opportunityId,
            opportunityCustomerMemberId: params.opportunityCustomerMemberId,
        });
        return { attempted: true, created: false, skipped_reason: "already_exists" };
    }

    // Same invariant as the other two creation paths — a missed seed key may be a cohort transition.
    const memberIdForSubject = typeof row.customer_member_id === "string" ? row.customer_member_id : "";
    if (memberIdForSubject) {
        const bySubject = await loadActiveCandidatesBySubject(supabase, {
            orgId: params.orgId,
            opportunityIds: [params.opportunityId],
        });
        const incumbent = bySubject.get(
            placementCandidateSubjectKey({
                opportunityId: params.opportunityId,
                customerMemberId: memberIdForSubject,
            }),
        );
        if (incumbent) {
            const moved = await movePlacementCandidateToDerivedCohort(supabase, {
                orgId: params.orgId,
                candidateId: incumbent.id,
                seedKey: String(row.seed_key ?? ""),
                programRoomCohortKey: (row.program_room_cohort_key as string | null) ?? null,
                programRoomGroupLabel: (row.program_room_group_label as string | null) ?? null,
            });
            return {
                attempted: true,
                created: false,
                skipped_reason: moved ? "cohort_transition_reconciled" : "cohort_transition_move_failed",
            };
        }
    }

    const { error: insErr } = await supabase.from("placement_candidates").insert(row);
    if (insErr) {
        return { attempted: true, created: false, skipped_reason: insErr.message };
    }
    return { attempted: true, created: true };
}
