import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import { APPROVE_ENROLLMENT_ACTION_KEY } from "@/lib/admin/actions/enrollmentApprovalConstants";
import {
    mergeEnrollmentDateMetadata,
    todayEnrollmentDateIso,
} from "@/lib/admin/actions/executeApproveEnrollmentAction";

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

const mockHandoff = vi.fn();
vi.mock("@/lib/childcareOperational/enrollmentAgreementHandoff", () => ({
    executeOperationalEnrollmentHandoffFromApprovedOpportunity: (...args: unknown[]) => mockHandoff(...args),
}));

const mockFlagEnabled = vi.fn();
const mockResolveToday = vi.fn();
vi.mock("@/lib/childcareOperational/featureFlag", () => ({
    isChildcareOperationalEnrollmentV1EnabledForOrg: (...args: unknown[]) => mockFlagEnabled(...args),
    CHILDCARE_OPERATIONAL_ENROLLMENT_V1_FLAG: "childcare_operational_enrollment_v1",
}));

vi.mock("@/lib/childcareOperational/operationalEnrollmentApi", async (importOriginal) => {
    const actual = await importOriginal<
        typeof import("@/lib/childcareOperational/operationalEnrollmentApi")
    >();
    return {
        ...actual,
        resolveOperationalEnrollmentTodayYmd: (...args: unknown[]) => mockResolveToday(...args),
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

function supabaseForApprove(options: { completionOk?: boolean }) {
    const completionOk = options.completionOk ?? true;
    evaluateOpportunityActionPreflight.mockResolvedValue(
        completionOk
            ? { ok: true, blocking: [], recommended: [], warnings: [], requirements: [] }
            : {
                  ok: false,
                  blocking: [{ field_key: "desired_schedule_type", message: "Required" }],
                  recommended: [],
                  warnings: [],
                  requirements: [],
              }
    );

    const updatedRow = {
        id: "opp-1",
        org_id: "org-1",
        status_key: "enrolled",
        metadata: mergeEnrollmentDateMetadata({}, todayEnrollmentDateIso()),
    };

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
                                        status_key: "waitlisted",
                                        customer_id: "cust-1",
                                        metadata: {},
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                    update: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                select: vi.fn().mockReturnValue({
                                    single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "org_settings") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null }),
                        }),
                    }),
                };
            }
            return { select: vi.fn() };
        }),
        updatedRow,
    };
}

describe("approve_enrollment operational handoff hook", () => {
    const envBackup = process.env.CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED = "1";
        stampChildEnrollmentDatesIfBlank.mockResolvedValue(undefined);
        mockResolveToday.mockResolvedValue("2026-06-15");
        mockHandoff.mockResolvedValue({
            ok: true,
            partial: false,
            opportunity_id: "opp-1",
            children: [],
        });
    });

    afterEach(() => {
        process.env.CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED = envBackup;
    });

    it("calls handoff when feature flag enabled", async () => {
        mockFlagEnabled.mockResolvedValue(true);
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
        expect(mockHandoff).toHaveBeenCalledWith(
            expect.objectContaining({
                orgId: "org-1",
                opportunityId: "opp-1",
                todayYmd: "2026-06-15",
            })
        );
    });

    it("does not call handoff when feature flag disabled", async () => {
        mockFlagEnabled.mockResolvedValue(false);
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
        expect(mockHandoff).not.toHaveBeenCalled();
    });

    it("does not call handoff when preflight fails", async () => {
        mockFlagEnabled.mockResolvedValue(true);
        const supabase = supabaseForApprove({ completionOk: false });
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
        expect(mockHandoff).not.toHaveBeenCalled();
    });

    it("blocks approve when handoff agreement creation fails", async () => {
        mockFlagEnabled.mockResolvedValue(true);
        mockHandoff.mockResolvedValue({
            ok: false,
            error: "Agreement creation failed",
            partial: false,
            opportunity_id: "opp-1",
            children: [],
        });
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

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.status).toBe(500);
        expect(result.error).toContain("Agreement creation failed");
    });

    it("succeeds approve when handoff is partial (schedule missing for one child)", async () => {
        mockFlagEnabled.mockResolvedValue(true);
        mockHandoff.mockResolvedValue({
            ok: true,
            partial: true,
            opportunity_id: "opp-1",
            children: [
                {
                    agreement: { outcome: "created" },
                    placement: { outcome: "created" },
                    schedule_assignment: { outcome: "warning", warning: "no_schedule_pattern_for:part_time" },
                },
            ],
        });
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
        expect(result.execution_result.operational_enrollment_handoff).toMatchObject({
            ok: true,
            partial: true,
        });
    });
});
