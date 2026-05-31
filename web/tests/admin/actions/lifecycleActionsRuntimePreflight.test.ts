/**
 * Runtime preflight for move_to_waitlist and record_tour_outcome (real evaluator).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import { OPPORTUNITY_WAITLIST_DATE_METADATA_KEY } from "@/lib/admin/actions/lifecycleActionMetadataKeys";
import {
    executeRecordTourOutcomeAction,
} from "@/lib/admin/actions/executeTourBookingActions";

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

vi.mock("@/lib/admin/actions/executeTourBookingActions", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/actions/executeTourBookingActions")>();
    return {
        ...actual,
        executeRecordTourOutcomeAction: vi.fn(),
    };
});

type ChildRow = {
    id: string;
    customer_member_id: string;
    person_id?: string | null;
    desired_program_type?: string | null;
    program_room_cohort_key?: string | null;
};

function waitlistDef() {
    return {
        id: "def-waitlist",
        key: "move_to_waitlist",
        action_type: "update_status",
        entity_type: "opportunity",
        payload_schema: { status_key: "waitlisted" },
        workflow_id: null,
        org_id: null,
        is_active: true,
    };
}

function recordTourOutcomeDef() {
    return {
        id: "def-tour-outcome",
        key: "record_tour_outcome",
        action_type: "update_status",
        entity_type: "opportunity",
        payload_schema: {},
        workflow_id: null,
        org_id: null,
        is_active: true,
    };
}

function buildSupabaseForLifecycle(input: {
    actionKey: string;
    children: ChildRow[];
    existingMetadata?: Record<string, unknown>;
}) {
    const today = "2026-05-31";
    const updatedRow = {
        id: "opp-1",
        status_key: input.actionKey === "move_to_waitlist" ? "waitlisted" : "tour_completed",
        metadata: {
            ...(input.existingMetadata ?? {}),
            ...(input.actionKey === "move_to_waitlist" ?
                { [OPPORTUNITY_WAITLIST_DATE_METADATA_KEY]: today }
            :   {}),
        },
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
        first_name: "Kid",
        last_name: "One",
    }));

    const actionDef = input.actionKey === "move_to_waitlist" ? waitlistDef() : recordTourOutcomeDef();

    return {
        from: vi.fn((table: string) => {
            if (table === "action_definitions") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                or: vi.fn().mockResolvedValue({ data: [actionDef], error: null }),
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
                                        status_key: "qualification",
                                        customer_id: "cust-1",
                                        primary_person_id: "parent-1",
                                        location_id: "loc-1",
                                        desired_program_type: "infant",
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
                                    location_id: "loc-1",
                                    desired_program_type: c.desired_program_type ?? null,
                                    program_room_cohort_key: c.program_room_cohort_key ?? null,
                                    desired_schedule_type: null,
                                    desired_start_date: null,
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
            return { select: vi.fn() };
        }),
        updatedRow,
        oppUpdateFn,
    };
}

describe("lifecycle actions runtime preflight", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(executeRecordTourOutcomeAction).mockResolvedValue({
            ok: true,
            booking_id: "booking-1",
            outcome: "completed",
        });
    });

    it("move_to_waitlist blocks when child/program missing", async () => {
        const supabase = buildSupabaseForLifecycle({
            actionKey: "move_to_waitlist",
            children: [
                {
                    id: "ocm-1",
                    customer_member_id: "cm-1",
                    person_id: "person-1",
                    desired_program_type: null,
                    program_room_cohort_key: null,
                },
            ],
        });

        const result = await executeAdminAction(
            supabase as never,
            { orgId: "org-1" },
            {
                actionKey: "move_to_waitlist",
                entityType: "opportunity",
                entityId: "opp-1",
            }
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.action_preflight?.action_key).toBe("move_to_waitlist");
        expect(result.completion_requirements?.blocking.some((v) => v.label === "Program")).toBe(true);
        expect(emitStatusChangedEvent).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();
        expect(supabase.oppUpdateFn).not.toHaveBeenCalled();
    });

    it("move_to_waitlist succeeds and stamps waitlist_date when required fields exist", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-05-31T12:00:00.000Z"));
        const supabase = buildSupabaseForLifecycle({
            actionKey: "move_to_waitlist",
            children: [
                {
                    id: "ocm-1",
                    customer_member_id: "cm-1",
                    person_id: "person-1",
                    desired_program_type: "infant",
                },
            ],
        });

        const result = await executeAdminAction(
            supabase as never,
            { orgId: "org-1", userId: "user-1" },
            {
                actionKey: "move_to_waitlist",
                entityType: "opportunity",
                entityId: "opp-1",
            }
        );

        vi.useRealTimers();
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(emitStatusChangedEvent).toHaveBeenCalled();
        expect(supabase.oppUpdateFn).toHaveBeenCalled();
        const row = result.execution_result.row as { metadata?: Record<string, unknown> };
        expect(row.metadata?.[OPPORTUNITY_WAITLIST_DATE_METADATA_KEY]).toBe("2026-05-31");
    });

    it("record_tour_outcome blocks without outcome in payload", async () => {
        const supabase = buildSupabaseForLifecycle({
            actionKey: "record_tour_outcome",
            children: [{ id: "ocm-1", customer_member_id: "cm-1", person_id: "person-1" }],
        });

        const result = await executeAdminAction(
            supabase as never,
            { orgId: "org-1" },
            {
                actionKey: "record_tour_outcome",
                entityType: "opportunity",
                entityId: "opp-1",
                payload: {},
            }
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.action_preflight?.action_key).toBe("record_tour_outcome");
        const outcomeBlock = result.completion_requirements?.blocking.find((v) => v.field_key === "outcome");
        expect(outcomeBlock?.label).toBe("Tour outcome");
        expect(executeRecordTourOutcomeAction).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();
    });

    it("record_tour_outcome executes when outcome is provided", async () => {
        const supabase = buildSupabaseForLifecycle({
            actionKey: "record_tour_outcome",
            children: [{ id: "ocm-1", customer_member_id: "cm-1", person_id: "person-1" }],
        });

        const result = await executeAdminAction(
            supabase as never,
            { orgId: "org-1", userId: "user-1" },
            {
                actionKey: "record_tour_outcome",
                entityType: "opportunity",
                entityId: "opp-1",
                payload: { outcome: "completed" },
            }
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(executeRecordTourOutcomeAction).toHaveBeenCalled();
        expect(emitEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: "action_executed" })
        );
    });
});
