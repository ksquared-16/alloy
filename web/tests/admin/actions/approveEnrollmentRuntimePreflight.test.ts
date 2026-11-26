/**
 * Integration-style tests: real evaluateEffectiveRequirements preflight path (no mock on evaluator).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import { APPROVE_ENROLLMENT_ACTION_KEY } from "@/lib/admin/actions/enrollmentApprovalConstants";
import { mergeEnrollmentDateMetadata, todayEnrollmentDateIso } from "@/lib/admin/actions/executeApproveEnrollmentAction";

vi.mock("@/lib/admin/assertRowOrg", () => ({
    assertRowOrg: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus", () => ({
    updateOpportunityCustomerMemberLifecycleStatus: vi.fn(),
}));

const emitStatusChangedEvent = vi.fn();
vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: (...args: unknown[]) => emitStatusChangedEvent(...args),
}));

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/admin/statusTransitionRules", () => ({
    validateStatusTransition: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/opportunityIdentity", () => ({
    normalizeOpportunityWritePayload: vi.fn().mockResolvedValue(undefined),
}));

const emitEvent = vi.fn();
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => emitEvent(...args),
}));

vi.mock("@/lib/admin/actions/executeApproveEnrollmentAction", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/actions/executeApproveEnrollmentAction")>();
    return {
        ...actual,
        stampChildEnrollmentDatesIfBlank: vi.fn().mockResolvedValue(undefined),
    };
});

function approveDef() {
    return {
        id: "def-approve",
        key: APPROVE_ENROLLMENT_ACTION_KEY,
        action_type: "update_status",
        entity_type: "opportunity",
        payload_schema: { status_key: "enrolled" },
        workflow_id: null,
        org_id: null,
        is_active: true,
    };
}

type ChildRow = {
    id: string;
    customer_member_id: string;
    person_id?: string | null;
    first_name?: string;
    last_name?: string;
    program_category_id?: string | null;
    program_room_cohort_key?: string | null;
    schedule_type?: string | null;
    start_date?: string | null;
    location_id?: string | null;
};

function buildSupabaseForRuntimePreflight(input: {
    children: ChildRow[];
    existingMetadata?: Record<string, unknown>;
}) {
    const enrollmentDate = todayEnrollmentDateIso(new Date("2026-05-31T12:00:00.000Z"));
    const updatedRow = {
        id: "opp-1",
        status_key: "enrolled",
        metadata: mergeEnrollmentDateMetadata(input.existingMetadata ?? {}, enrollmentDate),
    };

    const oppUpdateSingle = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const oppUpdateFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({ single: oppUpdateSingle }),
            }),
        }),
    });

    const members = input.children.map((c) => ({
        id: c.customer_member_id,
        person_id: c.person_id ?? "person-child",
        first_name: c.first_name ?? "Kid",
        last_name: c.last_name ?? "One",
    }));

    return {
        from: vi.fn((table: string) => {
            if (table === "action_definitions") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                or: vi.fn().mockResolvedValue({ data: [approveDef()], error: null }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "opportunities") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: {
                                        id: "opp-1",
                                        org_id: "org-1",
                                        status_key: "enrolling",
                                        customer_id: "cust-1",
                                        primary_person_id: "parent-1",
                                        location_id: "loc-1",
                                        program_type: "infant",
                                        metadata: input.existingMetadata ?? {},
                                        work_unit_id: "wu-1",
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                    update: oppUpdateFn,
                };
            }
            if (table === "opportunity_customer_members") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({
                                data: input.children.map((c) => ({
                                    id: c.id,
                                    customer_member_id: c.customer_member_id,
                                    location_id: c.location_id ?? "loc-1",
                                    program_category_id: c.program_category_id ?? "cat-infant",
                                    program_room_cohort_key: c.program_room_cohort_key ?? null,
                                    schedule_type: c.schedule_type ?? null,
                                    start_date: c.start_date ?? null,
                                    outcome_status_key: null,
                                })),
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === "customer_members") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            in: vi.fn().mockResolvedValue({ data: members, error: null }),
                        }),
                    }),
                };
            }
            if (table === "work_units") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: { department_id: "dept-1" },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "departments") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: { metadata: {} },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "persons") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({
                                    data: {
                                        id: "parent-1",
                                        first_name: "Pat",
                                        last_name: "Parent",
                                        email: "pat@example.com",
                                        phone: "555-0100",
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            return { select: vi.fn() };
        }),
        updatedRow,
        oppUpdateFn,
    };
}

describe("approve_enrollment runtime preflight (real evaluator)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("blocks with structured violations when classroom and schedule are missing", async () => {
        const supabase = buildSupabaseForRuntimePreflight({
            children: [
                {
                    id: "ocm-1",
                    customer_member_id: "cm-1",
                    person_id: "person-1",
                    program_room_cohort_key: "",
                    schedule_type: "",
                    start_date: "2026-06-15",
                },
            ],
        });

        const result = await executeAdminAction(
            supabase as never,
            { orgId: "org-1", userId: "user-1" },
            {
                actionKey: APPROVE_ENROLLMENT_ACTION_KEY,
                entityType: "opportunity",
                entityId: "opp-1",
            }
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;

        expect(result.action_preflight?.action_key).toBe(APPROVE_ENROLLMENT_ACTION_KEY);
        expect(result.action_preflight?.blocking.length).toBeGreaterThanOrEqual(2);
        const classroom = result.completion_requirements?.blocking.find(
            (v) => v.field_key === "program_room_cohort_key"
        );
        expect(classroom?.label).toBe("Child · Classroom or Room");
        expect(classroom?.missing_reason).toContain("Classroom");

        const schedule = result.completion_requirements?.blocking.find(
            (v) => v.field_key === "schedule_type"
        );
        expect(schedule?.label).toBe("Child · Desired Schedule");
        expect(schedule?.missing_reason).toContain("Schedule");

        expect(emitStatusChangedEvent).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();
        expect(supabase.oppUpdateFn).not.toHaveBeenCalled();
    });

    it("blocks when no child is on the opportunity", async () => {
        const supabase = buildSupabaseForRuntimePreflight({ children: [] });
        const result = await executeAdminAction(
            supabase as never,
            { orgId: "org-1" },
            {
                actionKey: APPROVE_ENROLLMENT_ACTION_KEY,
                entityType: "opportunity",
                entityId: "opp-1",
            }
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(
            result.completion_requirements?.blocking.some((v) => v.field_key === "inquiry_children")
        ).toBe(true);
        expect(result.completion_requirements?.blocking.some((v) => v.label === "At least one child")).toBe(true);
        expect(emitStatusChangedEvent).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();
        expect(supabase.oppUpdateFn).not.toHaveBeenCalled();
    });

    it("blocks when start date is missing", async () => {
        const supabase = buildSupabaseForRuntimePreflight({
            children: [
                {
                    id: "ocm-1",
                    customer_member_id: "cm-1",
                    person_id: "person-1",
                    program_room_cohort_key: "room-a",
                    schedule_type: "full_day",
                    start_date: "",
                },
            ],
        });
        const result = await executeAdminAction(
            supabase as never,
            { orgId: "org-1" },
            {
                actionKey: APPROVE_ENROLLMENT_ACTION_KEY,
                entityType: "opportunity",
                entityId: "opp-1",
            }
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        const start = result.completion_requirements?.blocking.find((v) => v.field_key === "start_date");
        expect(start?.label).toBe("Child · Desired Start Date");
        expect(start?.missing_reason).toContain("Desired Start Date");
        expect(emitEvent).not.toHaveBeenCalled();
    });

    it("executes and emits events when required fields are present", async () => {
        const supabase = buildSupabaseForRuntimePreflight({
            children: [
                {
                    id: "ocm-1",
                    customer_member_id: "cm-1",
                    person_id: "person-1",
                    program_room_cohort_key: "room-a",
                    schedule_type: "full_day",
                    start_date: "2026-06-15",
                },
            ],
        });

        const result = await executeAdminAction(
            supabase as never,
            { orgId: "org-1", userId: "user-1" },
            {
                actionKey: APPROVE_ENROLLMENT_ACTION_KEY,
                entityType: "opportunity",
                entityId: "opp-1",
            }
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(emitStatusChangedEvent).toHaveBeenCalled();
        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: "action_executed" })
        );
        const row = result.execution_result.row as { metadata?: Record<string, unknown> };
        expect(row.metadata?.enrollment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(supabase.oppUpdateFn).toHaveBeenCalled();
    });
});
