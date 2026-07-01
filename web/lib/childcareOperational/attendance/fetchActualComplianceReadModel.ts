/**
 * DB wrapper for the site-level actual compliance read model (P2.1). Reuses the
 * shared operational-input loader (so tier/capacity resolution matches L3) plus
 * the L4 attendance facts, then delegates to the pure builder.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOperationalExpectationInputs } from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { expandExpectedAttendance } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import { buildRoomConfigResolvers } from "@/lib/childcareOperational/config/roomConfigResolvers";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";
import {
    buildActualComplianceReadModel,
    type ActualComplianceReadModel,
} from "@/lib/childcareOperational/attendance/buildActualComplianceReadModel";
import type { ActualStaffingInput } from "@/lib/childcareOperational/attendance/actualCompliance";

export type FetchActualComplianceInput = {
    orgId: string;
    siteLocationId: string;
    dateStart: string;
    dateEnd: string;
    /** Optional staff-on-hand placeholder until staff scheduling exists. */
    staffing?: ActualStaffingInput;
};

export async function fetchActualComplianceReadModel(
    supabase: SupabaseClient,
    input: FetchActualComplianceInput
): Promise<ActualComplianceReadModel> {
    const loaded = await loadOperationalExpectationInputs(supabase, {
        orgId: input.orgId,
        siteLocationId: input.siteLocationId,
    });

    const { resolveTiers, resolveCapacityBinding } = buildRoomConfigResolvers({
        agreements: loaded.agreements,
        placements: loaded.placements,
        config: loaded.config,
        ageGroupByRoomLocationId: loaded.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: loaded.ageGroupByProgramCategoryId,
    });

    const expectedAttendance = expandExpectedAttendance({
        dateStart: input.dateStart,
        dateEnd: input.dateEnd,
        agreements: loaded.agreements,
        placements: loaded.placements,
        assignments: loaded.assignments,
        patternsById: loaded.patternsById,
    });

    const events = await listAttendanceEvents(supabase, input.orgId, {
        siteLocationId: input.siteLocationId,
        serviceDateStart: input.dateStart,
        serviceDateEnd: input.dateEnd,
    });

    return buildActualComplianceReadModel({
        events,
        expectedAttendance,
        resolveTiers,
        resolveCapacityBinding,
        staffing: input.staffing,
    });
}
