import { describe, expect, it } from "vitest";
import { buildActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import { adminActionPreflightFailure } from "@/lib/admin/actions/adminActionPreflight";
import { enrichOperationalRecommendationWithActionPreflight } from "@/lib/adminV2/bos/recommendations/preflight/enrichOperationalRecommendationPreflight";
import { evaluateEffectiveRequirements } from "@/lib/completion/evaluateEffectiveRequirements";
import { createReadinessMemoScope, evaluateOperationalReadinessMemoized } from "@/lib/completion/readinessEvaluationMemo";
import {
    readinessResultFromFormsLifecycleCoverage,
    formsSubmitBlockedByReadiness,
} from "@/lib/completion/readinessFromFormsCoverage";
import { readinessResultFromRequirementValidation } from "@/lib/completion/readinessFromRequirementValidation";
import { tryEvaluateDrawerRecordReadiness } from "@/lib/completion/readinessDrawerBootstrap";
import { buildLifecycleFieldRulesOverridePatch } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import {
    evaluateFormsLifecycleFieldCoverageFromFields,
    websiteInquiryFormSchemaForCoverageExample,
} from "@/lib/forms/lifecycle/evaluateFormsLifecycleFieldCoverage";
import { resolveFormsLifecycleRequirementContract } from "@/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract";
import { APPROVE_ENROLLMENT_ACTION_KEY } from "@/lib/admin/actions/enrollmentApprovalConstants";
import type { EffectiveRequirementsResult } from "@/lib/completion/effectiveRequirementsTypes";
import type { OperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/types";
import { buildRequirementValidationResult, makeRequirementViolation } from "@/lib/completion/requirementValidationResult";

const ENFORCEABLE_RULE = "child:program_interest";

function metadataQualification(required: string[], recommended: string[] = []) {
    return buildLifecycleFieldRulesOverridePatch({
        stage: "qualification",
        required_rule_ids: required,
        recommended_rule_ids: recommended,
        existingMetadata: {},
    });
}

function oppRecord(metadata: Record<string, unknown>) {
    return {
        id: "opp-1",
        org_id: "org-1",
        status_key: "new_inquiry",
        primary_person_id: "person-1",
        _department_metadata: metadata,
        _primary_person: { first_name: "Jane", email: "jane@example.com" },
        _inquiry_children: [
            {
                id: "ocm-1",
                person_id: "child-1",
                first_name: "Kid",
                desired_program_type: null,
            },
        ],
    };
}

function blockedEffective(): EffectiveRequirementsResult {
    return {
        ok: false,
        blocking: [
            {
                field_key: ENFORCEABLE_RULE,
                label: "Child · Program Interest",
                severity: "required",
                reason: "Missing program.",
                source: "action",
                requirement_level: "enforced",
                rule_id: ENFORCEABLE_RULE,
            },
        ],
        recommended: [],
        autoPopulate: [],
        sourceSummary: { layoutRules: 0, actionRules: 1, transitionRules: 0, completionRules: 0 },
    };
}

describe("readinessConsumerWiring", () => {
    it("action preflight returns readiness while preserving legacy fields", () => {
        const effective = blockedEffective();
        const ui = buildActionPreflightUiPayload("schedule_tour", effective, {
            orgId: "org-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
        });
        expect(ui.effective_requirements).toBe(effective);
        expect(ui.completion_requirements.ok).toBe(false);
        expect(ui.readiness?.contract_version).toBe("1.0");
        expect(ui.readiness?.trigger).toBe("action_execute");
        expect(ui.blocking.length).toBeGreaterThan(0);
    });

    it("adminActionPreflightFailure attaches readiness on failure payload", () => {
        const failure = adminActionPreflightFailure("corr-1", "schedule_tour", blockedEffective(), {
            orgId: "org-1",
            opportunityId: "opp-1",
        });
        expect(failure.readiness?.primary_state).toBe("blocked");
        expect(failure.action_preflight?.readiness).toBe(failure.readiness);
        expect(failure.effective_requirements?.ok).toBe(false);
    });

    it("enforced missing field still blocks action execute via readiness", () => {
        const metadata = metadataQualification([ENFORCEABLE_RULE]);
        const effective = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            org_id: "org-1",
            action_key: "schedule_tour",
            trigger: "action_execute",
            lifecycle_stage: "qualification",
            record: oppRecord(metadata),
        });
        const ui = buildActionPreflightUiPayload("schedule_tour", effective, {
            orgId: "org-1",
            opportunityId: "opp-1",
        });
        expect(effective.ok).toBe(false);
        expect(ui.readiness?.ok).toBe(false);
        expect(ui.readiness?.primary_state).toBe("blocked");
    });

    it("required missing field does not block action execute in Phase 1", () => {
        const metadata = buildLifecycleFieldRulesOverridePatch({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
            existingMetadata: {},
            explicit_rule_levels_v1: {
                version: 1,
                by_rule_id: { [ENFORCEABLE_RULE]: "required" },
            },
        });
        const effective = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            trigger: "action_execute",
            lifecycle_stage: "qualification",
            record: oppRecord(metadata),
        });
        const ui = buildActionPreflightUiPayload("schedule_tour", effective, {
            orgId: "org-1",
            opportunityId: "opp-1",
        });
        expect(ui.readiness?.gaps.find((g) => g.requirement_id === ENFORCEABLE_RULE)?.level).toBe("required");
        expect(ui.readiness?.ok).toBe(true);
        expect(effective.ok).toBe(true);
    });

    it("recommended missing field does not block action execute", () => {
        const metadata = metadataQualification([], [ENFORCEABLE_RULE]);
        const effective = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            trigger: "action_execute",
            lifecycle_stage: "qualification",
            record: oppRecord(metadata),
        });
        const ui = buildActionPreflightUiPayload("schedule_tour", effective, {
            orgId: "org-1",
            opportunityId: "opp-1",
        });
        expect(ui.readiness?.gaps[0]?.level).toBe("recommended");
        expect(ui.readiness?.ok).toBe(true);
    });

    it("forms path maps missing requirements into readiness-compatible output", () => {
        const fields = websiteInquiryFormSchemaForCoverageExample();
        const contract = resolveFormsLifecycleRequirementContract({
            departmentId: "dept-123",
            stageKey: "lead",
            intent: "enrollment_lead",
        });
        const coverage = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract, {
            guardian_first_name: "Jordan",
            guardian_last_name: "Test",
        });
        const readiness = readinessResultFromFormsLifecycleCoverage({
            coverage,
            contract,
            trigger: "form_submit",
            orgId: "org-1",
            formId: "form-1",
            departmentId: "dept-123",
        });
        expect(readiness.contract_version).toBe("1.0");
        expect(readiness.trigger).toBe("form_submit");
        expect(readiness.gaps.length).toBeGreaterThan(0);
    });

    it("form submit blocks only enforced gaps", () => {
        const fields = websiteInquiryFormSchemaForCoverageExample();
        const contract = resolveFormsLifecycleRequirementContract({
            departmentId: "dept-123",
            stageKey: "lead",
            intent: "enrollment_lead",
        });
        const coverage = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract, {
            guardian_first_name: "Jordan",
            guardian_last_name: "Test",
        });
        const readiness = readinessResultFromFormsLifecycleCoverage({
            coverage,
            contract,
            trigger: "form_submit",
            orgId: "org-1",
            formId: "form-1",
        });
        expect(formsSubmitBlockedByReadiness(readiness)).toBe(true);
        expect(readiness.gaps.some((g) => g.blocking)).toBe(true);
    });

    it("form coverage reports levels without blocking", () => {
        const fields = websiteInquiryFormSchemaForCoverageExample();
        const contract = resolveFormsLifecycleRequirementContract({
            departmentId: "dept-123",
            stageKey: "lead",
            intent: "enrollment_lead",
        });
        const coverage = evaluateFormsLifecycleFieldCoverageFromFields(fields, contract);
        const readiness = readinessResultFromFormsLifecycleCoverage({
            coverage,
            contract,
            trigger: "form_coverage",
            orgId: "org-1",
            formId: "form-1",
        });
        expect(readiness.trigger).toBe("form_coverage");
        expect(readiness.gaps.every((g) => !g.blocking)).toBe(true);
        expect(readiness.ok).toBe(true);
    });

    it("status transition readiness blocks only enforced gaps", () => {
        const validation = buildRequirementValidationResult([
            makeRequirementViolation({
                entity_type: "opportunity",
                entity_id: "opp-1",
                label: "Status transition",
                requirement_type: "required_before_status_transition",
                blocking_level: "hard_block",
                missing_reason: "Not allowed.",
                context: { status_from: "a", status_to: "b" },
            }),
        ]);
        const readiness = readinessResultFromRequirementValidation(validation, {
            trigger: "status_transition",
            subject: { entity_type: "opportunity", entity_id: "opp-1" },
            context: { org_id: "org-1", status_from: "a", status_to: "b" },
        });
        expect(readiness.primary_state).toBe("blocked");
        expect(readiness.gaps[0]?.level).toBe("enforced");
    });

    it("drawer bootstrap readiness is optional and non-throwing", () => {
        const metadata = metadataQualification([ENFORCEABLE_RULE]);
        const readiness = tryEvaluateDrawerRecordReadiness({
            orgId: "org-1",
            opportunityId: "opp-1",
            entity: oppRecord(metadata),
            departmentId: "dept-1",
            departmentMetadata: metadata,
        });
        expect(readiness?.trigger).toBe("record_view");
        expect(readiness?.contract_version).toBe("1.0");

        expect(
            tryEvaluateDrawerRecordReadiness({
                orgId: "",
                opportunityId: "",
                entity: {},
            })
        ).toBeUndefined();
    });

    it("memoization returns stable result for same input", () => {
        const scope = createReadinessMemoScope();
        const metadata = metadataQualification([ENFORCEABLE_RULE]);
        const record = oppRecord(metadata);
        const input = {
            org_id: "org-1",
            trigger: "record_view" as const,
            subject: { entity_type: "opportunity", entity_id: "opp-1" },
            context: { department_id: "dept-1", operator_stage: "qualification" as const },
            status: "new_inquiry",
            record,
        };
        const a = evaluateOperationalReadinessMemoized(input, scope);
        const b = evaluateOperationalReadinessMemoized(input, scope);
        expect(a).toBe(b);
    });

    it("BOS preflight enrichment attaches readiness", () => {
        const rec = {
            version: 1,
            recommended_action: { key: "approve_enrollment", label: "Approve", action_family: "workflow" },
        } as unknown as OperationalRecommendationV1;
        const enriched = enrichOperationalRecommendationWithActionPreflight(rec, oppRecord({}));
        expect(enriched.recommended_action_preflight?.readiness?.contract_version).toBe("1.0");
        expect(enriched.recommended_action_preflight?.preflight.readiness).toBeDefined();
    });

    it("approve enrollment preflight remains blocked when classroom missing", () => {
        const effective = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: APPROVE_ENROLLMENT_ACTION_KEY,
            trigger: "action_execute",
            record: {
                id: "opp-1",
                status_key: "enrolling",
                _inquiry_children: [
                    {
                        id: "ocm-1",
                        desired_program_type: "infant",
                        program_room_cohort_key: "",
                    },
                ],
            },
        });
        const ui = buildActionPreflightUiPayload(APPROVE_ENROLLMENT_ACTION_KEY, effective, {
            orgId: "org-1",
            opportunityId: "opp-1",
        });
        expect(ui.readiness?.ok).toBe(false);
        expect(ui.effective_requirements.ok).toBe(false);
    });
});
