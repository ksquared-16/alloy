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
import { resolveAssignmentTimes } from "@/lib/assignmentTime/resolveAssignmentTime";
import type {
    OperationalAgreementInput,
    OperationalAssignmentInput,
    OperationalPlacementInput,
    OperationalProposedAssignmentInput,
    SchedulePatternInput,
} from "@/lib/childcareOperational/expectations/scheduleExpectationCore";

const AGREEMENT_OPERATIONAL = ["pending_start", "active", "ending"];
const ROW_OPERATIONAL = ["planned", "active", "ending"];
/**
 * Live rows plus `superseded` ones: a superseded row is still the effective one until its end date
 * (audit E2), and it is what applied on past dates. The core picks the row covering each date.
 * Live rows come first, so readers that take the first row per room (`buildRoomConfigResolvers`)
 * keep their answer.
 */
const ROW_DATED = [...ROW_OPERATIONAL, "superseded"];
const liveFirst = <T extends { status: string }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => Number(!ROW_OPERATIONAL.includes(a.status)) - Number(!ROW_OPERATIONAL.includes(b.status)));

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
    /**
     * Each assignment's own recurring weekdays (its Assignment Time), when it has interval rows. A
     * custom week saved against a pattern recurs on THESE days; without rows the pattern decides.
     */
    weekdaysByAssignmentId?: Map<string, number[]>;
    config: ChildcareConfigRuleBundle;
    ageGroupByRoomLocationId?: Record<string, string | null>;
    ageGroupByProgramCategoryId?: Record<string, string | null>;
};

const EMPTY_QUERY_RESULT = { data: [] as Record<string, unknown>[], error: null };

type SessionRow = OperationalAssignmentInput & { operational_assignment_type_id?: string | null };

/**
 * The rows that produce expectations (V7 S6): every primary, and the secondaries whose category
 * expects attendance (`operational_assignment_types.attendance_participation = 'expected'`). An
 * agreement with no primary row keeps no secondary — a child is never expected from a secondary
 * alone. Pure; exported for tests.
 */
export function selectQualifyingSessions(
    rows: readonly SessionRow[],
    expectedTypeIds: ReadonlySet<string>,
): OperationalAssignmentInput[] {
    const withPrimary = new Set(rows.filter((r) => r.is_primary !== false).map((r) => r.enrollment_agreement_id));
    return rows
        .filter(
            (r) =>
                r.is_primary !== false ||
                (withPrimary.has(r.enrollment_agreement_id) &&
                    !!r.operational_assignment_type_id &&
                    expectedTypeIds.has(r.operational_assignment_type_id)),
        )
        .map((r) => ({ ...r, is_primary: r.is_primary !== false }));
}

async function qualifyingSessions(
    supabase: SupabaseClient,
    orgId: string,
    rows: SessionRow[],
): Promise<OperationalAssignmentInput[]> {
    const typeIds = [
        ...new Set(
            rows
                .filter((r) => r.is_primary === false)
                .map((r) => r.operational_assignment_type_id)
                .filter((id): id is string => Boolean(id)),
        ),
    ];
    const expectedTypes = new Set<string>();
    if (typeIds.length > 0) {
        const { data, error } = await supabase
            .from("operational_assignment_types")
            .select("id, attendance_participation")
            .eq("org_id", orgId)
            .in("id", typeIds);
        if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
        for (const t of (data ?? []) as Array<{ id: string; attendance_participation: string | null }>) {
            if (t.attendance_participation === "expected") expectedTypes.add(t.id);
        }
    }
    return selectQualifyingSessions(rows, expectedTypes);
}

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
                  .in("status", ROW_DATED)
            : Promise.resolve(EMPTY_QUERY_RESULT),
        /*
         * THE SESSIONS A CHILD IS EXPECTED AT (V7 S6, Director 2026-10-25): the enrollment's primary,
         * always, plus each committed secondary whose category says `attendance_participation =
         * 'expected'` — in its own space, on its own days and hours. A secondary of a category that does
         * not expect attendance (or of no category) never produces an expectation, and a child with no
         * primary is still not expected from a secondary alone (`expectedAttendancePrimarySchedule.live`).
         * The category filter is applied below, once the categories are read.
         */
        agreementIds.length > 0
            ? supabase
                  .from("schedule_assignments")
                  .select(
                      "id, enrollment_agreement_id, schedule_pattern_id, start_date, end_date, status, is_primary, room_location_id, operational_assignment_type_id, supersedes_assignment_id"
                  )
                  .eq("org_id", orgId)
                  .eq("subject_type", "child")
                  .in("enrollment_agreement_id", agreementIds)
                  .eq("commitment_kind", "committed")
                  .in("status", ROW_DATED)
            : Promise.resolve(EMPTY_QUERY_RESULT),
        supabase
            .from("schedule_assignments")
            .select(
                "id, customer_member_id, site_location_id, room_location_id, program_category_id, schedule_pattern_id, start_date, end_date, status"
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

    const placements = liveFirst((placementData ?? []) as OperationalPlacementInput[]);
    const assignments = liveFirst(
        await qualifyingSessions(supabase, orgId, (assignmentData ?? []) as SessionRow[]),
    );
    const proposedAssignments = (proposedData ?? []) as OperationalProposedAssignmentInput[];

    const patternIds = [
        ...new Set([
            ...assignments.map((a) => a.schedule_pattern_id),
            ...proposedAssignments.map((a) => a.schedule_pattern_id),
        ]),
    ];
    /*
     * PATTERNS AND AGE GROUPS ARE INDEPENDENT — SO THEY ARE ASKED TOGETHER.
     *
     * `schedule_patterns` is keyed by the pattern ids on the assignments; age-group resolution is
     * keyed by the program categories and rooms on the placements. Neither reads the other's
     * result. They were nonetheless awaited in series, which put two full round trips on the
     * Attendance critical path where one belongs. Measured on deployed 680e5765: the
     * `expectations` phase was ~700ms over a six-deep serial chain, and `attendance_fold` bound the
     * provisioning frame in 21 of 21 cold samples.
     *
     * NOTHING ELSE CHANGES. Same queries, same filters, same org scoping, same authorization, same
     * rows. Only the SCHEDULE changes, so the assembler downstream cannot tell the difference —
     * which is what `attendanceExpectationsMemberScopeParity` and the concurrency guard pin.
     *
     * FAILURE PRECEDENCE IS PRESERVED DELIBERATELY. In series a pattern error threw before age
     * groups ran, so a caller seeing both faults saw the pattern one. `allSettled` keeps both
     * outcomes and rethrows in that same order, and because both are reads, running the second
     * one on a doomed request mutates nothing.
     */
    const patternsPromise: Promise<SchedulePatternInput[]> = (async () => {
        if (patternIds.length === 0) return [];
        const { data, error } = await supabase
            .from("schedule_patterns")
            .select("id, weekdays, schedule_type_key")
            .eq("org_id", orgId)
            .in("id", patternIds);
        if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
        return (data ?? []) as SchedulePatternInput[];
    })();

    // Resolve age groups from canonical sources unless the caller overrode them.
    let ageGroupByProgramCategoryId = args.ageGroupByProgramCategoryId;
    let ageGroupByRoomLocationId = args.ageGroupByRoomLocationId;
    const needsAgeGroups = ageGroupByProgramCategoryId == null || ageGroupByRoomLocationId == null;
    const ageGroupsPromise = needsAgeGroups
        ? loadExpectationAgeGroups(supabase, orgId, {
              programCategoryIds: [
                  ...placements.map((p) => p.program_category_id),
                  ...proposedAssignments.map((a) => a.program_category_id),
              ].filter((id): id is string => Boolean(id)),
              roomLocationIds: [
                  ...placements.map((p) => p.room_location_id),
                  ...proposedAssignments.map((a) => a.room_location_id),
                  // A qualifying secondary session's own space (V7 S6).
                  ...assignments.map((a) => a.room_location_id ?? null),
              ].filter((id): id is string => Boolean(id)),
          })
        : null;

    /*
     * THE WEEK EACH ASSIGNMENT RUNS — the canonical Assignment Time read, asked once for every row
     * alongside the pattern read (same dependency: the assignment ids). Only rows that own intervals
     * are kept; the rest fall back to their pattern in the core, as `resolveAssignmentTimes` documents.
     */
    const weekdaysPromise = (async () => {
        const ids = [...assignments.map((a) => a.id), ...proposedAssignments.map((a) => a.id)];
        const out = new Map<string, number[]>();
        if (ids.length === 0) return out;
        const times = await resolveAssignmentTimes(supabase, { orgId, assignmentIds: ids });
        for (const [id, t] of times) if (t.hasIntervals) out.set(id, t.weekdays);
        return out;
    })();

    const [patternsSettled, ageGroupsSettled, weekdaysSettled] = await Promise.allSettled([
        patternsPromise,
        ageGroupsPromise ?? Promise.resolve(null),
        weekdaysPromise,
    ]);
    if (patternsSettled.status === "rejected") throw patternsSettled.reason;
    if (ageGroupsSettled.status === "rejected") throw ageGroupsSettled.reason;
    if (weekdaysSettled.status === "rejected") throw weekdaysSettled.reason;

    const patternsById = new Map<string, SchedulePatternInput>();
    for (const p of patternsSettled.value) {
        patternsById.set(p.id, p);
    }

    const resolved = ageGroupsSettled.value;
    if (resolved) {
        ageGroupByProgramCategoryId = ageGroupByProgramCategoryId ?? resolved.ageGroupByProgramCategoryId;
        ageGroupByRoomLocationId = ageGroupByRoomLocationId ?? resolved.ageGroupByRoomLocationId;
    }

    return {
        agreements,
        placements,
        assignments,
        proposedAssignments,
        patternsById,
        weekdaysByAssignmentId: weekdaysSettled.value,
        config,
        ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId,
    };
}
