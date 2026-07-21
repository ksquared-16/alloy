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

/** Per-candidate occupancy delta + any hard warnings — the classifier's input. */
export type RoomOccupancyDelta = {
    roomId: string;
    roomName: string | null;
    beforePeakOccupancy: number;
    afterPeakOccupancy: number;
    blockers: string[];
};

// ---------------------------------------------------------------------------
// Pure decision logic (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Pure: classify each candidate and preselect at most one Recommended option.
 * A candidate with any blocker is Blocked. Among unblocked candidates the
 * Recommended one is the deterministic, safe choice — the most headroom (lowest
 * resulting occupancy), ties broken stably by room id. If none is unblocked,
 * nothing is recommended (the operator chooses / no valid room).
 */
export function classifyPlacementOptions(rooms: RoomOccupancyDelta[]): PlacementOption[] {
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

    const eligible = options.filter((o) => o.classification === "eligible");
    if (eligible.length > 0) {
        const recommended = eligible.reduce((best, o) => {
            if (o.afterPeakOccupancy < best.afterPeakOccupancy) return o;
            if (o.afterPeakOccupancy === best.afterPeakOccupancy && o.roomId < best.roomId) return o;
            return best;
        });
        recommended.classification = "recommended";
        recommended.reason = `Most headroom — ${recommended.afterPeakOccupancy} scheduled after placement`;
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
};

/** Build options by injecting the child into each candidate room and re-running the builder. */
export function buildPlacementOptions(args: BuildPlacementOptionsArgs): PlacementOption[] {
    const { inputs, childAgreementId } = args;

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
        };
    });

    return classifyPlacementOptions(deltas);
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

    return buildPlacementOptions({
        inputs,
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
