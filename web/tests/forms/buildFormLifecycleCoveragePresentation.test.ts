import { describe, expect, it } from "vitest";
import { buildFormLifecycleCoveragePresentation } from "@/lib/forms/lifecycle/buildFormLifecycleCoveragePresentation";
import {
    evaluateFormsLifecycleFieldCoverageFromFields,
    websiteInquiryFormSchemaForCoverageExample,
} from "@/lib/forms/lifecycle/evaluateFormsLifecycleFieldCoverage";
import type { FormsLifecycleUsageV1 } from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";
import { resolveFormsLifecycleRequirementContract } from "@/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract";

describe("buildFormLifecycleCoveragePresentation", () => {
    it("returns empty state when lifecycle usage is not configured", () => {
        const presentation = buildFormLifecycleCoveragePresentation({
            usage: null,
            contract: null,
            coverage: null,
            schema_source: "published",
        });

        expect(presentation.status).toBe("empty");
        expect(presentation.status_message).toContain("Select a lifecycle stage");
        expect(presentation.entity_groups).toEqual([]);
    });

    it("returns ready presentation without raw keys", () => {
        const usage: FormsLifecycleUsageV1 = {
            version: 1,
            department_id: "dept-1",
            stage_key: "lead",
            intake_intent: "enrollment_lead",
        };
        const contract = resolveFormsLifecycleRequirementContract({
            departmentId: "dept-1",
            stageKey: "lead",
            intent: "enrollment_lead",
            lifecycleLabel: "Enrollment",
        });
        const coverage = evaluateFormsLifecycleFieldCoverageFromFields(
            websiteInquiryFormSchemaForCoverageExample(),
            contract
        );

        const presentation = buildFormLifecycleCoveragePresentation({
            usage,
            departmentName: "Enrollment",
            contract,
            coverage,
            schema_source: "published",
        });

        expect(presentation.status).toBe("ready");
        expect(presentation.status_headline).toBe("Ready. Recommended fields are missing.");
        expect(JSON.stringify(presentation)).not.toContain("person:first_name");
        expect(JSON.stringify(presentation)).not.toContain("crm_mapping_key");
        expect(JSON.stringify(presentation)).not.toContain("guardian_first_name");

        const personGroup = presentation.entity_groups.find((g) => g.entity_label === "Person / Guardian");
        expect(personGroup).toBeTruthy();
        expect(personGroup?.rows.some((r) => r.field_label === "First Name" && r.status_label === "Satisfied")).toBe(
            true
        );
    });

    it("returns missing required message for incomplete form", () => {
        const usage: FormsLifecycleUsageV1 = {
            version: 1,
            department_id: "dept-1",
            stage_key: "lead",
            intake_intent: "enrollment_lead",
        };
        const contract = resolveFormsLifecycleRequirementContract({
            departmentId: "dept-1",
            stageKey: "lead",
            intent: "enrollment_lead",
        });
        const coverage = evaluateFormsLifecycleFieldCoverageFromFields([], contract);

        const presentation = buildFormLifecycleCoveragePresentation({
            usage,
            departmentName: "Enrollment",
            contract,
            coverage,
            schema_source: "published",
        });

        expect(presentation.status).toBe("missing_required");
        expect(presentation.status_message).toContain("cannot create a Lead yet");
    });
});
