/**
 * DB wrapper for Schedule-derived Expectations (L3). Loads committed operational
 * rows + config + age groups via the shared loader, then delegates to the pure
 * assembler. Returns a derived, non-authoritative read model.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildScheduleExpectations,
    type ScheduleExpectationReadModel,
} from "@/lib/childcareOperational/expectations/buildScheduleExpectations";
import { loadOperationalExpectationInputs } from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";

export type FetchScheduleExpectationsInput = {
    orgId: string;
    siteLocationId: string;
    dateStart: string;
    dateEnd: string;
    /**
     * Optional caller overrides. When omitted, age groups are resolved from
     * canonical sources (placement program category + room field values).
     */
    ageGroupByRoomLocationId?: Record<string, string | null>;
    ageGroupByProgramCategoryId?: Record<string, string | null>;
};

export async function fetchScheduleExpectations(
    supabase: SupabaseClient,
    input: FetchScheduleExpectationsInput
): Promise<ScheduleExpectationReadModel> {
    const loaded = await loadOperationalExpectationInputs(supabase, {
        orgId: input.orgId,
        siteLocationId: input.siteLocationId,
        ageGroupByRoomLocationId: input.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: input.ageGroupByProgramCategoryId,
    });

    return buildScheduleExpectations({
        dateStart: input.dateStart,
        dateEnd: input.dateEnd,
        agreements: loaded.agreements,
        placements: loaded.placements,
        assignments: loaded.assignments,
        patternsById: loaded.patternsById,
        config: loaded.config,
        ageGroupByRoomLocationId: loaded.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: loaded.ageGroupByProgramCategoryId,
    });
}
