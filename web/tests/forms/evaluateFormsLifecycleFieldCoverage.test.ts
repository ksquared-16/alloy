import { describe, expect, it } from "vitest";
import type { FormsLifecycleRequirementContract } from "@/lib/forms/lifecycle/formsLifecycleCoverageTypes";
import {
    evaluateFormsLifecycleFieldCoverageFromFields,
    websiteInquiryFormSchemaForCoverageExample,
} from "@/lib/forms/lifecycle/evaluateFormsLifecycleFieldCoverage";
import { resolveFormsLifecycleRequirementContract } from "@/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract";
import type { FormField } from "@/lib/forms/schema";

function leadEnrollmentContract(): FormsLifecycleRequirementContract {
    return resolveFormsLifecycleRequirementContract({
        departmentId: "dept-123",
        stageKey: "lead",
        intent: "enrollment_lead",
    });
}

describe("evaluateFormsLifecycleFieldCoverage", () => {
    it("guardian system fields satisfy person requirements via field_source", () => {
        const fields: FormField[] = [
            {
                id: "guardian_first_name",
                type: "text",
                label: "Guardian first name",
                required: true,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_first_name",
                    crm_mapping_key: "guardian.first_name",
                },
            },
            {
                id: "guardian_last_name",
                type: "text",
                label: "Guardian last name",
                required: true,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_last_name",
                    crm_mapping_key: "guardian.last_name",
                },
            },
            {
                id: "guardian_email",
                type: "text",
                label: "Guardian email",
                required: false,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_email",
                    crm_mapping_key: "guardian.email",
                },
            },
        ];

        const result = evaluateFormsLifecycleFieldCoverageFromFields(fields, leadEnrollmentContract());

        expect(result.satisfiedRequired.some((i) => i.requirementId === "person:first_name")).toBe(true);
        expect(result.satisfiedRequired.some((i) => i.requirementId === "person:last_name")).toBe(true);
        expect(result.satisfiedRequired.find((i) => i.requirementId === "person:first_name")?.matchKind).toBe(
            "crm_mapping_key"
        );
        expect(result.constraintFailures).toHaveLength(0);
        expect(result.ready).toBe(true);
    });

    it("returns ready false when required person fields are missing", () => {
        const fields: FormField[] = [
            {
                id: "guardian_email",
                type: "text",
                label: "Guardian email",
                required: false,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_email",
                    crm_mapping_key: "guardian.email",
                },
            },
        ];

        const result = evaluateFormsLifecycleFieldCoverageFromFields(fields, leadEnrollmentContract());

        expect(result.ready).toBe(false);
        expect(result.missingRequired.some((i) => i.requirementId === "person:first_name")).toBe(true);
        expect(result.missingRequired.some((i) => i.requirementId === "person:last_name")).toBe(true);
    });

    it("recommended missing does not block readiness", () => {
        const fields: FormField[] = [
            {
                id: "guardian_first_name",
                type: "text",
                label: "Guardian first name",
                required: true,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_first_name",
                    crm_mapping_key: "guardian.first_name",
                },
            },
            {
                id: "guardian_last_name",
                type: "text",
                label: "Guardian last name",
                required: true,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_last_name",
                    crm_mapping_key: "guardian.last_name",
                },
            },
            {
                id: "guardian_phone",
                type: "text",
                label: "Guardian phone",
                required: false,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_phone",
                    crm_mapping_key: "guardian.phone",
                },
            },
        ];

        const contract: FormsLifecycleRequirementContract = {
            ...leadEnrollmentContract(),
            recommended: [
                {
                    id: "child:first_name",
                    entityType: "child",
                    fieldKey: "first_name",
                    label: "First Name",
                    requiredness: "recommended",
                    requirementSource: "lifecycle_stage",
                },
            ],
        };
        const result = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract);

        expect(result.ready).toBe(true);
        expect(result.missingRequired.filter((i) => i.status === "missing")).toHaveLength(0);
        expect(result.missingRecommended.some((i) => i.requirementId === "child:first_name")).toBe(true);
    });

    it("custom unmapped fields do not satisfy lifecycle requirements", () => {
        const fields: FormField[] = [
            {
                id: "notes",
                type: "text",
                label: "First Name",
                required: true,
                field_source: { entity_type: "custom", field_key: "unmapped" },
            },
        ];

        const contract = resolveFormsLifecycleRequirementContract({
            stageKey: "lead",
            intent: "general",
        });

        const result = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract);

        expect(result.satisfiedRequired.some((i) => i.requirementId === "person:first_name")).toBe(false);
        expect(result.ready).toBe(false);
    });

    it("email OR phone constraint passes when either field is present", () => {
        const emailOnly: FormField[] = [
            {
                id: "guardian_first_name",
                type: "text",
                label: "Guardian first name",
                required: true,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_first_name",
                    crm_mapping_key: "guardian.first_name",
                },
            },
            {
                id: "guardian_last_name",
                type: "text",
                label: "Guardian last name",
                required: true,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_last_name",
                    crm_mapping_key: "guardian.last_name",
                },
            },
            {
                id: "guardian_email",
                type: "text",
                label: "Guardian email",
                required: false,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_email",
                    crm_mapping_key: "guardian.email",
                },
            },
        ];

        const phoneOnly: FormField[] = [
            ...emailOnly.filter((f) => f.id !== "guardian_email"),
            {
                id: "guardian_phone",
                type: "text",
                label: "Guardian phone",
                required: false,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_phone",
                    crm_mapping_key: "guardian.phone",
                },
            },
        ];

        expect(evaluateFormsLifecycleFieldCoverageFromFields(emailOnly, leadEnrollmentContract()).ready).toBe(true);
        expect(evaluateFormsLifecycleFieldCoverageFromFields(phoneOnly, leadEnrollmentContract()).ready).toBe(true);

        const neither = emailOnly.filter((f) => f.id !== "guardian_email");
        const fail = evaluateFormsLifecycleFieldCoverageFromFields(neither, leadEnrollmentContract());
        expect(fail.ready).toBe(false);
        expect(fail.constraintFailures.length).toBeGreaterThan(0);
    });

    it("child system fields satisfy child requirements", () => {
        const fields: FormField[] = [
            {
                id: "child_first_name",
                type: "text",
                label: "Child first name",
                required: true,
                field_source: {
                    entity_type: "child",
                    field_key: "child_first_name",
                    crm_mapping_key: "child.first_name",
                },
            },
            {
                id: "child_last_name",
                type: "text",
                label: "Child last name",
                required: true,
                field_source: {
                    entity_type: "child",
                    field_key: "child_last_name",
                    crm_mapping_key: "child.last_name",
                },
            },
        ];

        const contract = resolveFormsLifecycleRequirementContract({
            stageKey: "qualification",
            intent: "general",
        });

        const result = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract);

        expect(result.satisfiedRequired.some((i) => i.requirementId === "child:first_name")).toBe(true);
        expect(result.satisfiedRequired.some((i) => i.requirementId === "child:last_name")).toBe(true);
    });

    it("opportunity_interest_notes satisfies opportunity note requirement when mapped", () => {
        const fields: FormField[] = [
            {
                id: "opportunity_interest_notes",
                type: "text",
                label: "Inquiry message",
                required: false,
                multiline: true,
                field_source: {
                    entity_type: "opportunity",
                    field_key: "opportunity_interest_notes",
                    crm_mapping_key: "opportunity.interest_notes",
                },
            },
        ];

        const contract: FormsLifecycleRequirementContract = {
            stageKey: "lead",
            intent: "general",
            requirementsSource: "platform",
            required: [],
            recommended: [
                {
                    id: "opportunity:interest_notes",
                    entityType: "opportunity",
                    fieldKey: "interest_notes",
                    label: "Inquiry message",
                    requiredness: "recommended",
                    requirementSource: "manual",
                },
            ],
            constraints: [],
        };

        const result = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract);

        expect(result.satisfiedRecommended.some((i) => i.requirementId === "opportunity:interest_notes")).toBe(
            true
        );
        expect(
            result.satisfiedRecommended.find((i) => i.requirementId === "opportunity:interest_notes")?.matchKind
        ).toBe("crm_mapping_key");
    });

    it("guardian_full_name does not satisfy person first or last name", () => {
        const fields: FormField[] = [
            {
                id: "guardian_full_name",
                type: "text",
                label: "Guardian full name",
                required: true,
            },
            {
                id: "guardian_email",
                type: "text",
                label: "Guardian email",
                required: false,
                field_source: {
                    entity_type: "guardian",
                    field_key: "guardian_email",
                    crm_mapping_key: "guardian.email",
                },
            },
        ];

        const result = evaluateFormsLifecycleFieldCoverageFromFields(fields, leadEnrollmentContract());

        expect(result.satisfiedRequired.some((i) => i.requirementId === "person:first_name")).toBe(false);
        expect(result.satisfiedRequired.some((i) => i.requirementId === "person:last_name")).toBe(false);
        expect(result.ready).toBe(false);
    });

    it("label fallback matches weakly when no field_source", () => {
        const fields: FormField[] = [
            {
                id: "g_first",
                type: "text",
                label: "Guardian first name",
                required: true,
            },
        ];

        const contract = resolveFormsLifecycleRequirementContract({
            stageKey: "lead",
            intent: "general",
        });

        const result = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract);
        const first = result.satisfiedRequired.find((i) => i.requirementId === "person:first_name");

        expect(first?.matchKind).toBe("label_weak");
        expect(first?.matchedFormFieldId).toBe("g_first");
    });

    it("website inquiry example schema with enrollment_lead contract", () => {
        const fields = websiteInquiryFormSchemaForCoverageExample();
        const result = evaluateFormsLifecycleFieldCoverageFromFields(fields, leadEnrollmentContract());

        expect(result.ready).toBe(true);
        expect(result.satisfiedRequired.map((i) => i.requirementId)).toEqual(
            expect.arrayContaining(["person:first_name", "person:last_name"])
        );
        expect(result.constraintFailures).toHaveLength(0);
        expect(result.byEntity["Person / Guardian"]?.required.length).toBeGreaterThan(0);
    });
});
