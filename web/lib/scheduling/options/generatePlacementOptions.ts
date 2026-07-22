/**
 * Deterministic Place-a-Child option generator (Milestone 1).
 *
 * For each candidate room it injects a hypothetical placement + schedule
 * assignment for the child and re-runs `buildScheduleExpectations` — the SAME
 * function execution uses — so the before→after preview is the execution math,
 * never a second implementation (engineering-handoff §6). The classification +
 * recommendation logic is factored into a pure helper (`classifyPlacementOptions`)
 * so the guessable decision is unit-testable without a DB or config bundle.
 *
 * V1 scope: options are stable in-room placements ranked by resulting headroom;
 * a room with a hard warning (capacity/eligibility/schedule) is Blocked, shown
 * with its reason. No child-shuffling, no staffing options (§temporary-move / G3).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildScheduleExpectations,
    type ExpectationWarning,
} from "@/lib/childcareOperational/expectations/buildScheduleExpectations";
import {
    loadOperationalExpectationInputs,
    type OperationalExpectationInputs,
} from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { loadExpectationAgeGroups } from "@/lib/childcareOperational/expectations/resolveExpectationAgeGroups";
import type { ExpectedOccupancyEntry } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

export type PlacementOptionClassification = "recommended" | "eligible" | "blocked";

export type PlacementOption = {
    roomId: string;
    roomName: string | null;
    classification: PlacementOptionClassification;
    /** One plain line of why (recommendation reason or the blocking cause). */
    reason: string;
    beforePeakOccupancy: number;
    afterPeakOccupancy: number;
    blockers: string[];
};

/** Per-candidate occupancy delta + eligibility/continuity signals — the classifier's input. */
export type RoomOccupancyDelta = {
    roomId: string;
    roomName: string | null;
    beforePeakOccupancy: number;
    afterPeakOccupancy: number;
    blockers: string[];
    /** Room's age group matches the child's program/age eligibility (config-resolved). */
    programMatch?: boolean;
    /** Child already occupies this room (effective-dated continuity preference). */
    continuity?: boolean;
};

/**
 * Configured recommendation policy — the ORDERED factors that decide the room,
 * strongest first. Operational headroom alone is not sufficient (V1 requirement),
 * so the default leads with program/age eligibility, then continuity, then headroom
 * as the tiebreak. A site may reorder/trim these; the resolver defaults to this.
 */
export type RecommendationFactor = "program_match" | "continuity" | "headroom";
export type RecommendationPolicy = { factors: RecommendationFactor[] };
export const DEFAULT_RECOMMENDATION_POLICY: RecommendationPolicy = {
    factors: ["program_match", "continuity", "headroom"],
};

// ---------------------------------------------------------------------------
// Pure decision logic (unit-tested)
// ---------------------------------------------------------------------------

/** Compare two eligible rooms by one factor: negative = `a` is the better pick. */
function compareByFactor(a: RoomOccupancyDelta, b: RoomOccupancyDelta, factor: RecommendationFactor): number {
    switch (factor) {
        case "program_match":
            return (b.programMatch ? 1 : 0) - (a.programMatch ? 1 : 0);
        case "continuity":
            return (b.continuity ? 1 : 0) - (a.continuity ? 1 : 0);
        case "headroom":
            return a.afterPeakOccupancy - b.afterPeakOccupancy;
    }
}

/** The plain "why" for the recommended room, from the strongest factor it won on. */
function recommendationReason(r: RoomOccupancyDelta, policy: RecommendationPolicy): string {
    for (const factor of policy.factors) {
        if (factor === "program_match" && r.programMatch)
            return `Right room for the program — ${r.afterPeakOccupancy} scheduled after placement`;
        if (factor === "continuity" && r.continuity)
            return `Keeps continuity — the child's current room`;
    }
    return `Most headroom — ${r.afterPeakOccupancy} scheduled after placement`;
}

/**
 * Pure: classify each candidate and preselect at most one Recommended option.
 * A candidate with any blocker is Blocked (eligibility/capacity/schedule rules are
 * enforced upstream by the expectation builder). Among unblocked candidates the
 * Recommended one is chosen by the configured policy — program/age eligibility, then
 * continuity, then operational headroom — never headroom alone. Ties break stably by
 * room id. If none is unblocked, nothing is recommended.
 */
export function classifyPlacementOptions(
    rooms: RoomOccupancyDelta[],
    policy: RecommendationPolicy = DEFAULT_RECOMMENDATION_POLICY,
): PlacementOption[] {
    const options: PlacementOption[] = rooms.map((r) => ({
        roomId: r.roomId,
        roomName: r.roomName,
        classification: r.blockers.length > 0 ? "blocked" : "eligible",
        reason:
            r.blockers.length > 0
                ? r.blockers[0]!
                : `Fits — ${r.afterPeakOccupancy} scheduled after placement`,
        beforePeakOccupancy: r.beforePeakOccupancy,
        afterPeakOccupancy: r.afterPeakOccupancy,
        blockers: r.blockers,
    }));

    const eligibleDeltas = rooms.filter((r) => r.blockers.length === 0);
    if (eligibleDeltas.length > 0) {
        const best = eligibleDeltas.reduce((winner, r) => {
            for (const factor of policy.factors) {
                const cmp = compareByFactor(r, winner, factor);
                if (cmp !== 0) return cmp < 0 ? r : winner;
            }
            return r.roomId < winner.roomId ? r : winner;
        });
        const recommended = options.find((o) => o.roomId === best.roomId)!;
        recommended.classification = "recommended";
        recommended.reason = recommendationReason(best, policy);
    }

    // Stable order: recommended first, then eligible, then blocked; each group by room name/id.
    const rank: Record<PlacementOptionClassification, number> = {
        recommended: 0,
        eligible: 1,
        blocked: 2,
    };
    return options.sort((a, b) => {
        if (rank[a.classification] !== rank[b.classification])
            return rank[a.classification] - rank[b.classification];
        return (a.roomName ?? a.roomId).localeCompare(b.roomName ?? b.roomId);
    });
}

// ---------------------------------------------------------------------------
// Preview = execution: inject a hypothetical child, re-run the same builder
// ---------------------------------------------------------------------------

const BLOCKING_WARNING_CODES = new Set<ExpectationWarning["code"]>([
    "capacity_exceeded",
    "age_group_ineligible",
    "schedule_type_ineligible",
    "pattern_weekday_outside_operating_window",
    "days_policy_violation",
]);

function peakOccupancyForRoom(
    occupancy: readonly ExpectedOccupancyEntry[],
    roomId: string
): number {
    let peak = 0;
    for (const o of occupancy) {
        if (o.roomLocationId === roomId && o.childCount > peak) peak = o.childCount;
    }
    return peak;
}

export type BuildPlacementOptionsArgs = {
    inputs: OperationalExpectationInputs;
    childAgreementId: string;
    programCategoryId: string | null;
    patternId: string;
    patternWeekdays: number[];
    scheduleTypeKey: string;
    candidateRooms: { id: string; name: string | null }[];
    dateStart: string;
    dateEnd: string;
    /** Configured recommendation policy (defaults to program → continuity → headroom). */
    policy?: RecommendationPolicy;
};

/**
 * Rooms this child already occupies — the continuity signal. The loaded placements
 * are already scoped to current/future operational rows (active/ending/planned), so
 * any placement on the child's own agreement is a genuine continuity room.
 */
function continuityRoomIdsForChild(
    placements: OperationalExpectationInputs["placements"],
    childAgreementId: string,
): Set<string> {
    const ids = new Set<string>();
    for (const p of placements) {
        if (p.enrollment_agreement_id === childAgreementId && p.room_location_id) {
            ids.add(p.room_location_id);
        }
    }
    return ids;
}

/** Build options by injecting the child into each candidate room and re-running the builder. */
export function buildPlacementOptions(args: BuildPlacementOptionsArgs): PlacementOption[] {
    const { inputs, childAgreementId } = args;

    // Config-resolved program/age eligibility target: the age group the child's program
    // maps to. A candidate room "matches the program" when its age group is the same.
    const programAgeGroupId =
        args.programCategoryId != null
            ? inputs.ageGroupByProgramCategoryId?.[args.programCategoryId] ?? null
            : null;
    const ageGroupByRoom = inputs.ageGroupByRoomLocationId ?? {};
    const continuityRoomIds = continuityRoomIdsForChild(inputs.placements, childAgreementId);

    const patternsById = new Map(inputs.patternsById);
    if (!patternsById.has(args.patternId)) {
        patternsById.set(args.patternId, {
            id: args.patternId,
            weekdays: args.patternWeekdays,
            schedule_type_key: args.scheduleTypeKey,
        });
    }

    const baseline = buildScheduleExpectations({
        dateStart: args.dateStart,
        dateEnd: args.dateEnd,
        agreements: inputs.agreements,
        placements: inputs.placements,
        assignments: inputs.assignments,
        patternsById,
        config: inputs.config,
        ageGroupByRoomLocationId: inputs.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: inputs.ageGroupByProgramCategoryId,
    });

    const deltas: RoomOccupancyDelta[] = args.candidateRooms.map((room) => {
        const hypoPlacement = {
            enrollment_agreement_id: childAgreementId,
            room_location_id: room.id,
            program_category_id: args.programCategoryId,
            start_date: args.dateStart,
            end_date: null,
            status: "active",
        };
        const hypoAssignment = {
            enrollment_agreement_id: childAgreementId,
            schedule_pattern_id: args.patternId,
            start_date: args.dateStart,
            end_date: null,
            status: "active",
        };
        const after = buildScheduleExpectations({
            dateStart: args.dateStart,
            dateEnd: args.dateEnd,
            agreements: inputs.agreements,
            placements: [...inputs.placements, hypoPlacement],
            assignments: [...inputs.assignments, hypoAssignment],
            patternsById,
            config: inputs.config,
            ageGroupByRoomLocationId: inputs.ageGroupByRoomLocationId,
            ageGroupByProgramCategoryId: inputs.ageGroupByProgramCategoryId,
        });

        const blockers = after.warnings
            .filter(
                (w) =>
                    BLOCKING_WARNING_CODES.has(w.code) &&
                    (w.roomLocationId === room.id || w.agreementId === childAgreementId)
            )
            .map((w) => w.detail);

        return {
            roomId: room.id,
            roomName: room.name,
            beforePeakOccupancy: peakOccupancyForRoom(baseline.expectedOccupancyByRoomDate, room.id),
            afterPeakOccupancy: peakOccupancyForRoom(after.expectedOccupancyByRoomDate, room.id),
            blockers: [...new Set(blockers)],
            programMatch: programAgeGroupId != null && ageGroupByRoom[room.id] === programAgeGroupId,
            continuity: continuityRoomIds.has(room.id),
        };
    });

    return classifyPlacementOptions(deltas, args.policy ?? DEFAULT_RECOMMENDATION_POLICY);
}

// ---------------------------------------------------------------------------
// Thin I/O
// ---------------------------------------------------------------------------

async function loadCandidateRooms(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string
): Promise<{ id: string; name: string | null }[]> {
    const { data, error } = await supabase
        .from("locations")
        .select("id, label")
        .eq("org_id", orgId)
        .eq("parent_location_id", siteLocationId)
        .eq("location_type", "unit");
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return ((data ?? []) as { id: string; label: string | null }[]).map((r) => ({
        id: r.id,
        name: r.label != null ? String(r.label).trim() || null : null,
    }));
}

export type GeneratePlacementOptionsInput = {
    orgId: string;
    siteLocationId: string;
    childAgreementId: string;
    programCategoryId: string | null;
    patternId: string;
    dateStart: string;
    dateEnd: string;
};

/** Thin I/O: load site inputs + candidate rooms, then build options. */
export async function generatePlacementOptions(
    supabase: SupabaseClient,
    input: GeneratePlacementOptionsInput
): Promise<PlacementOption[]> {
    const inputs = await loadOperationalExpectationInputs(supabase, {
        orgId: input.orgId,
        siteLocationId: input.siteLocationId,
    });

    const pattern = inputs.patternsById.get(input.patternId);
    let patternWeekdays = pattern?.weekdays ?? [];
    let scheduleTypeKey = pattern?.schedule_type_key ?? "";
    if (!pattern) {
        const { data } = await supabase
            .from("schedule_patterns")
            .select("weekdays, schedule_type_key")
            .eq("org_id", input.orgId)
            .eq("id", input.patternId)
            .maybeSingle();
        const row = data as { weekdays?: number[]; schedule_type_key?: string } | null;
        patternWeekdays = row?.weekdays ?? [];
        scheduleTypeKey = row?.schedule_type_key ?? "";
    }

    const candidateRooms = await loadCandidateRooms(
        supabase,
        input.orgId,
        input.siteLocationId
    );

    // Age groups from existing placements don't cover the CANDIDATE rooms or the child's
    // program (a lead child has no placement yet). Resolve them for the candidate rooms +
    // this child's program so the recommendation can weigh program/age eligibility, and
    // merge over the placement-derived maps.
    const extraAgeGroups = await loadExpectationAgeGroups(supabase, input.orgId, {
        programCategoryIds: input.programCategoryId ? [input.programCategoryId] : [],
        roomLocationIds: candidateRooms.map((r) => r.id),
    });
    const inputsWithAgeGroups: OperationalExpectationInputs = {
        ...inputs,
        ageGroupByRoomLocationId: {
            ...(inputs.ageGroupByRoomLocationId ?? {}),
            ...extraAgeGroups.ageGroupByRoomLocationId,
        },
        ageGroupByProgramCategoryId: {
            ...(inputs.ageGroupByProgramCategoryId ?? {}),
            ...extraAgeGroups.ageGroupByProgramCategoryId,
        },
    };

    return buildPlacementOptions({
        inputs: inputsWithAgeGroups,
        childAgreementId: input.childAgreementId,
        programCategoryId: input.programCategoryId,
        patternId: input.patternId,
        patternWeekdays,
        scheduleTypeKey,
        candidateRooms,
        dateStart: input.dateStart,
        dateEnd: input.dateEnd,
    });
}
