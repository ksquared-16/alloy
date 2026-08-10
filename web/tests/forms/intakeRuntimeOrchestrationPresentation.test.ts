import { describe, expect, it } from "vitest";
import {
    buildIntakeRuntimeOrchestrationViewModel,
    buildRuntimeTestConfirmation,
    inferIntakeTypeFromLink,
    resolveWorkUnitWorkspaceHref,
} from "@/lib/forms/intakeRuntimeOrchestrationPresentation";
import { buildFormLifecycleRecordCreationGate } from "@/lib/forms/lifecycle/isFormLifecycleReadyForRecordCreation";
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
        expect(href).toBe("/workspace/work-unit/new-leads");
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

    it("does not require test submission for live readiness", () => {
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
        expect(vm.liveReady).toBe(true);
        expect(vm.steps.find((s) => s.key === "test")?.status).toBe("pending");
        expect(vm.steps.find((s) => s.key === "test")?.hint).toMatch(/Optional/i);
    });

    it("blocks live readiness when lifecycle required coverage is missing", () => {
        const gate = buildFormLifecycleRecordCreationGate({
            operationalIntent: "enrollment_lead",
            coveragePayload: {
                configured: true,
                coverage: {
                    ready: false,
                    missingRequired: [{ requirementId: "person:first_name", requirementLabel: "First Name", requirementEntityType: "person", requirementFieldKey: "first_name", requiredness: "required", status: "missing" }],
                    missingRecommended: [],
                    satisfiedRequired: [],
                    satisfiedRecommended: [],
                    byEntity: {},
                    constraintFailures: [],
                },
                presentation: {
                    status: "missing_required",
                    status_headline: "Missing required fields",
                    status_message:
                        "This form cannot create a Lead yet because it does not capture all required information for the selected lifecycle stage.",
                    schema_source: "published",
                    lifecycle_label: "Enrollment",
                    stage_label: "Lead",
                    intent_label: "Capture new enrollment lead",
                    entity_groups: [],
                missing_required_labels: [],
                },
            },
        });
        const vm = buildIntakeRuntimeOrchestrationViewModel({
            formKey: "website_inquiry",
            formMetadata: {
                intake_intent: "enrollment_lead",
                lifecycle_usage_v1: {
                    version: 1,
                    department_id: "dept-1",
                    stage_key: "lead",
                    intake_intent: "enrollment_lead",
                },
            },
            links: [ENROLLMENT_LINK],
            selectedLinkId: ENROLLMENT_LINK.id,
            labelCatalog: null,
            documentGenerationConfigured: false,
            hasPublished: true,
            latestSubmission: null,
            lifecycleRecordGate: gate,
        });
        expect(vm.recordCreatingShareBlocked).toBe(true);
        expect(vm.liveReady).toBe(false);
        expect(vm.steps.find((s) => s.key === "share")?.hint).toBe("Add required fields first");
    });

    it("keeps live readiness when lifecycle coverage is ready", () => {
        const gate = buildFormLifecycleRecordCreationGate({
            operationalIntent: "enrollment_lead",
            coveragePayload: {
                configured: true,
                coverage: {
                    ready: true,
                    missingRequired: [],
                    missingRecommended: [],
                    satisfiedRequired: [],
                    satisfiedRecommended: [],
                    byEntity: {},
                    constraintFailures: [],
                },
                presentation: {
                    status: "ready",
                    status_headline: "Ready to create Lead.",
                    status_message: "Ready.",
                    schema_source: "published",
                    lifecycle_label: "Enrollment",
                    stage_label: "Lead",
                    intent_label: "Capture new enrollment lead",
                    entity_groups: [],
                missing_required_labels: [],
                },
            },
        });
        const vm = buildIntakeRuntimeOrchestrationViewModel({
            formKey: "website_inquiry",
            formMetadata: { intake_intent: "enrollment_lead" },
            links: [ENROLLMENT_LINK],
            selectedLinkId: ENROLLMENT_LINK.id,
            labelCatalog: null,
            documentGenerationConfigured: false,
            hasPublished: true,
            latestSubmission: null,
            lifecycleRecordGate: gate,
        });
        expect(vm.recordCreatingShareBlocked).toBe(false);
        expect(vm.liveReady).toBe(true);
    });

    it("does not block non-record intents on lifecycle coverage gaps", () => {
        const gate = buildFormLifecycleRecordCreationGate({
            operationalIntent: "existing_family",
            coveragePayload: null,
        });
        const vm = buildIntakeRuntimeOrchestrationViewModel({
            formKey: "website_inquiry",
            formMetadata: { intake_intent: "existing_family" },
            links: [ENROLLMENT_LINK],
            selectedLinkId: ENROLLMENT_LINK.id,
            labelCatalog: null,
            documentGenerationConfigured: false,
            hasPublished: true,
            latestSubmission: null,
            lifecycleRecordGate: gate,
        });
        expect(gate.applies).toBe(false);
        expect(vm.recordCreatingShareBlocked).toBe(false);
    });
});
