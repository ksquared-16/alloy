import { describe, expect, it } from "vitest";
import {
    buildIntakeRuntimeOrchestrationViewModel,
    buildRuntimeTestConfirmation,
    inferIntakeTypeFromLink,
    resolveWorkUnitWorkspaceHref,
} from "@/lib/forms/intakeRuntimeOrchestrationPresentation";
import { DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA } from "@/lib/forms/intakeRuntimeTestFixtures";
import { ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY } from "@/lib/forms/seeds/enrollmentLeadCaptureDemo";

const ENROLLMENT_LINK = {
    id: "link-enrollment",
    is_active: true,
    created_at: "2026-05-01T00:00:00.000Z",
    metadata: { ...DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA },
};

const OTHER_LINK = {
    id: "link-other",
    is_active: true,
    created_at: "2026-05-02T00:00:00.000Z",
    metadata: { intake: false, lead_capture: false },
};

describe("intakeRuntimeOrchestrationPresentation", () => {
    it("infers enrollment lead intake type from demo form key", () => {
        expect(inferIntakeTypeFromLink(ENROLLMENT_LINK.metadata, ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY)).toBe(
            "enrollment_lead"
        );
    });

    it("builds work unit workspace href with New Leads queue for enrollment intake", () => {
        const href = resolveWorkUnitWorkspaceHref(
            DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA.default_department_id,
            DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA.default_work_unit_id,
            { highlightQueueKey: "new_leads" }
        );
        expect(href).toContain("/adminV2/workspace/dept/");
        expect(href).toContain("primary_queue_key=new_leads");
    });

    it("detects runtime mismatch when last submission used another link", () => {
        const vm = buildIntakeRuntimeOrchestrationViewModel({
            formKey: ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY,
            formMetadata: {},
            links: [ENROLLMENT_LINK, OTHER_LINK],
            selectedLinkId: ENROLLMENT_LINK.id,
            labelCatalog: null,
            documentGenerationConfigured: false,
            hasPublished: true,
            latestSubmission: {
                id: "sub-1",
                status: "submitted",
                submitted_at: "2026-05-27T12:00:00.000Z",
                created_at: "2026-05-27T12:00:00.000Z",
                created_via_public_link_id: OTHER_LINK.id,
                payload: { meta: { intake_resolution_path: "skipped_missing_config" } },
            },
        });
        expect(vm.runtimeMismatch).not.toBeNull();
        expect(vm.runtimeMismatch?.lastSubmissionLinkId).toBe(OTHER_LINK.id);
    });

    it("confirms successful enrollment lead runtime test", () => {
        const confirmation = buildRuntimeTestConfirmation({
            id: "sub-2",
            status: "submitted",
            submitted_at: "2026-05-27T12:00:00.000Z",
            created_at: "2026-05-27T12:00:00.000Z",
            opportunity_id: "opp-123",
            created_via_public_link_id: ENROLLMENT_LINK.id,
            payload: {
                meta: {
                    intake_resolution_path: "created_opportunity",
                    intake_auto_operationalized: true,
                },
            },
        });
        expect(confirmation?.headline).toContain("It worked");
        expect(confirmation?.opportunityId).toBe("opp-123");
        expect(confirmation?.autoOperationalized).toBe(true);
    });

    it("warns when intake not configured on link", () => {
        const confirmation = buildRuntimeTestConfirmation({
            id: "sub-3",
            status: "submitted",
            submitted_at: "2026-05-27T12:00:00.000Z",
            created_at: "2026-05-27T12:00:00.000Z",
            payload: { meta: { intake_resolution_path: "skipped_missing_config" } },
        });
        expect(confirmation?.headline).toContain("not configured");
        expect(confirmation?.intakeConfigured).toBe(false);
    });

    it("flags link setup incomplete when form intent does not match share link", () => {
        const vm = buildIntakeRuntimeOrchestrationViewModel({
            formKey: "website_inquiry",
            formMetadata: { intake_intent: "enrollment_lead" },
            links: [
                {
                    id: "link-bare",
                    is_active: true,
                    created_at: "2026-05-01T00:00:00.000Z",
                    metadata: {},
                },
            ],
            selectedLinkId: "link-bare",
            labelCatalog: null,
            documentGenerationConfigured: false,
            hasPublished: true,
            latestSubmission: null,
        });
        expect(vm.linkSetupIncomplete).toBe(true);
        expect(vm.linkSetupIncompleteMessage).toContain("only save submissions");
        expect(vm.createsLead).toBe(false);
        expect(vm.steps.find((s) => s.key === "share")?.hint).toContain("Finish");
    });

    it("marks share link ready when enrollment lead intent is configured on link", () => {
        const vm = buildIntakeRuntimeOrchestrationViewModel({
            formKey: "website_inquiry",
            formMetadata: { intake_intent: "enrollment_lead" },
            links: [ENROLLMENT_LINK],
            selectedLinkId: ENROLLMENT_LINK.id,
            labelCatalog: null,
            documentGenerationConfigured: false,
            hasPublished: true,
            latestSubmission: null,
        });
        expect(vm.linkOutcomeConfigured).toBe(true);
        expect(vm.linkSetupIncomplete).toBe(false);
        expect(vm.createsLead).toBe(true);
        expect(vm.steps.find((s) => s.key === "share")?.hint).toBe("Link ready");
    });
});
