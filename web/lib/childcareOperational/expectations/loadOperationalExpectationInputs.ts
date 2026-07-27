/**
 * Shared DB loader for the committed operational rows + config bundle + resolved
 * age groups that drive BOTH L3 expectations and L4 actual compliance. Keeps a
 * single fetch/shape so expected and actual are computed from identical inputs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    loadChildcareConfigRuleBundle,
    type ChildcareConfigRuleBundle,
} from "@/lib/childcareOperational/config/childcareConfigRuleService";
import { loadExpectationAgeGroups } from "@/lib/childcareOperational/expectations/resolveExpectationAgeGroups";
import type {
    OperationalAgreementInput,
    OperationalAssignmentInput,
    OperationalPlacementInput,
    OperationalProposedAssignmentInput,
    SchedulePatternInput,
} from "@/lib/childcareOperational/expectations/scheduleExpectationCore";

const AGREEMENT_OPERATIONAL = ["pending_start", "active", "ending"];
const ROW_OPERATIONAL = ["planned", "active", "ending"];

export type LoadOperationalExpectationInputsArgs = {
    orgId: string;
    siteLocationId: string;
    ageGroupByRoomLocationId?: Record<string, string | null>;
    ageGroupByProgramCategoryId?: Record<string, string | null>;
};

export type OperationalExpectationInputs = {
    agreements: OperationalAgreementInput[];
    placements: OperationalPlacementInput[];
    assignments: OperationalAssignmentInput[];
    /** Proposed (planning-only) child assignments — no agreement, own room/program. */
    proposedAssignments: OperationalProposedAssignmentInput[];
    patternsById: Map<string, SchedulePatternInput>;
    config: ChildcareConfigRuleBundle;
    ageGroupByRoomLocationId?: Record<string, string | null>;
    ageGroupByProgramCategoryId?: Record<string, string | null>;
};

const EMPTY_QUERY_RESULT = { data: [] as Record<string, unknown>[], error: null };

export async function loadOperationalExpectationInputs(
    supabase: SupabaseClient,
    args: LoadOperationalExpectationInputsArgs
): Promise<OperationalExpectationInputs> {
    const { orgId, siteLocationId } = args;

    const { data: agreementData, error: agreementError } = await supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id, site_location_id, start_date, end_date, status")
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .in("status", AGREEMENT_OPERATIONAL);
    if (agreementError) {
        throw new OperationalEnrollmentServiceError("db_error", agreementError.message);
    }
    const agreements = (agreementData ?? []) as OperationalAgreementInput[];
    const agreementIds = agreements.map((a) => a.id);

    // Proposed assignments carry no enrollment agreement — fetched independently of
    // whether the site has any operational agreements, keyed directly by site/member.
    const [
        { data: placementData, error: placementError },
        { data: assignmentData, error: assignmentError },
        { data: proposedData, error: proposedError },
        config,
    ] = await Promise.all([
        agreementIds.length > 0
            ? supabase
                  .from("child_placements")
                  .select(
                      "enrollment_agreement_id, room_location_id, program_category_id, start_date, end_date, status"
                  )
                  .eq("org_id", orgId)
                  .in("enrollment_agreement_id", agreementIds)
                  .in("status", ROW_OPERATIONAL)
            : Promise.resolve(EMPTY_QUERY_RESULT),
        agreementIds.length > 0
            ? supabase
                  .from("schedule_assignments")
                  .select("enrollment_agreement_id, schedule_pattern_id, start_date, end_date, status")
                  .eq("org_id", orgId)
                  .in("enrollment_agreement_id", agreementIds)
                  .eq("commitment_kind", "committed")
                  .in("status", ROW_OPERATIONAL)
            : Promise.resolve(EMPTY_QUERY_RESULT),
        supabase
            .from("schedule_assignments")
            .select(
                "customer_member_id, site_location_id, room_location_id, program_category_id, schedule_pattern_id, start_date, end_date, status"
            )
            .eq("org_id", orgId)
            .eq("site_location_id", siteLocationId)
            .eq("subject_type", "child")
            .eq("commitment_kind", "proposed")
            .in("status", ROW_OPERATIONAL),
        loadChildcareConfigRuleBundle(supabase, orgId),
    ]);
    if (placementError) throw new OperationalEnrollmentServiceError("db_error", placementError.message);
    if (assignmentError) throw new OperationalEnrollmentServiceError("db_error", assignmentError.message);
    if (proposedError) throw new OperationalEnrollmentServiceError("db_error", proposedError.message);

    const placements = (placementData ?? []) as OperationalPlacementInput[];
    const assignments = (assignmentData ?? []) as OperationalAssignmentInput[];
    const proposedAssignments = (proposedData ?? []) as OperationalProposedAssignmentInput[];

    const patternIds = [
        ...new Set([
            ...assignments.map((a) => a.schedule_pattern_id),
            ...proposedAssignments.map((a) => a.schedule_pattern_id),
        ]),
    ];
    const patternsById = new Map<string, SchedulePatternInput>();
    if (patternIds.length > 0) {
        const { data: patternData, error: patternError } = await supabase
            .from("schedule_patterns")
            .select("id, weekdays, schedule_type_key")
            .eq("org_id", orgId)
            .in("id", patternIds);
        if (patternError) throw new OperationalEnrollmentServiceError("db_error", patternError.message);
        for (const p of (patternData ?? []) as SchedulePatternInput[]) {
            patternsById.set(p.id, p);
        }
    }

    // Resolve age groups from canonical sources unless the caller overrode them.
    let ageGroupByProgramCategoryId = args.ageGroupByProgramCategoryId;
    let ageGroupByRoomLocationId = args.ageGroupByRoomLocationId;
    if (ageGroupByProgramCategoryId == null || ageGroupByRoomLocationId == null) {
        const resolved = await loadExpectationAgeGroups(supabase, orgId, {
            programCategoryIds: [
                ...placements.map((p) => p.program_category_id),
                ...proposedAssignments.map((a) => a.program_category_id),
            ].filter((id): id is string => Boolean(id)),
            roomLocationIds: [
                ...placements.map((p) => p.room_location_id),
                ...proposedAssignments.map((a) => a.room_location_id),
            ].filter((id): id is string => Boolean(id)),
        });
        ageGroupByProgramCategoryId = ageGroupByProgramCategoryId ?? resolved.ageGroupByProgramCategoryId;
        ageGroupByRoomLocationId = ageGroupByRoomLocationId ?? resolved.ageGroupByRoomLocationId;
    }

    return {
        agreements,
        placements,
        assignments,
        proposedAssignments,
        patternsById,
        config,
        ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId,
    };
}
