import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeOperationalEnrollmentHandoffFromApprovedOpportunity } from "@/lib/childcareOperational/enrollmentAgreementHandoff";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    MEMBER_ID,
    PATTERN_ID,
    PROGRAM_ID,
    SITE_ID,
    UNIT_ID,
    seedOperationalEnrollmentFixtures,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import {
    ENROLLMENT_AGREEMENT_CREATED_EVENT,
    OPERATIONAL_ENROLLMENT_HANDOFF_COMPLETED_EVENT,
    OPERATIONAL_ENROLLMENT_HANDOFF_PARTIAL_EVENT,
    PLACEMENT_CREATED_EVENT,
    SCHEDULE_ASSIGNMENT_CREATED_EVENT,
} from "@/lib/childcareOperational/operationalEnrollmentEvents";

const emitEvent = vi.fn();
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => emitEvent(...args),
}));

const OPP_ID = "opp-1";
const OCM_ID = "ocm-1";
const OCM_ID_2 = "ocm-2";
const MEMBER_ID_2 = "member-2";

function handoffStore(overrides?: {
    ocm?: Record<string, unknown>;
    ocmRows?: Record<string, unknown>[];
    patterns?: Record<string, unknown>[];
    agreements?: Record<string, unknown>[];
}) {
    const base = seedOperationalEnrollmentFixtures();
    const defaultOcm = {
        id: OCM_ID,
        org_id: ORG_ID,
        opportunity_id: OPP_ID,
        customer_member_id: MEMBER_ID,
        location_id: SITE_ID,
        program_category_id: PROGRAM_ID,
        program_room_cohort_key: UNIT_ID,
        schedule_type: "full_time",
        start_date: "2026-06-15",
        person_id: "person-1",
        ...overrides?.ocm,
    };
    const ocmRows = overrides?.ocmRows ?? [defaultOcm];
    const customerMembers = [
        ...base.customer_members,
        ...(ocmRows.some((r) => r.customer_member_id === MEMBER_ID_2) ?
            [{
                id: MEMBER_ID_2,
                org_id: ORG_ID,
                customer_id: "cust-1",
                person_id: "person-2",
            }]
        :   []),
    ];
    return createOperationalEnrollmentMockStore({
        ...base,
        customer_members: customerMembers,
        child_enrollment_agreements: overrides?.agreements ?? [],
        schedule_patterns: overrides?.patterns ?? base.schedule_patterns,
        opportunities: [
            {
                id: OPP_ID,
                org_id: ORG_ID,
                location_id: SITE_ID,
                customer_id: "cust-1",
            },
        ],
        opportunity_customer_members: ocmRows,
    });
}

describe("enrollmentAgreementHandoff", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        emitEvent.mockResolvedValue("event-1");
    });

    it("happy path creates agreement, placement, and schedule assignment", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(handoffStore());
        const result = await executeOperationalEnrollmentHandoffFromApprovedOpportunity({
            supabase,
            orgId: ORG_ID,
            opportunityId: OPP_ID,
            todayYmd: "2026-06-15",
            actorUserId: "user-1",
        });

        expect(result.ok).toBe(true);
        expect(result.partial).toBe(false);
        expect(result.children).toHaveLength(1);
        expect(result.children[0]?.agreement.outcome).toBe("created");
        expect(result.children[0]?.placement.outcome).toBe("created");
        expect(result.children[0]?.schedule_assignment.outcome).toBe("created");

        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: ENROLLMENT_AGREEMENT_CREATED_EVENT })
        );
        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: PLACEMENT_CREATED_EVENT })
        );
        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: SCHEDULE_ASSIGNMENT_CREATED_EVENT })
        );
        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: OPERATIONAL_ENROLLMENT_HANDOFF_COMPLETED_EVENT })
        );
    });

    it("idempotent second run reuses agreement, placement, and assignment", async () => {
        const store = handoffStore();
        const supabase = createOperationalEnrollmentMockSupabase(store);

        const first = await executeOperationalEnrollmentHandoffFromApprovedOpportunity({
            supabase,
            orgId: ORG_ID,
            opportunityId: OPP_ID,
            todayYmd: "2026-06-15",
        });
        expect(first.ok).toBe(true);
        emitEvent.mockClear();

        const second = await executeOperationalEnrollmentHandoffFromApprovedOpportunity({
            supabase,
            orgId: ORG_ID,
            opportunityId: OPP_ID,
            todayYmd: "2026-06-15",
        });

        expect(second.ok).toBe(true);
        expect(second.children[0]?.agreement.outcome).toBe("reused");
        expect(second.children[0]?.placement.outcome).toBe("reused");
        expect(second.children[0]?.schedule_assignment.outcome).toBe("reused");
        expect(emitEvent).not.toHaveBeenCalledWith(
            expect.objectContaining({ event_type: ENROLLMENT_AGREEMENT_CREATED_EVENT })
        );
    });

    it("skips OCM rows without customer_member_id", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(
            handoffStore({ ocm: { customer_member_id: null } })
        );
        const result = await executeOperationalEnrollmentHandoffFromApprovedOpportunity({
            supabase,
            orgId: ORG_ID,
            opportunityId: OPP_ID,
            todayYmd: "2026-06-15",
        });

        expect(result.ok).toBe(true);
        expect(result.children[0]?.skipped).toBe(true);
        expect(result.children[0]?.skip_reason).toBe("missing_customer_member_id");
        expect(result.children[0]?.agreement.outcome).toBe("skipped");
    });

    it("falls back to opportunity location and records warning", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(
            handoffStore({ ocm: { location_id: null } })
        );
        const result = await executeOperationalEnrollmentHandoffFromApprovedOpportunity({
            supabase,
            orgId: ORG_ID,
            opportunityId: OPP_ID,
            todayYmd: "2026-06-15",
        });

        expect(result.ok).toBe(true);
        expect(result.children[0]?.site_location_id).toBe(SITE_ID);
        expect(result.children[0]?.warnings).toContain("site_resolved_from_opportunity_location_id");
        expect(result.children[0]?.agreement.outcome).toBe("created");
    });

    it("partial success when schedule pattern is missing", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(
            handoffStore({ patterns: [] })
        );
        const result = await executeOperationalEnrollmentHandoffFromApprovedOpportunity({
            supabase,
            orgId: ORG_ID,
            opportunityId: OPP_ID,
            todayYmd: "2026-06-15",
        });

        expect(result.ok).toBe(true);
        expect(result.partial).toBe(true);
        expect(result.children[0]?.agreement.outcome).toBe("created");
        expect(result.children[0]?.placement.outcome).toBe("created");
        expect(result.children[0]?.schedule_assignment.outcome).toBe("warning");
        expect(result.children[0]?.schedule_assignment.warning).toContain("no_schedule_pattern_for");
        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: OPERATIONAL_ENROLLMENT_HANDOFF_PARTIAL_EVENT })
        );
    });

    it("creates placement but skips schedule when schedule_type is missing", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(
            handoffStore({ ocm: { schedule_type: null } })
        );
        const result = await executeOperationalEnrollmentHandoffFromApprovedOpportunity({
            supabase,
            orgId: ORG_ID,
            opportunityId: OPP_ID,
            todayYmd: "2026-06-15",
        });

        expect(result.ok).toBe(true);
        expect(result.children[0]?.agreement.outcome).toBe("created");
        expect(result.children[0]?.placement.outcome).toBe("created");
        expect(result.children[0]?.schedule_assignment.outcome).toBe("skipped");
        // Warning label generalized in the shared materialization core (pattern-id or schedule-type).
        expect(result.children[0]?.schedule_assignment.warning).toBe("no_schedule");
    });

    it("partial when multiple children and one lacks matching schedule pattern", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(
            handoffStore({
                ocmRows: [
                    {
                        id: OCM_ID,
                        org_id: ORG_ID,
                        opportunity_id: OPP_ID,
                        customer_member_id: MEMBER_ID,
                        location_id: SITE_ID,
                        program_category_id: PROGRAM_ID,
                        program_room_cohort_key: UNIT_ID,
                        schedule_type: "full_time",
                        start_date: "2026-06-15",
                        person_id: "person-1",
                    },
                    {
                        id: OCM_ID_2,
                        org_id: ORG_ID,
                        opportunity_id: OPP_ID,
                        customer_member_id: MEMBER_ID_2,
                        location_id: SITE_ID,
                        program_category_id: PROGRAM_ID,
                        program_room_cohort_key: UNIT_ID,
                        schedule_type: "part_time",
                        start_date: "2026-06-15",
                        person_id: "person-2",
                    },
                ],
            })
        );
        const result = await executeOperationalEnrollmentHandoffFromApprovedOpportunity({
            supabase,
            orgId: ORG_ID,
            opportunityId: OPP_ID,
            todayYmd: "2026-06-15",
        });

        expect(result.ok).toBe(true);
        expect(result.partial).toBe(true);
        expect(result.children).toHaveLength(2);
        expect(result.children[0]?.schedule_assignment.outcome).toBe("created");
        expect(result.children[1]?.schedule_assignment.outcome).toBe("warning");
        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: OPERATIONAL_ENROLLMENT_HANDOFF_PARTIAL_EVENT })
        );
    });
});
