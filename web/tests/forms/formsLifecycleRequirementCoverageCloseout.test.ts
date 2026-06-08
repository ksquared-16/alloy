/**
 * Card 6 — Forms lifecycle requirement coverage sprint closeout QA (logic-layer).
 */

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
} from "@/lib/forms/lifecycle/isFormLifecycleReadyForRecordCreation";
import { resolveFormsLifecycleRequirementContract } from "@/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract";
import {
    buildLifecycleValidationBlockedMeta,
    buildPublicLifecycleValidationMessage,
    validatePublicSubmissionLifecycleRequirements,
} from "@/lib/forms/lifecycle/validatePublicSubmissionLifecycleRequirements";
import { buildIntakeQuickReviewViewModel } from "@/lib/forms/intakeQuickReviewPresentation";
import {
    enrollmentIntakeRequiresOperatorAttention,
    isCleanCreatedEnrollmentLead,
} from "@/lib/forms/intakeEnrollmentLeadClassification";
import { findLocationSpecificShareLinkForSite } from "@/lib/forms/shareByLocationPresentation";
import { buildLocationSpecificLinkMetadata } from "@/lib/forms/locationSpecificPublicLinkMetadata";
import { DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA } from "@/lib/forms/intakeRuntimeTestFixtures";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const USAGE: FormsLifecycleUsageV1 = {
    version: 1,
    department_id: "dept-enrollment",
    stage_key: "lead",
    intake_intent: "enrollment_lead",
};

const WEBSITE_FIELDS = websiteInquiryFormSchemaForCoverageExample();

function leadContract() {
    return resolveFormsLifecycleRequirementContract({
        departmentId: USAGE.department_id,
        stageKey: USAGE.stage_key,
        intent: USAGE.intake_intent,
        lifecycleLabel: "Enrollment",
    });
}

describe("Forms lifecycle requirement coverage — Card 6 closeout", () => {
    describe("Path 1 — clean Website Inquiry ready", () => {
        it("schema + runtime coverage ready, share allowed, lead-created quick review", () => {
            const contract = leadContract();
            const values = {
                guardian_first_name: "Jordan",
                guardian_last_name: "Test",
                guardian_email: "jordan@example.com",
            };
            const schemaCoverage = evaluateFormsLifecycleFieldCoverageFromFields(WEBSITE_FIELDS, contract);
            const runtimeCoverage = evaluateFormsLifecycleFieldCoverageFromFields(WEBSITE_FIELDS, contract, values);
            const presentation = buildFormLifecycleCoveragePresentation({
                usage: USAGE,
                departmentName: "Enrollment",
                contract,
                coverage: schemaCoverage,
                schema_source: "published",
            });

            expect(schemaCoverage.ready).toBe(true);
            expect(runtimeCoverage.ready).toBe(true);
            expect(presentation.status_headline).toContain("Ready");

            const gate = buildFormLifecycleRecordCreationGate({
                operationalIntent: "enrollment_lead",
                coveragePayload: { configured: true, coverage: schemaCoverage, presentation },
            });
            expect(gate.blocksRecordCreatingShare).toBe(false);

            const quickReview = buildIntakeQuickReviewViewModel({
                row: {
                    id: "sub-1",
                    status: "submitted",
                    created_at: "2026-06-02T12:00:00.000Z",
                    submitted_at: "2026-06-02T12:00:00.000Z",
                    form_definition_id: "form-1",
                    opportunity_id: "opp-1",
                    person_id: "p1",
                    customer_id: "c1",
                    payload: {
                        values,
                        meta: {
                            intake_auto_operationalized: true,
                            intake_needs_review: false,
                            intake_resolution_path: "created_records",
                            intake_opportunity_match: "created",
                        },
                    },
                } as SubmissionInboxRow,
                formName: "Website Inquiry",
                submittedAtLabel: "Jun 2, 2026",
            });
            expect(quickReview.leadCreatedMode).toBe(true);
            expect(quickReview.needsAction.clearMessage).toBe("No manual review required.");
            expect(quickReview.needsAction.items).toHaveLength(0);
        });
    });

    describe("Path 2 — missing required field blocked", () => {
        it("schema missing fields blocks share readiness", () => {
            const contract = leadContract();
            const incompleteFields = WEBSITE_FIELDS.filter((f) => f.id !== "guardian_email" && f.id !== "guardian_phone");
            const coverage = evaluateFormsLifecycleFieldCoverageFromFields(incompleteFields, contract);
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
            expect(gate.blocksRecordCreatingShare).toBe(true);
            expect(gate.shareBlockMessage).toContain("cannot create a Lead");
        });

        it("runtime blocks when submitted contact values are blank", async () => {
            const contract = leadContract();
            const schemaCoverage = evaluateFormsLifecycleFieldCoverageFromFields(WEBSITE_FIELDS, contract);
            expect(schemaCoverage.ready).toBe(true);

            const runtimeCoverage = evaluateFormsLifecycleFieldCoverageFromFields(WEBSITE_FIELDS, contract, {
                guardian_first_name: "Jordan",
                guardian_last_name: "Test",
            });
            expect(runtimeCoverage.ready).toBe(false);

            const labels = runtimeCoverage.missingRequired.map((i) => i.requirementLabel).filter(Boolean);
            expect(buildPublicLifecycleValidationMessage(labels).toLowerCase()).toContain("missing required information");
            const meta = buildLifecycleValidationBlockedMeta({
                usage: USAGE,
                missingRequiredLabels: labels,
                missingRequiredFieldKeys: runtimeCoverage.missingRequired.map((i) => i.requirementFieldKey),
            });
            expect(meta.lifecycle_validation_blocked).toBe(true);
            expect(meta.intake_auto_operationalized).toBe(false);
        });
    });

    describe("Path 3 — recommended-only gaps", () => {
        it("warns but allows share and runtime", () => {
            const contract = leadContract();
            const values = {
                guardian_first_name: "Jordan",
                guardian_last_name: "Test",
                guardian_email: "jordan@example.com",
            };
            const runtimeCoverage = evaluateFormsLifecycleFieldCoverageFromFields(WEBSITE_FIELDS, contract, values);
            expect(runtimeCoverage.ready).toBe(true);
            expect(runtimeCoverage.missingRecommended.length).toBeGreaterThan(0);

            const presentation = buildFormLifecycleCoveragePresentation({
                usage: USAGE,
                departmentName: "Enrollment",
                contract,
                coverage: runtimeCoverage,
                schema_source: "published",
            });
            expect(presentation.status_headline).toContain("Recommended");

            const gate = buildFormLifecycleRecordCreationGate({
                operationalIntent: "enrollment_lead",
                coveragePayload: { configured: true, coverage: runtimeCoverage, presentation },
            });
            expect(gate.blocksRecordCreatingShare).toBe(false);
            expect(isFormLifecycleReadyForRecordCreation({
                operationalIntent: "enrollment_lead",
                coveragePayload: { configured: true, coverage: runtimeCoverage, presentation },
            })).toBe(true);
        });
    });

    describe("Path 4 — duplicate / ambiguous lead", () => {
        it("requires review and is not clean-created", () => {
            const meta = {
                intake_resolution_path: "matched_email",
                intake_identity_name_mismatch: true,
                intake_needs_review: true,
                intake_opportunity_match: "attached_existing",
            };
            const attach = {
                person_id: "p1",
                customer_id: "c1",
                customer_member_id: null,
                opportunity_id: "o1",
            };
            expect(enrollmentIntakeRequiresOperatorAttention({ payloadMeta: meta, attachRow: attach })).toBe(true);
            expect(
                isCleanCreatedEnrollmentLead({
                    status: "submitted",
                    payloadMeta: meta,
                    attachRow: attach,
                })
            ).toBe(false);

            const quickReview = buildIntakeQuickReviewViewModel({
                row: {
                    id: "sub-dup",
                    status: "submitted",
                    created_at: "2026-06-02T12:00:00.000Z",
                    submitted_at: "2026-06-02T12:00:00.000Z",
                    form_definition_id: "form-1",
                    opportunity_id: "o1",
                    person_id: "p1",
                    customer_id: "c1",
                    payload: {
                        values: { guardian_full_name: "Different Name" },
                        meta,
                    },
                } as SubmissionInboxRow,
                formName: "Website Inquiry",
                submittedAtLabel: "Jun 2, 2026",
            });
            expect(quickReview.needsAction.items.some((i) => i.includes("Possible existing family match"))).toBe(true);
            expect(quickReview.needsAction.clearMessage).toBeNull();
        });
    });

    describe("Path 5 — legacy / no lifecycle usage", () => {
        it("skips runtime validation and does not block share", async () => {
            const skipped = await validatePublicSubmissionLifecycleRequirements({} as never, {
                orgId: "org-1",
                formDefinitionId: "form-1",
                schemaJson: { schema_version: 1, fields: WEBSITE_FIELDS },
                linkMetadata: DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA,
                formMetadata: { intake_intent: "enrollment_lead" },
                submittedValues: {},
            });
            expect(skipped.ok).toBe(true);
            if (skipped.ok && skipped.skipped) expect(skipped.reason).toBe("legacy_no_usage");

            const gate = buildFormLifecycleRecordCreationGate({
                operationalIntent: "enrollment_lead",
                coveragePayload: null,
            });
            expect(gate.blocksRecordCreatingShare).toBe(false);
            expect(gate.setupMessage).toContain("Lifecycle coverage not configured");
        });
    });

    describe("Path 6 — location-specific links", () => {
        it("location links are distinct from general links when lifecycle ready", () => {
            const contract = leadContract();
            const coverage = evaluateFormsLifecycleFieldCoverageFromFields(WEBSITE_FIELDS, contract);
            const gate = buildFormLifecycleRecordCreationGate({
                operationalIntent: "enrollment_lead",
                coveragePayload: {
                    configured: true,
                    coverage,
                    presentation: buildFormLifecycleCoveragePresentation({
                        usage: USAGE,
                        departmentName: "Enrollment",
                        contract,
                        coverage,
                        schema_source: "published",
                    }),
                },
            });
            expect(gate.blocksRecordCreatingShare).toBe(false);

            const northId = "11111111-1111-4111-8111-111111111111";
            const links = [
                {
                    id: "general",
                    is_active: true,
                    created_at: "2026-06-01T00:00:00.000Z",
                    metadata: { label: "General intake" },
                },
                {
                    id: "north",
                    is_active: true,
                    created_at: "2026-06-01T00:00:00.000Z",
                    metadata: buildLocationSpecificLinkMetadata({
                        formName: "Website Inquiry",
                        locationId: northId,
                        locationName: "North Campus",
                    }),
                },
            ];
            const northLink = findLocationSpecificShareLinkForSite(links, northId);
            expect(northLink?.id).toBe("north");
            expect((northLink?.metadata as { default_location_id?: string }).default_location_id).toBe(northId);
        });
    });
});
