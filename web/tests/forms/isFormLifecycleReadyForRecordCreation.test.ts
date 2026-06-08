import { describe, expect, it } from "vitest";
import { buildFormLifecycleCoveragePresentation } from "@/lib/forms/lifecycle/buildFormLifecycleCoveragePresentation";
import {
    evaluateFormsLifecycleFieldCoverageFromFields,
    websiteInquiryFormSchemaForCoverageExample,
} from "@/lib/forms/lifecycle/evaluateFormsLifecycleFieldCoverage";
import type { FormsLifecycleUsageV1 } from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";
import {
    buildFormLifecycleRecordCreationGate,
    isFormLifecycleReadyForRecordCreation,
    operationalIntentRequiresLifecycleRecordCoverage,
} from "@/lib/forms/lifecycle/isFormLifecycleReadyForRecordCreation";
import { resolveFormsLifecycleRequirementContract } from "@/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract";

const USAGE: FormsLifecycleUsageV1 = {
    version: 1,
    department_id: "dept-1",
    stage_key: "lead",
    intake_intent: "enrollment_lead",
};

function readyCoveragePayload() {
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
        usage: USAGE,
        departmentName: "Enrollment",
        contract,
        coverage,
        schema_source: "published",
    });
    return { configured: true as const, coverage, presentation, contract };
}

describe("isFormLifecycleReadyForRecordCreation", () => {
    it("does not apply to non-record intents", () => {
        const gate = buildFormLifecycleRecordCreationGate({
            operationalIntent: "existing_family",
            coveragePayload: null,
        });
        expect(gate.applies).toBe(false);
        expect(gate.blocksRecordCreatingShare).toBe(false);
        expect(operationalIntentRequiresLifecycleRecordCoverage("existing_family")).toBe(false);
    });

    it("allows share when lifecycle usage is not configured (legacy behavior)", () => {
        const gate = buildFormLifecycleRecordCreationGate({
            operationalIntent: "enrollment_lead",
            coveragePayload: { configured: false, coverage: null, presentation: buildFormLifecycleCoveragePresentation({
                usage: null,
                contract: null,
                coverage: null,
                schema_source: "published",
            }) },
        });
        expect(gate.readiness).toBe("not_configured");
        expect(gate.blocksRecordCreatingShare).toBe(false);
        expect(gate.setupMessage).toContain("Lifecycle coverage not configured");
    });

    it("blocks share when required lifecycle fields are missing", () => {
        const contract = resolveFormsLifecycleRequirementContract({
            departmentId: "dept-1",
            stageKey: "lead",
            intent: "enrollment_lead",
        });
        const coverage = evaluateFormsLifecycleFieldCoverageFromFields([], contract);
        const presentation = buildFormLifecycleCoveragePresentation({
            usage: USAGE,
            departmentName: "Enrollment",
            contract,
            coverage,
            schema_source: "published",
        });
        const gate = buildFormLifecycleRecordCreationGate({
            operationalIntent: "enrollment_lead",
            coveragePayload: { configured: true, coverage, presentation },
        });
        expect(gate.readiness).toBe("missing_required");
        expect(gate.blocksRecordCreatingShare).toBe(true);
        expect(gate.shareBlockMessage).toContain("cannot create a Lead yet");
        expect(gate.shareBlockButtonLabel).toBe("Add required fields first");
    });

    it("allows share when ready with only recommended gaps", () => {
        const { coverage, presentation } = readyCoveragePayload();
        expect(coverage.ready).toBe(true);
        const gate = buildFormLifecycleRecordCreationGate({
            operationalIntent: "enrollment_lead",
            coveragePayload: { configured: true, coverage, presentation },
        });
        expect(gate.readiness === "ready" || gate.readiness === "ready_with_recommended_gaps").toBe(true);
        expect(gate.blocksRecordCreatingShare).toBe(false);
        expect(isFormLifecycleReadyForRecordCreation({
            operationalIntent: "enrollment_lead",
            coveragePayload: { configured: true, coverage, presentation },
        })).toBe(true);
    });

    it("blocks share when coverage is unavailable", () => {
        const gate = buildFormLifecycleRecordCreationGate({
            operationalIntent: "enrollment_lead",
            coveragePayload: {
                configured: true,
                coverage: null,
                presentation: buildFormLifecycleCoveragePresentation({
                    usage: USAGE,
                    departmentName: "Enrollment",
                    contract: null,
                    coverage: null,
                    schema_source: "none",
                }),
            },
            coverageLoadFailed: true,
        });
        expect(gate.readiness).toBe("unavailable");
        expect(gate.blocksRecordCreatingShare).toBe(true);
    });

    it("marks fully ready enrollment lead coverage without recommended gaps", () => {
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
        const coverageWithoutRecommendedGaps = {
            ...coverage,
            missingRecommended: [],
        };
        const presentation = buildFormLifecycleCoveragePresentation({
            usage: USAGE,
            departmentName: "Enrollment",
            contract,
            coverage: coverageWithoutRecommendedGaps,
            schema_source: "published",
        });
        const gate = buildFormLifecycleRecordCreationGate({
            operationalIntent: "enrollment_lead",
            coveragePayload: {
                configured: true,
                coverage: coverageWithoutRecommendedGaps,
                presentation,
            },
        });
        expect(gate.readiness).toBe("ready");
        expect(gate.setupHeadline).toBe("Ready to create Lead.");
        expect(gate.blocksRecordCreatingShare).toBe(false);
    });
});
