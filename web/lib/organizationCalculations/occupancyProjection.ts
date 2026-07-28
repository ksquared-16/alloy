/**
 * Occupancy projection for Organization Calculations — wraps occupancy.expected.
 * Loads schedule expectations once per room/date evaluation; does not redefine occupancy math.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOperationalExpectationInputs } from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { buildScheduleExpectations } from "@/lib/childcareOperational/expectations/buildScheduleExpectations";
import { loadExpectationAgeGroups } from "@/lib/childcareOperational/expectations/resolveExpectationAgeGroups";
import { OCCUPANCY_EXPECTED } from "@/lib/operationalCalculations/families/scheduling";
import { resolveCalculation } from "@/lib/operationalCalculations/runtime";
import type { InputResolution } from "@/lib/organizationCalculations/evaluate";

export async function resolveOccupancyExpectedForRoom(args: {
    supabase: SupabaseClient;
    orgId: string;
    siteLocationId: string;
    roomLocationId: string;
    effectiveAt: string;
}): Promise<InputResolution> {
    const loaded = await loadOperationalExpectationInputs(args.supabase, {
        orgId: args.orgId,
        siteLocationId: args.siteLocationId,
    });
    const extraAgeGroups = await loadExpectationAgeGroups(args.supabase, args.orgId, {
        programCategoryIds: [],
        roomLocationIds: [args.roomLocationId],
    });
    const expectations = buildScheduleExpectations({
        dateStart: args.effectiveAt,
        dateEnd: args.effectiveAt,
        agreements: loaded.agreements,
        placements: loaded.placements,
        assignments: loaded.assignments,
        patternsById: loaded.patternsById,
        config: loaded.config,
        ageGroupByRoomLocationId: {
            ...(loaded.ageGroupByRoomLocationId ?? {}),
            ...extraAgeGroups.ageGroupByRoomLocationId,
        },
        ageGroupByProgramCategoryId: {
            ...(loaded.ageGroupByProgramCategoryId ?? {}),
            ...extraAgeGroups.ageGroupByProgramCategoryId,
        },
        proposedAssignments: loaded.proposedAssignments,
    });

    const resolved = resolveCalculation(
        OCCUPANCY_EXPECTED,
        {
            entries: expectations.expectedOccupancyByRoomDate,
            roomLocationId: args.roomLocationId,
            date: args.effectiveAt,
        },
        { clock: () => new Date(args.effectiveAt) },
    );

    const scalar =
        resolved.value && typeof resolved.value === "object" && "kind" in resolved.value
        && resolved.value.kind === "scalar" ?
            resolved.value.value
        :   null;

    return {
        value: typeof scalar === "number" ? scalar : 0,
        upstreamStatus: resolved.status,
        note:
            typeof scalar === "number" ?
                undefined
            :   "Expected occupancy resolved to zero for this room and date",
    };
}
