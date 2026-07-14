import { describe, expect, it, beforeAll } from "vitest";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { ingestCreateLeadThroughProcessing } from "@/lib/pos/processingIdentity/sources/createLeadIntakeAdapter";
import {
    buildPlan,
    executeApprovedPlanForCase,
    loadCaseReview,
    recordResolutionDecision,
} from "@/lib/pos/processingIdentity/operator/operatorReviewService";
import {
    approveWithoutExecute,
    listCaseExceptions,
    makeOperatorDeps,
    resolveUndecidedResolutions,
} from "./cert/processingIdentityCertFlow";
import {
    CERT_ORG_A,
    CERT_USER_A_ADMIN,
    CERT_WU_A,
    certSupabaseConfigured,
    createCertAdminClient,
    seedProcessingIdentityCertFixtures,
} from "./cert/processingIdentityCertFixtures";

describe.skipIf(!certSupabaseConfigured())("processing identity cert — operator workflow & state", () => {
    let verticalId: string;

    beforeAll(async () => {
        const admin = createCertAdminClient();
        ({ verticalId } = await seedProcessingIdentityCertFixtures(admin));
    });

    it("state transitions: intake → identity review → plan → approved → committed", async () => {
        const admin = createCertAdminClient();
        const tag = Date.now();
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: "State",
                last_name: "Flow",
                email: `state.flow.${tag}@test.local`,
                child_first_name: "State",
                child_last_name: "Child",
                child_dob: "2017-01-01",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const afterIntake = await loadCaseReview(deps, intake.processingCaseId);
        expect(afterIntake.readiness).toMatch(/needs_identity_review|needs_plan_review/);
        expect(afterIntake.approval).toBeNull();

        await resolveUndecidedResolutions(deps, intake.processingCaseId);
        const afterDecisions = await loadCaseReview(deps, intake.processingCaseId);
        expect(afterDecisions.readiness).toBe("needs_plan_review");

        await buildPlan(deps, { caseId: intake.processingCaseId });
        const afterPlan = await loadCaseReview(deps, intake.processingCaseId);
        expect(afterPlan.readiness).toBe("ready_for_approval");

        await approveWithoutExecute(deps, intake.processingCaseId);
        const afterApprove = await loadCaseReview(deps, intake.processingCaseId);
        expect(afterApprove.readiness).toBe("approved_ready_to_commit");
        expect(afterApprove.plan).toBeTruthy();
        if (!afterApprove.plan) return;

        const attempt = await executeApprovedPlanForCase(deps, {
            caseId: intake.processingCaseId,
            planId: afterApprove.plan.planId,
            executionIdempotencyKey: `cert-state-${tag}`,
        });
        expect(attempt.outcome).toBe("committed");

        const afterCommit = await loadCaseReview(deps, intake.processingCaseId);
        expect(afterCommit.readiness).toBe("committed");
    });

    it("stale plan: new plan version after resolution edit voids prior approval lane", async () => {
        const admin = createCertAdminClient();
        const tag = Date.now();
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: "Stale",
                last_name: "Plan",
                email: `stale.plan.${tag}@test.local`,
                child_first_name: "Stale",
                child_last_name: "Kid",
                child_dob: "2016-06-06",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const plan1 = await approveWithoutExecute(deps, intake.processingCaseId);
        expect(plan1.version).toBe(1);

        const review = await loadCaseReview(deps, intake.processingCaseId);
        const parentResolution = review.resolutions.find((r) => r.subject_role === "parent");
        expect(parentResolution).toBeTruthy();
        if (!parentResolution) return;

        await recordResolutionDecision(deps, {
            resolutionId: parentResolution.id,
            caseId: intake.processingCaseId,
            decisionAction: "create_new",
            selectedCandidateId: null,
        });

        const { plan: plan2 } = await buildPlan(deps, { caseId: intake.processingCaseId });
        expect(plan2.version).toBeGreaterThan(plan1.version);

        const afterRevise = await loadCaseReview(deps, intake.processingCaseId);
        expect(afterRevise.readiness).toBe("ready_for_approval");
    });

    it("stale plan execution is rejected without committing", async () => {
        const admin = createCertAdminClient();
        const tag = Date.now();
        const intake = await ingestCreateLeadThroughProcessing(admin, {
            orgId: CERT_ORG_A,
            actorId: CERT_USER_A_ADMIN,
            merged: {
                first_name: "Fail",
                last_name: "Exec",
                email: `fail.exec.${tag}@test.local`,
                child_first_name: "Fail",
                child_last_name: "Kid",
                child_dob: "2015-05-05",
            },
            workUnitId: CERT_WU_A,
            statusKey: NEW_LEAD_STATUS_KEY,
            verticalId,
        });
        expect(intake.ok).toBe(true);
        if (!intake.ok) return;

        const deps = makeOperatorDeps(admin, CERT_ORG_A, CERT_USER_A_ADMIN);
        const plan1 = await approveWithoutExecute(deps, intake.processingCaseId);
        await buildPlan(deps, { caseId: intake.processingCaseId });

        const attempt = await executeApprovedPlanForCase(deps, {
            caseId: intake.processingCaseId,
            planId: plan1.planId,
            executionIdempotencyKey: `cert-stale-${tag}`,
        });
        expect(attempt.outcome).toBe("preflight_rejected");

        const review = await loadCaseReview(deps, intake.processingCaseId);
        expect(review.readiness).toBe("exception");

        const exceptions = await listCaseExceptions(admin, CERT_ORG_A, intake.processingCaseId);
        expect(exceptions.length).toBeGreaterThan(0);
    });
});
