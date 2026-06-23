import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    ENROLLMENT_DEFAULT_TRACKS,
    buildEnrollmentTemplateStageRecords,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import {
    findBpDestinationOption,
    resolveBpEnrollmentStatusDestinations,
    tourBypassRequiredForDestination,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBpResolver";
import { defaultEnrollmentStatusDestinations } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionDestinations";
import { evaluateEnrollmentStatusTransitionPreflight } from "@/lib/admin/enrollmentStatus/evaluateEnrollmentStatusTransitionPreflight";
import { executeEnrollmentStatusTransition } from "@/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";
import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";

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

describe("resolveBpEnrollmentStatusDestinations", () => {
    const metadata = enrollmentDepartmentMetadata();

    it("returns only BP-allowed destinations from decision stage operating plan", () => {
        const result = resolveBpEnrollmentStatusDestinations({
            departmentMetadata: metadata,
            currentStatusKey: "decision_pending",
            grain: "child",
        });

        expect(result.destinationSource).toBe("bp");
        expect(result.currentBuilderStageKey).toBe("decision");

        const keys = result.destinations.map((d) => d.destinationKey);
        expect(keys).toContain("waitlist");
        expect(keys).toContain("enrollment");
        expect(keys).toContain("closed_withdrawn");
        expect(keys).not.toContain("lead");
        expect(keys).not.toContain("qualification");
        expect(keys).not.toContain("tour");
    });

    it("includes parking-lot waitlist from qualification when process has waitlist stage", () => {
        const result = resolveBpEnrollmentStatusDestinations({
            departmentMetadata: metadata,
            currentStatusKey: "qualified",
            grain: "child",
            builderStageKey: "qualification",
        });

        const waitlist = result.destinations.find((d) => d.destinationKey === "waitlist");
        expect(waitlist).toBeDefined();
        expect(waitlist?.parkingLot).toBe(true);
        expect(waitlist?.bpSource).toBe("parking_lot");
        expect(waitlist?.requiresTourBypass).toBe(true);
    });

    it("includes waitlist from decision split rule when on decision stage", () => {
        const result = resolveBpEnrollmentStatusDestinations({
            departmentMetadata: metadata,
            currentStatusKey: "decision_pending",
            grain: "child",
            builderStageKey: "decision",
        });

        const waitlist = result.destinations.filter((d) => d.destinationKey === "waitlist");
        expect(waitlist.length).toBeGreaterThanOrEqual(1);
        expect(waitlist.some((d) => d.bpSource === "stage_outcome" || d.bpSource === "split_rule")).toBe(true);
    });

    it("falls back to default destinations when BP config is missing", () => {
        const result = resolveBpEnrollmentStatusDestinations({
            departmentMetadata: {},
            currentStatusKey: "qualified",
            grain: "child",
        });

        expect(result.destinationSource).toBe("default_fallback");
        const defaults = defaultEnrollmentStatusDestinations({
            grain: "child",
            currentOperatorStage: "qualification",
            currentStatusKey: "qualified",
        });
        expect(result.destinations.map((d) => d.destinationKey).sort()).toEqual(
            defaults.map((d) => d.destinationKey).sort(),
        );
    });
});

describe("tourBypassRequiredForDestination", () => {
    it("requires bypass reason for parking-lot waitlist from pre-tour stage", () => {
        const dest = findBpDestinationOption(
            resolveBpEnrollmentStatusDestinations({
                departmentMetadata: enrollmentDepartmentMetadata(),
                currentStatusKey: "qualified",
                grain: "child",
                builderStageKey: "qualification",
            }).destinations,
            "waitlist",
        );

        expect(
            tourBypassRequiredForDestination(dest, {
                destinationKey: "waitlist",
                currentCaseStatusKey: "open",
                currentChildStatusKey: "qualified",
            }),
        ).toBe(true);
    });

    it("does not require bypass after tour completion", () => {
        expect(
            tourBypassRequiredForDestination(null, {
                destinationKey: "waitlist",
                currentCaseStatusKey: "tour_completed",
                currentChildStatusKey: "decision_pending",
            }),
        ).toBe(false);
    });
});

vi.mock("@/lib/completion/loadRecordForEffectiveRequirements", () => ({
    loadOpportunityRecordForEffectiveRequirements: vi.fn(),
    buildOpportunityCompletionContextFromDb: vi.fn(),
}));

vi.mock("@/lib/completion/lifecycleActionRequirementCatalog", () => ({
    evaluateLifecycleActionRequirements: vi.fn(),
}));

vi.mock("@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus", () => ({
    updateOpportunityCustomerMemberLifecycleStatus: vi.fn(),
}));

vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: vi.fn(),
}));

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
    loadOpportunityRecordForEffectiveRequirements,
    buildOpportunityCompletionContextFromDb,
} from "@/lib/completion/loadRecordForEffectiveRequirements";
import { evaluateLifecycleActionRequirements } from "@/lib/completion/lifecycleActionRequirementCatalog";

function createPreflightSupabase(metadata: Record<string, unknown>, ocmStatus: string) {
    return {
        from: (table: string) => ({
            select: () => ({
                eq: (_col: string, _val: string) => ({
                    eq: (_col2: string, _val2: string) => ({
                        eq: (_col3: string, _val3: string) => ({
                            maybeSingle: async () => {
                                if (table === "opportunity_customer_members") {
                                    return { data: { outcome_status_key: ocmStatus } };
                                }
                                return { data: null };
                            },
                        }),
                        maybeSingle: async () => {
                            if (table === "departments") {
                                return { data: { metadata } };
                            }
                            if (table === "opportunity_customer_members") {
                                return { data: { outcome_status_key: ocmStatus } };
                            }
                            return { data: null };
                        },
                    }),
                }),
            }),
        }),
    } as never;
}

describe("evaluateEnrollmentStatusTransitionPreflight BP enforcement", () => {
    beforeEach(() => {
        vi.mocked(loadOpportunityRecordForEffectiveRequirements).mockResolvedValue({
            id: "opp-1",
            status_key: "open",
            department_id: "dept-1",
        } as never);

        vi.mocked(buildOpportunityCompletionContextFromDb).mockResolvedValue({
            related: {
                inquiry_children: [{ id: "ocm-1", outcome_status_key: "decision_pending" }],
            },
        } as never);

        vi.mocked(evaluateLifecycleActionRequirements).mockReturnValue({
            ok: true,
            blocking: [],
            warnings: [],
            recommendations: [],
        });
    });

    it("blocks destinations not allowed by BP config", async () => {
        const result = await evaluateEnrollmentStatusTransitionPreflight({
            supabase: createPreflightSupabase(enrollmentDepartmentMetadata(), "decision_pending"),
            orgId: "org-1",
            scope: {
                grain: "child",
                opportunityId: "opp-1",
                opportunityCustomerMemberId: "ocm-1",
            },
            destinationKey: "lead",
            departmentId: "dept-1",
        });

        expect(result.destinationSource).toBe("bp");
        expect(result.ok).toBe(false);
        expect(result.validation.blocking.some((v) => v.field_key === "destination_key")).toBe(true);
    });

    it("flags missing bypass reason when tour bypass is required", async () => {
        const result = await evaluateEnrollmentStatusTransitionPreflight({
            supabase: createPreflightSupabase(enrollmentDepartmentMetadata(), "qualified"),
            orgId: "org-1",
            scope: {
                grain: "child",
                opportunityId: "opp-1",
                opportunityCustomerMemberId: "ocm-1",
            },
            destinationKey: "waitlist",
            builderStageKey: "qualification",
            departmentId: "dept-1",
        });

        expect(result.requiresBypassReason).toBe(true);
        expect(result.ok).toBe(false);
        expect(result.validation.blocking.some((v) => v.field_key === "bypass_reason")).toBe(true);
    });
});

describe("executeEnrollmentStatusTransition scope isolation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(loadOpportunityRecordForEffectiveRequirements).mockResolvedValue({
            id: "opp-1",
            status_key: "decision_pending",
            department_id: "dept-1",
        } as never);

        vi.mocked(buildOpportunityCompletionContextFromDb).mockResolvedValue({
            related: {
                inquiry_children: [{ id: "ocm-1", outcome_status_key: "decision_pending" }],
            },
        } as never);

        vi.mocked(evaluateLifecycleActionRequirements).mockReturnValue({
            ok: true,
            blocking: [],
            warnings: [],
            recommendations: [],
        });

        vi.mocked(updateOpportunityCustomerMemberLifecycleStatus).mockResolvedValue({
            error: null,
            before: { outcome_status_key: "decision_pending" },
            after: {
                id: "ocm-1",
                org_id: "org-1",
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                outcome_status_key: "waitlisted",
            },
            eventEmitted: true,
        });

        vi.mocked(updateOpportunityStatusWithEvent).mockResolvedValue({ error: null } as never);
    });

    it("updates scoped OCM without case fallback when child scope exists", async () => {
        const result = await executeEnrollmentStatusTransition({
            supabase: createPreflightSupabase(enrollmentDepartmentMetadata(), "decision_pending"),
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
            },
        });

        expect(result.ok).toBe(true);
        expect(updateOpportunityCustomerMemberLifecycleStatus).toHaveBeenCalledWith(
            expect.objectContaining({
                opportunityCustomerMemberId: "ocm-1",
                nextStatusKey: "waitlisted",
            }),
        );
        expect(updateOpportunityStatusWithEvent).not.toHaveBeenCalled();
    });

    it("falls back to opportunity status when no child scope exists", async () => {
        vi.mocked(loadOpportunityRecordForEffectiveRequirements).mockResolvedValue({
            id: "opp-1",
            status_key: "open",
            department_id: null,
        } as never);

        vi.mocked(buildOpportunityCompletionContextFromDb).mockResolvedValue({
            related: { inquiry_children: [] },
        } as never);

        const supabase = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: null }),
                        }),
                    }),
                }),
            }),
        } as never;

        const result = await executeEnrollmentStatusTransition({
            supabase,
            orgId: "org-1",
            request: {
                actionKey: "update_enrollment_status",
                scope: {
                    grain: "case",
                    opportunityId: "opp-1",
                },
                destinationKey: "qualification",
                targetStatusKey: "qualification",
                confirmationRequired: true,
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.grain).toBe("case");
        expect(updateOpportunityStatusWithEvent).toHaveBeenCalled();
        expect(updateOpportunityCustomerMemberLifecycleStatus).not.toHaveBeenCalled();
    });
});
