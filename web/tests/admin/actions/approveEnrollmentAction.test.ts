import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import { APPROVE_ENROLLMENT_ACTION_KEY } from "@/lib/admin/actions/enrollmentApprovalConstants";
import {
    mergeEnrollmentDateMetadata,
    todayEnrollmentDateIso,
} from "@/lib/admin/actions/executeApproveEnrollmentAction";
import { evaluateLifecycleActionRequirements } from "@/lib/completion/lifecycleActionRequirementCatalog";
import { buildCompletionContextFromRecord } from "@/lib/completion/evaluateCompletionRequirements";

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
    fetchEffectiveStatusDefinitions: vi.fn().mockResolvedValue([]),
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

const evaluateOpportunityActionPreflight = vi.fn();
vi.mock("@/lib/completion/evaluateEffectiveRequirements", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/completion/evaluateEffectiveRequirements")>();
    return {
        ...actual,
        evaluateOpportunityActionPreflight: (...args: unknown[]) => evaluateOpportunityActionPreflight(...args),
    };
});

const stampChildEnrollmentDatesIfBlank = vi.fn();
vi.mock("@/lib/admin/actions/executeApproveEnrollmentAction", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/actions/executeApproveEnrollmentAction")>();
    return {
        ...actual,
        stampChildEnrollmentDatesIfBlank: (...args: unknown[]) => stampChildEnrollmentDatesIfBlank(...args),
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

function completeChild() {
    return {
        id: "ocm-1",
        person_id: "person-1",
        first_name: "Kid",
        last_name: "One",
        location_id: "loc-1",
        desired_program_type: "infant",
        program_room_cohort_key: "room-a",
        desired_schedule_type: "full_day",
        desired_start_date: "2026-06-15",
    };
}

function supabaseForApprove(options: {
    existingMetadata?: Record<string, unknown>;
    completionOk?: boolean;
    blockingField?: string;
}) {
    const completionOk = options.completionOk ?? true;
    evaluateOpportunityActionPreflight.mockResolvedValue(
        completionOk
            ? {
                  ok: true,
                  blocking: [],
                  recommended: [],
                  autoPopulate: [{ entity_type: "opportunity", field_key: "enrollment_date", metadata_key: "enrollment_date", value: "2026-05-31" }],
                  sourceSummary: { layoutRules: 0, actionRules: 0, transitionRules: 0, completionRules: 0 },
              }
            : {
                  ok: false,
                  blocking: [
                      {
                          field_key: options.blockingField ?? "program_room_cohort_key",
                          label:
                              options.blockingField === "desired_schedule_type"
                                  ? "Schedule"
                                  : options.blockingField === "desired_start_date"
                                    ? "Start date"
                                    : "Classroom",
                          severity: "required",
                          reason:
                              options.blockingField === "desired_schedule_type"
                                  ? "Schedule is required before enrollment approval."
                                  : options.blockingField === "desired_start_date"
                                    ? "Start date is required before enrollment approval."
                                    : "Classroom or placement target is required before enrollment approval.",
                          source: "action",
                      },
                  ],
                  recommended: [],
                  autoPopulate: [],
                  sourceSummary: { layoutRules: 0, actionRules: 1, transitionRules: 0, completionRules: 0 },
              }
    );

    const actionSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                or: vi.fn().mockResolvedValue({ data: [approveDef()], error: null }),
            }),
        }),
    });

    const oppSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                        status_key: "enrolling",
                        customer_id: "cust-1",
                        primary_person_id: "parent-1",
                        metadata: options.existingMetadata ?? {},
                        work_unit_id: "wu-1",
                    },
                    error: null,
                }),
            }),
        }),
    });

    const enrollmentDate = todayEnrollmentDateIso(new Date("2026-05-31T12:00:00.000Z"));
    const updatedRow = {
        id: "opp-1",
        status_key: "enrolled",
        metadata: mergeEnrollmentDateMetadata(options.existingMetadata ?? {}, enrollmentDate),
    };

    const oppUpdateSingle = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const oppUpdateSelect = vi.fn().mockReturnValue({ single: oppUpdateSingle });
    const oppUpdateEqOrg = vi.fn().mockReturnValue({ select: oppUpdateSelect });
    const oppUpdateEqId = vi.fn().mockReturnValue({ eq: oppUpdateEqOrg });
    const oppUpdate = vi.fn().mockReturnValue({ eq: oppUpdateEqId });

    return {
        from: vi.fn((table: string) => {
            if (table === "action_definitions") return { select: actionSelect };
            if (table === "opportunities") {
                return {
                    select: oppSelect,
                    update: oppUpdate,
                };
            }
            if (table === "work_units") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({ data: { department_id: "dept-1" }, error: null }),
                            }),
                        }),
                    }),
                };
            }
            return { select: vi.fn() };
        }),
        updatedRow,
    };
}

describe("approve_enrollment action", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        stampChildEnrollmentDatesIfBlank.mockResolvedValue(undefined);
    });

    it("blocks when required placement fields are missing", async () => {
        const supabase = supabaseForApprove({ completionOk: false, blockingField: "desired_schedule_type" });
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
        expect(result.status).toBe(400);
        expect(result.completion_requirements?.blocking.some((v) => v.field_key === "desired_schedule_type")).toBe(
            true
        );
        expect(result.action_preflight?.title).toContain("Approve enrollment");
        expect(emitStatusChangedEvent).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();
    });

    it("succeeds when required fields are present and sets enrolled status", async () => {
        const supabase = supabaseForApprove({});
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
        expect(result.execution_result.kind).toBe(APPROVE_ENROLLMENT_ACTION_KEY);
        expect((result.execution_result.row as { status_key?: string }).status_key).toBe("enrolled");
        expect(emitStatusChangedEvent).toHaveBeenCalled();
        expect(stampChildEnrollmentDatesIfBlank).toHaveBeenCalled();
    });

    it("sets enrollment_date metadata on approval when blank", async () => {
        const supabase = supabaseForApprove({});
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
        const row = result.execution_result.row as { metadata?: Record<string, unknown> };
        expect(row.metadata?.enrollment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("preserves existing enrollment_date metadata", () => {
        const merged = mergeEnrollmentDateMetadata({ enrollment_date: "2026-01-10" }, "2026-05-31");
        expect(merged.enrollment_date).toBe("2026-01-10");
    });

    it("reserve_spot remains inactive — execute cannot resolve definition", async () => {
        const actionSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    or: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
            }),
        });
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "action_definitions") return { select: actionSelect };
                return { select: vi.fn() };
            }),
        };
        const result = await executeAdminAction(
            supabase as never,
            { orgId: "org-1" },
            { actionKey: "reserve_spot", entityType: "opportunity", entityId: "opp-1" }
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/Unknown or inactive action/i);
    });
});

describe("approve_enrollment action rules", () => {
    it("requires classroom, schedule, and child identity for approve_enrollment", () => {
        const blockedCtx = buildCompletionContextFromRecord({
            entity_type: "opportunity",
            entity_id: "opp-1",
            phase: "action",
            record: {
                primary_person_id: "p1",
                _inquiry_children: [
                    {
                        id: "c1",
                        person_id: "child-1",
                        desired_program_type: "infant",
                        desired_start_date: "2026-06-01",
                        program_room_cohort_key: "",
                        desired_schedule_type: "",
                    },
                ],
            },
            action_key: APPROVE_ENROLLMENT_ACTION_KEY,
        });
        const blocked = evaluateLifecycleActionRequirements(blockedCtx);
        expect(blocked.blocking.some((v) => v.field_key === "program_room_cohort_key")).toBe(true);
        expect(blocked.blocking.some((v) => v.field_key === "desired_schedule_type")).toBe(true);

        const okCtx = buildCompletionContextFromRecord({
            entity_type: "opportunity",
            entity_id: "opp-1",
            phase: "action",
            record: { primary_person_id: "p1", _inquiry_children: [completeChild()] },
            action_key: APPROVE_ENROLLMENT_ACTION_KEY,
        });
        const ok = evaluateLifecycleActionRequirements(okCtx);
        expect(ok.blocking.some((v) => v.field_key === "program_room_cohort_key")).toBe(false);
        expect(ok.blocking.some((v) => v.field_key === "desired_schedule_type")).toBe(false);
    });
});

describe("drawer refresh contract", () => {
    it("applyRegistryResolvedActionClient invalidates after approve_enrollment execute", () => {
        const src = readFileSync(
            resolve(__dirname, "../../../lib/admin/actions/applyRegistryResolvedActionClient.ts"),
            "utf8"
        );
        expect(src).toContain("host.invalidate");
        expect(src).toContain("action_key: a.key");
    });
});
