/**
 * STAFFING V1 QA — is the fixture actually ready, and how do we know?
 *
 * The answer is taken from the product's own projection, not from a private query. If the
 * harness checked the fixture its own way it could report READY for a day the Calendar
 * renders differently, which is the one failure a readiness check must not have. What the
 * operator is about to see is what this reads.
 *
 * Nothing here writes. The fixture is authored through canonical product paths and stays in
 * place until the operator finishes; this module only looks at it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchStaffingProjection } from "@/lib/staffingProjection/fetchStaffingProjection";
import type { StaffingProjectionDay } from "@/lib/staffingProjection/staffingProjectionTypes";
import { SCENARIOS, type FixtureCheck, type Scenario } from "@/lib/qa/staffingV1Qa/scenarioCatalog";

/**
 * The prepared QA context.
 *
 * Ids rather than names because a name is not a key, and a rename during QA would silently
 * point the harness at nothing. The labels are carried beside them for the operator.
 */
export const QA_FIXTURE = Object.freeze({
    siteLocationId: "1a5644a7-45c4-413b-9021-5f556118b6e2",
    siteLabel: "North Campus",
    roomLocationId: "16b9ec76-d1e6-41b2-b76c-44853543dc18",
    roomLabel: "Infant A",
    date: "2027-04-01",
    dateLabel: "Thursday, 1 April 2027",
});

export function deployedRevision(): string {
    return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.ALLOY_BUILD_SHA ?? "unknown";
}

export function environmentName(): string {
    return process.env.VERCEL_ENV === "production" ? "production" : "staging";
}

export type FixtureSnapshot = {
    ok: boolean;
    /** Present when the projection could not be read at all. */
    error: string | null;
    siteLabel: string;
    roomLabel: string;
    dateLabel: string;
    date: string;
    /** What the Calendar will show, summarised for the landing page. */
    roomSegments: {
        start: string;
        end: string;
        expectedChildren: number;
        requiredStaff: number | null;
        plannedStaff: number;
        state: string;
    }[];
    checks: Record<FixtureCheck, boolean>;
};

const EMPTY_CHECKS: Record<FixtureCheck, boolean> = {
    site_exists: false,
    room_exists: false,
    child_demand_on_qa_date: false,
    requirement_resolves: false,
    adequate_segment_exists: false,
    gap_segment_exists: false,
    staff_candidates_exist: false,
    attendance_observed_on_qa_date: false,
};

/**
 * Read the QA day once, through the same projection the Calendar uses.
 *
 * A failed read is reported as a failed read. "We could not look" and "the fixture is gone"
 * are different answers and the harness must not turn the first into the second.
 */
export async function readFixture(supabase: SupabaseClient, orgId: string): Promise<FixtureSnapshot> {
    const base = {
        siteLabel: QA_FIXTURE.siteLabel,
        roomLabel: QA_FIXTURE.roomLabel,
        dateLabel: QA_FIXTURE.dateLabel,
        date: QA_FIXTURE.date,
    };

    let day: StaffingProjectionDay | null = null;
    try {
        const projection = await fetchStaffingProjection(supabase, {
            orgId,
            siteLocationId: QA_FIXTURE.siteLocationId,
            dateStart: QA_FIXTURE.date,
            dateEnd: QA_FIXTURE.date,
        });
        day = projection.days[0] ?? null;
    } catch (e) {
        return {
            ...base,
            ok: false,
            error: e instanceof Error ? e.message : "The staffing picture could not be read.",
            roomSegments: [],
            checks: { ...EMPTY_CHECKS },
        };
    }

    const segments = day?.segments ?? [];
    const roomSegments = segments.filter((s) => s.roomLocationId === QA_FIXTURE.roomLocationId);

    const checks: Record<FixtureCheck, boolean> = {
        // The projection answering at all means the site resolved for this org.
        site_exists: day != null,
        room_exists: roomSegments.length > 0,
        child_demand_on_qa_date: roomSegments.some((s) => s.expectedChildCount > 0),
        requirement_resolves: roomSegments.some((s) => s.requiredStaff != null),
        adequate_segment_exists: roomSegments.some(
            (s) => s.plannedState === "sufficient" && s.expectedChildCount > 0
        ),
        gap_segment_exists: roomSegments.some((s) => s.plannedState === "short"),
        staff_candidates_exist: segments.some((s) => s.candidateStaff.length > 0),
        attendance_observed_on_qa_date: day?.actualsObserved === true,
    };

    return {
        ...base,
        ok: checks.site_exists && checks.room_exists,
        error: null,
        roomSegments: roomSegments.map((s) => ({
            start: s.start,
            end: s.end,
            expectedChildren: s.expectedChildCount,
            requiredStaff: s.requiredStaff,
            plannedStaff: s.effectivePlannedStaff.length,
            state: s.plannedState,
        })),
        checks,
    };
}

export type ScenarioReadiness = {
    key: string;
    /** RUNNABLE, or the reason it is not. */
    status: "RUNNABLE" | "FIXTURE_NEEDED" | "BLOCKED";
    /** The preconditions that are not satisfied, in the catalog's own words. */
    unmet: string[];
};

/**
 * Whether each scenario can actually be driven right now.
 *
 * A scenario the catalog marks FIXTURE_NEEDED stays FIXTURE_NEEDED even if its precondition
 * happens to pass, because the disposition is a statement about this environment that an
 * incidental fixture should not quietly overturn — and it becomes RUNNABLE only when the
 * check it names is genuinely satisfied.
 */
export function resolveScenarioReadiness(fixture: FixtureSnapshot): ScenarioReadiness[] {
    return SCENARIOS.map((s: Scenario) => {
        const unmet = s.requires.filter((r) => !fixture.checks[r.check]).map((r) => r.describe);
        if (!fixture.ok) return { key: s.key, status: "BLOCKED" as const, unmet: unmet.length ? unmet : ["the QA day could not be read"] };
        if (unmet.length > 0) {
            return {
                key: s.key,
                status: s.disposition === "FIXTURE_NEEDED" ? ("FIXTURE_NEEDED" as const) : ("BLOCKED" as const),
                unmet,
            };
        }
        return { key: s.key, status: "RUNNABLE" as const, unmet: [] };
    });
}

/** One word for the landing page. */
export function overallFixtureStatus(fixture: FixtureSnapshot): "READY" | "PARTIAL" | "BLOCKED" {
    if (!fixture.ok) return "BLOCKED";
    const core: FixtureCheck[] = [
        "child_demand_on_qa_date",
        "requirement_resolves",
        "adequate_segment_exists",
        "gap_segment_exists",
        "staff_candidates_exist",
    ];
    return core.every((c) => fixture.checks[c]) ? "READY" : "PARTIAL";
}
