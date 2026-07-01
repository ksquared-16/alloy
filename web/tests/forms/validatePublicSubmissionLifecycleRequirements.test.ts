import { describe, expect, it } from "vitest";
import {
    evaluateFormsLifecycleFieldCoverageFromFields,
    evaluateSubmittedFormsLifecycleFieldCoverage,
    websiteInquiryFormSchemaForCoverageExample,
} from "@/lib/forms/lifecycle/evaluateFormsLifecycleFieldCoverage";
import { resolveFormsLifecycleRequirementContract } from "@/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract";
import {
    buildLifecycleValidationBlockedMeta,
    buildPublicLifecycleValidationMessage,
    validatePublicSubmissionLifecycleRequirements,
} from "@/lib/forms/lifecycle/validatePublicSubmissionLifecycleRequirements";
import { DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA } from "@/lib/forms/intakeRuntimeTestFixtures";

function leadEnrollmentContract() {
    return resolveFormsLifecycleRequirementContract({
        departmentId: "dept-123",
        stageKey: "lead",
        intent: "enrollment_lead",
    });
}

describe("evaluateSubmittedFormsLifecycleFieldCoverage", () => {
    const fields = websiteInquiryFormSchemaForCoverageExample();
    const contract = leadEnrollmentContract();

    it("schema-ready form blocks when required submitted values are empty", () => {
        const schemaOnly = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract);
        expect(schemaOnly.ready).toBe(true);

        const runtime = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract, {
            guardian_first_name: "Jordan",
            guardian_last_name: "Test",
        });
        expect(runtime.ready).toBe(false);
        expect(runtime.constraintFailures.length).toBeGreaterThan(0);
    });

    it("allows record creation when required submitted values are present", () => {
        const runtime = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract, {
            guardian_first_name: "Jordan",
            guardian_last_name: "Test",
            guardian_email: "jordan@example.com",
        });
        expect(runtime.ready).toBe(true);
    });

    it("email-or-phone constraint passes with phone only", () => {
        const runtime = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract, {
            guardian_first_name: "Jordan",
            guardian_last_name: "Test",
            guardian_phone: "6025550100",
        });
        expect(runtime.ready).toBe(true);
        expect(runtime.constraintFailures).toHaveLength(0);
    });

    it("recommended-only missing does not block runtime readiness", () => {
        const runtime = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract, {
            guardian_first_name: "Jordan",
            guardian_last_name: "Test",
            guardian_email: "jordan@example.com",
        });
        expect(runtime.ready).toBe(true);
        expect(runtime.missingRecommended.length).toBeGreaterThan(0);
    });

    it("website inquiry schema helper passes with representative values", () => {
        const schemaJson = {
            schema_version: 1,
            title: "Website Inquiry",
            sections: [{ id: "main", field_ids: fields.map((f) => f.id) }],
            fields,
        };
        const coverage = evaluateSubmittedFormsLifecycleFieldCoverage(schemaJson, contract, {
            guardian_first_name: "Jordan",
            guardian_last_name: "Test",
            guardian_email: "jordan@example.com",
        });
        expect(coverage.ready).toBe(true);
    });
});

describe("validatePublicSubmissionLifecycleRequirements", () => {
    it("skips legacy forms without lifecycle usage", async () => {
        const result = await validatePublicSubmissionLifecycleRequirements({} as never, {
            orgId: "org-1",
            formDefinitionId: "form-1",
            schemaJson: { schema_version: 1, fields: websiteInquiryFormSchemaForCoverageExample() },
            linkMetadata: DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA,
            formMetadata: { intake_intent: "enrollment_lead" },
            submittedValues: {},
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.skipped).toBe(true);
        if (result.ok && result.skipped) expect(result.reason).toBe("legacy_no_usage");
    });

    it("skips non-record intents even with lifecycle usage", async () => {
        const result = await validatePublicSubmissionLifecycleRequirements({} as never, {
            orgId: "org-1",
            formDefinitionId: "form-1",
            schemaJson: { schema_version: 1, fields: websiteInquiryFormSchemaForCoverageExample() },
            linkMetadata: { ...DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA, auto_create_opportunity: false },
            formMetadata: {
                lifecycle_usage_v1: {
                    version: 1,
                    department_id: "dept-123",
                    stage_key: "lead",
                    intake_intent: "existing_family",
                },
            },
            submittedValues: {},
        });
        expect(result.ok).toBe(true);
        if (result.ok && result.skipped) expect(result.reason).toBe("not_record_creating");
    });

    it("builds user-friendly blocked messages from labels only", () => {
        expect(buildPublicLifecycleValidationMessage(["Guardian phone or email"])).toBe(
            "This form is missing required information: Guardian phone or email."
        );
        expect(
            buildPublicLifecycleValidationMessage(["First name", "Last name", "Guardian phone or email", "Child age"])
        ).toContain("and others");
    });

    it("blocked metadata marks lifecycle validation without auto-operationalization", () => {
        const meta = buildLifecycleValidationBlockedMeta({
            usage: {
                version: 1,
                department_id: "dept-123",
                stage_key: "lead",
                intake_intent: "enrollment_lead",
            },
            missingRequiredLabels: ["Guardian phone or email"],
            missingRequiredFieldKeys: ["email"],
        });
        expect(meta.lifecycle_validation_blocked).toBe(true);
        expect(meta.intake_auto_operationalized).toBe(false);
        expect(meta.intake_resolution_path).toBe("lifecycle_validation_blocked");
        expect(meta.missing_required_fields).toEqual(["Guardian phone or email"]);
    });
});
