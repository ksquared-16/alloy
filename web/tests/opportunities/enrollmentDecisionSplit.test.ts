import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveDecisionSplitOutcomeStatusKey } from "@/lib/businessProcesses/resolveDecisionSplitOutcomeStatusKey";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    ENROLLMENT_DEFAULT_TRACKS,
    buildEnrollmentTemplateStageRecords,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";

const updateLifecycleStatus = vi.fn();

vi.mock("@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus", () => ({
    updateOpportunityCustomerMemberLifecycleStatus: (...args: unknown[]) => updateLifecycleStatus(...args),
}));

import { applyEnrollmentDecisionSplit } from "@/lib/opportunities/applyEnrollmentDecisionSplit";

const processWithTemplateStages = (): LifecycleBuilderProcessRecord => ({
    id: "proc-1",
    key: "enrollment",
    name: "Enrollment",
    primary_entity: "opportunity",
    is_active: true,
    sort_order: 0,
    tracks_v1: ENROLLMENT_DEFAULT_TRACKS,
    stages: buildEnrollmentTemplateStageRecords(),
});

describe("resolveDecisionSplitOutcomeStatusKey", () => {
    it("maps waitlist outcome to waitlisted disposition", () => {
        expect(
            resolveDecisionSplitOutcomeStatusKey({
                outcomeKey: "waitlist",
                splitOutcome: { outcome_key: "waitlist", label: "Waitlist", target_stage_key: "waitlist" },
                process: processWithTemplateStages(),
            })
        ).toBe("waitlisted");
    });

    it("maps enrolling outcome to enrolling when present in stage membership", () => {
        expect(
            resolveDecisionSplitOutcomeStatusKey({
                outcomeKey: "enrolling",
                splitOutcome: { outcome_key: "enrolling", label: "Enrolling", target_stage_key: "enrolling" },
                process: processWithTemplateStages(),
            })
        ).toBe("enrolling");
    });

    it("returns null for no_action", () => {
        expect(
            resolveDecisionSplitOutcomeStatusKey({
                outcomeKey: "no_action",
                splitOutcome: { outcome_key: "no_action", label: "No action", target_stage_key: null },
            })
        ).toBeNull();
    });
});

describe("applyEnrollmentDecisionSplit", () => {
    beforeEach(() => {
        updateLifecycleStatus.mockReset();
        updateLifecycleStatus.mockImplementation(async (params: {
            opportunityCustomerMemberId: string;
            nextStatusKey: string | null;
        }) => ({
            error: null,
            before: { outcome_status_key: null },
            after: {
                id: params.opportunityCustomerMemberId,
                org_id: "org-1",
                opportunity_id: "opp-smith",
                customer_member_id: "cm",
                outcome_status_key: params.nextStatusKey,
            },
            eventEmitted: true,
        }));
    });

    it("persists per-child outcomes independently", async () => {
        const supabase = {} as Parameters<typeof applyEnrollmentDecisionSplit>[0]["supabase"];
        const departmentMetadata = {
            lifecycle_builder_v1: {
                version: 1 as const,
                active_process_id: "proc-1",
                processes: [processWithTemplateStages()],
            },
        };

        const result = await applyEnrollmentDecisionSplit({
            supabase,
            orgId: "org-1",
            opportunityId: "opp-smith",
            departmentMetadata,
            selections: [
                { opportunity_customer_member_id: "ocm-emma", outcome_key: "waitlist" },
                { opportunity_customer_member_id: "ocm-noah", outcome_key: "enrolling" },
                { opportunity_customer_member_id: "ocm-ava", outcome_key: "enrolling" },
                { opportunity_customer_member_id: "ocm-extra", outcome_key: "no_action" },
            ],
        });

        expect(result.error).toBeNull();
        expect(updateLifecycleStatus).toHaveBeenCalledTimes(3);

        const byOcm = new Map(
            updateLifecycleStatus.mock.calls.map((call) => {
                const arg = call[0] as {
                    opportunityCustomerMemberId: string;
                    nextStatusKey: string | null;
                };
                return [arg.opportunityCustomerMemberId, arg.nextStatusKey] as const;
            })
        );
        expect(byOcm.get("ocm-emma")).toBe("waitlisted");
        expect(byOcm.get("ocm-noah")).toBe("enrolling");
        expect(byOcm.get("ocm-ava")).toBe("enrolling");
        expect(byOcm.has("ocm-extra")).toBe(false);
    });
});
