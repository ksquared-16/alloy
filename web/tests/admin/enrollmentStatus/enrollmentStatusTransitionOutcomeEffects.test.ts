import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    ENROLLMENT_DEFAULT_TRACKS,
    buildEnrollmentTemplateStageRecords,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS } from "@/lib/lifecycle/executeStageOperatingOutcome";
import { applyEnrollmentStatusTransitionOutcomeEffects } from "@/lib/admin/enrollmentStatus/applyEnrollmentStatusTransitionOutcomeEffects";
import { executeEnrollmentStatusTransition } from "@/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition";

const mockExecuteStageOperatingOutcome = vi.fn();
const mockOnChildDispositionEntrySpawnWorkIntent = vi.fn();
const mockInstantiateStageWorkFromTemplate = vi.fn();
const mockEmitEvent = vi.fn();

vi.mock("@/lib/lifecycle/executeStageOperatingOutcome", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/lifecycle/executeStageOperatingOutcome")>();
    return {
        ...actual,
        executeStageOperatingOutcome: (...args: unknown[]) => mockExecuteStageOperatingOutcome(...args),
    };
});

vi.mock("@/lib/lifecycle/onChildDispositionEntrySpawnWorkIntent", () => ({
    onChildDispositionEntrySpawnWorkIntent: (...args: unknown[]) =>
        mockOnChildDispositionEntrySpawnWorkIntent(...args),
}));

vi.mock("@/lib/lifecycle/instantiateStageWorkFromTemplate", () => ({
    instantiateStageWorkFromTemplate: (...args: unknown[]) => mockInstantiateStageWorkFromTemplate(...args),
}));

vi.mock("@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus", () => ({
    updateOpportunityCustomerMemberLifecycleStatus: vi.fn(),
}));

vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: vi.fn(),
}));

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => mockEmitEvent(...args),
}));

vi.mock("@/lib/admin/enrollmentStatus/evaluateEnrollmentStatusTransitionPreflight", () => ({
    evaluateEnrollmentStatusTransitionPreflight: vi.fn().mockResolvedValue({
        ok: true,
        targetStatusKey: "waitlisted",
        validation: { ok: true, blocking: [], warnings: [], recommendations: [] },
        requiresBypassReason: false,
        destinationSource: "bp",
    }),
}));

import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";
import { evaluateEnrollmentStatusTransitionPreflight } from "@/lib/admin/enrollmentStatus/evaluateEnrollmentStatusTransitionPreflight";

function enrollmentDepartmentMetadata(): Record<string, unknown> {
    const process: LifecycleBuilderProcessRecord = {
        id: "proc-1",
        key: "enrollment",
        name: "Enrollment",
        primary_entity: "opportunity",
        is_active: true,
        sort_order: 0,
        tracks_v1: ENROLLMENT_DEFAULT_TRACKS,
        stages: buildEnrollmentTemplateStageRecords(),
    };
    return {
        lifecycle_builder_v1: {
            version: 1 as const,
            active_process_id: "proc-1",
            processes: [process],
        },
    };
}

function departmentSupabase(metadata: Record<string, unknown>) {
    return {
        from: (table: string) => ({
            select: () => ({
                eq: (_col: string, _val: string) => ({
                    eq: (_col2: string, _val2: string) => ({
                        eq: (_col3: string, _val3: string) => ({
                            maybeSingle: async () => {
                                if (table === "opportunity_customer_members") {
                                    return { data: { outcome_status_key: "decision_pending" } };
                                }
                                return { data: null };
                            },
                        }),
                        maybeSingle: async () => {
                            if (table === "departments") return { data: { metadata } };
                            if (table === "opportunities") {
                                return { data: { department_id: "dept-1" } };
                            }
                            return { data: null };
                        },
                    }),
                }),
            }),
        }),
    } as never;
}

describe("applyEnrollmentStatusTransitionOutcomeEffects", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [{ kind: "create_next_work", template_key: "follow_up_waitlist" }],
            errors: [],
            queue_refresh_opportunity_id: "opp-1",
            needs_attention_set: false,
            status_updated: false,
        });
        mockOnChildDispositionEntrySpawnWorkIntent.mockResolvedValue({
            action: "spawned",
            work_id: "work-waitlist-entry",
        });
    });

    it("runs executeStageOperatingOutcome with skip flags for manual waitlist transition", async () => {
        mockExecuteStageOperatingOutcome.mockImplementationOnce(async (params) => {
            expect(params.skipTargetKinds).toEqual(STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS);
            expect(params.outcomeKey).toBe("waitlist");
            return {
                applied_targets: [{ kind: "create_next_work", template_key: "follow_up_waitlist" }],
                errors: [],
                queue_refresh_opportunity_id: "opp-1",
                needs_attention_set: false,
                status_updated: false,
            };
        });

        const result = await applyEnrollmentStatusTransitionOutcomeEffects({
            supabase: departmentSupabase(enrollmentDepartmentMetadata()),
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            scope: {
                grain: "child",
                opportunityId: "opp-1",
                opportunityCustomerMemberId: "ocm-1",
            },
            destinationKey: "waitlist",
            targetStatusKey: "waitlisted",
            previousStatusKey: "decision_pending",
            sourceBuilderStageKey: "decision",
        });

        expect(result.outcome_key).toBe("waitlist");
        expect(mockExecuteStageOperatingOutcome).toHaveBeenCalled();
        expect(mockOnChildDispositionEntrySpawnWorkIntent).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunityId: "opp-1",
                previousStatusKey: "decision_pending",
                nextStatusKey: "waitlisted",
            }),
        );
    });

    it("spawns destination-stage primary work when moving to enrolling", async () => {
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [],
            errors: [],
            queue_refresh_opportunity_id: "opp-1",
            needs_attention_set: false,
            status_updated: false,
        });
        mockOnChildDispositionEntrySpawnWorkIntent.mockResolvedValue({
            action: "spawned",
            work_id: "work-enrolling-entry",
        });

        await applyEnrollmentStatusTransitionOutcomeEffects({
            supabase: departmentSupabase(enrollmentDepartmentMetadata()),
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            scope: {
                grain: "child",
                opportunityId: "opp-1",
                opportunityCustomerMemberId: "ocm-1",
            },
            destinationKey: "enrollment",
            targetStatusKey: "enrolling",
            previousStatusKey: "decision_pending",
            sourceBuilderStageKey: "decision",
            outcomeKey: "enrolling",
        });

        expect(mockOnChildDispositionEntrySpawnWorkIntent).toHaveBeenCalledWith(
            expect.objectContaining({
                nextStatusKey: "enrolling",
            }),
        );
    });
});

describe("executeEnrollmentStatusTransition outcome wiring", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteStageOperatingOutcome.mockResolvedValue({
            applied_targets: [],
            errors: [],
            queue_refresh_opportunity_id: "opp-1",
            needs_attention_set: false,
            status_updated: false,
        });
        mockOnChildDispositionEntrySpawnWorkIntent.mockResolvedValue({
            action: "skipped",
            reason: "no_primary_intent",
        });
        mockEmitEvent.mockResolvedValue("evt-1");
        vi.mocked(updateOpportunityCustomerMemberLifecycleStatus).mockResolvedValue({
            error: null,
            before: { outcome_status_key: "qualified" },
            after: {
                id: "ocm-1",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: "waitlisted",
            },
            eventEmitted: true,
        });
        vi.mocked(evaluateEnrollmentStatusTransitionPreflight).mockResolvedValue({
            ok: true,
            targetStatusKey: "waitlisted",
            validation: { ok: true, blocking: [], warnings: [], recommendations: [] },
            requiresBypassReason: true,
            destinationSource: "bp",
            skippedStageLabels: [],
        });
    });

    it("still emits tour bypass event after outcome side effects", async () => {
        const result = await executeEnrollmentStatusTransition({
            supabase: departmentSupabase(enrollmentDepartmentMetadata()),
            orgId: "org-1",
            userId: "user-1",
            departmentId: "dept-1",
            request: {
                actionKey: "update_enrollment_status",
                scope: {
                    grain: "child",
                    opportunityId: "opp-1",
                    opportunityCustomerMemberId: "ocm-1",
                },
                destinationKey: "waitlist",
                targetStatusKey: "waitlisted",
                confirmationRequired: true,
                bypassReason: "No space available",
            },
        });

        expect(result.ok).toBe(true);
        expect(mockEmitEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event_type: "enrollment_status_tour_bypassed",
            }),
        );
    });
});
