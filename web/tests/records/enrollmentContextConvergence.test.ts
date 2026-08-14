/**
 * Enrollment context convergence — the sibling question.
 *
 * A director adds a second child to a family the centre already knows. The two things that must not
 * happen are a fabricated Opportunity (which would claim an acquisition that never occurred) and a
 * reopened one from 2025 (which would rewrite finished history). Both are asserted as ABSENCE,
 * because either would look like success from the outside.
 */

import { describe, expect, it } from "vitest";

import { startEnrollment } from "@/lib/records/startEnrollmentService";
import { resolveLiveEnrollmentContextForHousehold } from "@/lib/records/enrollmentContextResolver";
import {
    directEnroll,
    DirectEnrollNotReadyError,
    evaluateDirectEnrollReadiness,
} from "@/lib/records/directEnrollService";
import { buildEnrollmentProcessInstanceInsert } from "@/lib/process/processInstances";
import { getRegisteredAction, hasRegisteredHandler } from "@/lib/adminV2/actions/actionRegistry";
import {
    ENROLLMENT_DIRECT_ACTION_KEY,
    ENROLLMENT_START_ACTION_KEY,
} from "@/lib/adminV2/actions/definitions/enrollmentActions";
import { createEmploymentMock, ORG_ID, type EmploymentMock } from "../employment/mockEmploymentSupabase";

const HOUSEHOLD = "household-kurzman";
const CHILD_A = "member-child-a";
const CHILD_B = "member-child-b";
const SITE = "site-north";
const LIVE_OPP = "opp-live-2026";
const CLOSED_OPP = "opp-closed-2025";
const CLOSED_UNIT = "unit-closed";

function childRow(id: string) {
    return {
        id,
        org_id: ORG_ID,
        customer_id: HOUSEHOLD,
        person_id: null,
        display_name: id,
        relationship: "child",
        is_active: true,
    };
}

function mock(extra?: Record<string, Record<string, unknown>[]>): EmploymentMock {
    return createEmploymentMock({
        customers: [{ id: HOUSEHOLD, org_id: ORG_ID, name: "Kurzman Household" }],
        customer_members: [childRow(CHILD_A), childRow(CHILD_B)],
        opportunities: [],
        work_units: [],
        process_instances: [],
        child_enrollment_agreements: [],
        child_placements: [],
        schedule_assignments: [],
        schedule_patterns: [],
        ...extra,
    });
}

describe("both capabilities are registered on the existing runtime", () => {
    it("takes the durable CHILD as subject — neither is a creation path", () => {
        for (const key of [ENROLLMENT_START_ACTION_KEY, ENROLLMENT_DIRECT_ACTION_KEY]) {
            expect(hasRegisteredHandler(key)).toBe(true);
            const action = getRegisteredAction(key);
            expect(action?.supportedEntityTypes).toContain("child");
            // Both operate on a child that already exists.
            expect(action?.requiredContext.requiresEntityId).toBe(true);
            expect(action?.requiredContext.requiresOpportunity).toBe(false);
        }
    });
});

describe("the process-instance helper no longer demands an opportunity", () => {
    it("omits the context PAIR entirely when there is no episode", () => {
        const row = buildEnrollmentProcessInstanceInsert({
            orgId: ORG_ID,
            subjectId: CHILD_B,
            contextId: null,
            source: "enrollment_start",
        });
        // A context_type naming nothing would be a dangling label.
        expect(row.context_id).toBeUndefined();
        expect(row.context_type).toBeUndefined();
        expect(row.subject_id).toBe(CHILD_B);
    });

    it("still writes the pair when an episode is supplied", () => {
        const row = buildEnrollmentProcessInstanceInsert({
            orgId: ORG_ID,
            subjectId: CHILD_B,
            contextId: LIVE_OPP,
        });
        expect(row.context_id).toBe(LIVE_OPP);
        expect(row.context_type).toBe("opportunity");
    });
});

describe("a closed episode is never reopened for a sibling", () => {
    const closedFamily = () =>
        mock({
            work_units: [{ id: CLOSED_UNIT, org_id: ORG_ID, is_active: false }],
            opportunities: [
                { id: CLOSED_OPP, org_id: ORG_ID, customer_id: HOUSEHOLD, work_unit_id: CLOSED_UNIT },
            ],
            process_instances: [
                {
                    id: "pi-a",
                    org_id: ORG_ID,
                    process_key: "enrollment",
                    subject_type: "child",
                    subject_id: CHILD_A,
                    context_id: CLOSED_OPP,
                    state: "enrolled",
                },
            ],
        });

    it("resolves NO live context for a family whose enrolment completed", async () => {
        const m = closedFamily();
        const resolved = await resolveLiveEnrollmentContextForHousehold(m.supabase, ORG_ID, HOUSEHOLD);
        expect(resolved.context).toBeNull();
        // The old episode was seen and rejected, not missed.
        expect(resolved.consideredOpportunityIds).toContain(CLOSED_OPP);
    });

    it("starts the sibling's journey context-free and fabricates no opportunity", async () => {
        const m = closedFamily();
        const result = await startEnrollment(m.supabase, {
            orgId: ORG_ID,
            customerMemberId: CHILD_B,
        });

        expect(result.contextOutcome).toBe("context_free");
        expect(result.opportunityId).toBeNull();
        expect(m.writes.filter((w) => w.table === "opportunities")).toHaveLength(0);
        // The completed episode is untouched.
        expect(m.writes.filter((w) => w.table === "process_instances" && w.op === "update")).toHaveLength(0);

        const inserted = m.writes.find((w) => w.table === "process_instances" && w.op === "insert")!.row;
        expect(inserted.subject_id).toBe(CHILD_B);
        expect(inserted.context_id).toBeUndefined();
    });
});

describe("a live episode is joined, not duplicated", () => {
    const liveFamily = () =>
        mock({
            opportunities: [
                { id: LIVE_OPP, org_id: ORG_ID, customer_id: HOUSEHOLD, work_unit_id: null },
            ],
            process_instances: [
                {
                    id: "pi-a",
                    org_id: ORG_ID,
                    process_key: "enrollment",
                    subject_type: "child",
                    subject_id: CHILD_A,
                    context_id: LIVE_OPP,
                    state: "enrolling",
                },
            ],
        });

    it("recognises a running journey as a live episode", async () => {
        const m = liveFamily();
        const resolved = await resolveLiveEnrollmentContextForHousehold(m.supabase, ORG_ID, HOUSEHOLD);
        expect(resolved.context?.opportunityId).toBe(LIVE_OPP);
    });

    it("gives the sibling their OWN process instance inside that episode", async () => {
        const m = liveFamily();
        const result = await startEnrollment(m.supabase, {
            orgId: ORG_ID,
            customerMemberId: CHILD_B,
        });

        expect(result.contextOutcome).toBe("joined_live_episode");
        expect(result.opportunityId).toBe(LIVE_OPP);
        expect(m.writes.filter((w) => w.table === "opportunities")).toHaveLength(0);

        const inserted = m.writes.find((w) => w.table === "process_instances" && w.op === "insert")!.row;
        // The sibling does NOT share child A's journey.
        expect(inserted.subject_id).toBe(CHILD_B);
        expect(inserted.context_id).toBe(LIVE_OPP);
    });
});

describe("Direct Enroll refuses to produce an operationally unusable child", () => {
    const base = {
        orgId: ORG_ID,
        customerMemberId: CHILD_B,
        siteLocationId: SITE,
        startDate: "2026-09-01",
        programCategoryId: "program-infant",
        scheduleType: "full_day",
    };

    it("blocks when no schedule can be resolved — the core would only have warned", async () => {
        // No patterns at this site: the materializer degrades to `outcome: "warning"` and still
        // reports success, leaving a child no roster can ever expect.
        const m = mock();
        const readiness = await evaluateDirectEnrollReadiness(m.supabase, base);
        expect(readiness.ready).toBe(false);
        expect(readiness.blockers.map((b) => b.code)).toContain("unresolvable_schedule");
    });

    it("blocks when the child would be placed nowhere", async () => {
        const m = mock();
        const readiness = await evaluateDirectEnrollReadiness(m.supabase, {
            ...base,
            programCategoryId: null,
            roomLocationId: null,
        });
        expect(readiness.blockers.map((b) => b.code)).toContain("missing_placement");
    });

    it("blocks without a site or a start date", async () => {
        const m = mock();
        const readiness = await evaluateDirectEnrollReadiness(m.supabase, {
            ...base,
            siteLocationId: "",
            startDate: "",
        });
        const codes = readiness.blockers.map((b) => b.code);
        expect(codes).toContain("missing_site");
        expect(codes).toContain("missing_start_date");
    });

    it("writes NOTHING when readiness refuses", async () => {
        const m = mock();
        await expect(directEnroll(m.supabase, base)).rejects.toBeInstanceOf(DirectEnrollNotReadyError);
        expect(m.writes).toHaveLength(0);
    });

    it("passes once a real pattern exists at the site", async () => {
        const m = mock({
            schedule_patterns: [
                {
                    id: "pattern-full-day",
                    org_id: ORG_ID,
                    site_location_id: SITE,
                    schedule_type_key: "full_day",
                    key: "full_day",
                    is_active: true,
                },
            ],
        });
        const readiness = await evaluateDirectEnrollReadiness(m.supabase, base);
        expect(readiness.ready).toBe(true);
        expect(readiness.resolvedSchedulePatternId).toBe("pattern-full-day");
    });
});
