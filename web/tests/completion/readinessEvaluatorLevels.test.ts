import { describe, expect, it } from "vitest";
import { buildLifecycleFieldRulesOverridePatch } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { evaluateOperationalReadiness } from "@/lib/completion/evaluateOperationalReadiness";
import { evaluateEffectiveRequirements } from "@/lib/completion/evaluateEffectiveRequirements";
import { mapEffectiveRequirementsToReadinessResult } from "@/lib/completion/readinessMappers";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

const ENFORCEABLE_RULE = "child:program_interest";
const NON_ENFORCEABLE_RULE = "opportunity:tour_date";
const RECOMMENDED_RULE = "child:program_interest";

const SUBJECT = { entity_type: "opportunity", entity_id: "opp-1" };

function metadataWithFieldRules(input: {
    stage: LifecycleOperatorStage;
    required_rule_ids: string[];
    recommended_rule_ids: string[];
    rule_levels_v1?: {
        version: 1;
        by_rule_id: Record<string, "recommended" | "required" | "enforced">;
    };
}) {
    return buildLifecycleFieldRulesOverridePatch({
        stage: input.stage,
        required_rule_ids: input.required_rule_ids,
        recommended_rule_ids: input.recommended_rule_ids,
        existingMetadata: {},
        explicit_rule_levels_v1: input.rule_levels_v1 ?? null,
    });
}

function baseRecord(metadata: Record<string, unknown>, stage: LifecycleOperatorStage) {
    const status_key = stage === "tour" ? "tour_scheduled" : "new_inquiry";
    return {
        id: "opp-1",
        status_key,
        primary_person_id: "person-1",
        _department_metadata: metadata,
        _primary_person: {
            first_name: "Jane",
            last_name: "Doe",
            email: "jane@example.com",
            phone: null,
        },
        _inquiry_children: [
            {
                id: "ocm-1",
                person_id: "child-1",
                first_name: "Kid",
                desired_program_type: null,
                desired_schedule_type: null,
                desired_start_date: null,
            },
        ],
        metadata: {},
    };
}

function readinessForTrigger(
    trigger: "record_view" | "action_execute" | "form_submit" | "status_transition",
    metadata: Record<string, unknown>,
    stage: LifecycleOperatorStage,
    extra?: { action_key?: string }
) {
    const record = baseRecord(metadata, stage);
    return evaluateOperationalReadiness({
        org_id: "org-1",
        trigger,
        subject: SUBJECT,
        context: { department_id: "dept-1", operator_stage: stage },
        status: record.status_key,
        record,
        action_key: extra?.action_key,
    });
}

describe("readinessEvaluatorLevels", () => {
    it("legacy recommended → recommended gap", () => {
        const metadata = metadataWithFieldRules({
            stage: "qualification",
            required_rule_ids: [],
            recommended_rule_ids: [RECOMMENDED_RULE],
        });
        const readiness = readinessForTrigger("record_view", metadata, "qualification");
        const gap = readiness.gaps.find((g) => g.requirement_id === RECOMMENDED_RULE);
        expect(gap?.level).toBe("recommended");
        expect(gap?.blocking).toBe(false);
        expect(readiness.primary_state).toBe("needs_information");
        expect(readiness.ok).toBe(true);
    });

    it("legacy required + enforceable → enforced gap", () => {
        const metadata = metadataWithFieldRules({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        });
        const readiness = readinessForTrigger("record_view", metadata, "qualification");
        const gap = readiness.gaps.find((g) => g.requirement_id === ENFORCEABLE_RULE);
        expect(gap?.level).toBe("enforced");
        expect(gap?.blocking).toBe(false);
        expect(readiness.primary_state).toBe("needs_information");
    });

    it("legacy required + non-enforceable → required gap", () => {
        const metadata = metadataWithFieldRules({
            stage: "tour",
            required_rule_ids: [NON_ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        });
        const readiness = readinessForTrigger("record_view", metadata, "tour");
        const gap = readiness.gaps.find((g) => g.requirement_id === NON_ENFORCEABLE_RULE);
        expect(gap?.level).toBe("required");
        expect(gap?.blocking).toBe(false);
        expect(readiness.primary_state).toBe("needs_information");
    });

    it("explicit recommended overrides legacy required", () => {
        const metadata = metadataWithFieldRules({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
            rule_levels_v1: {
                version: 1,
                by_rule_id: { [ENFORCEABLE_RULE]: "recommended" },
            },
        });
        const readiness = readinessForTrigger("action_execute", metadata, "qualification", {
            action_key: "schedule_tour",
        });
        const gap = readiness.gaps.find((g) => g.requirement_id === ENFORCEABLE_RULE);
        expect(gap?.level).toBe("recommended");
        expect(gap?.blocking).toBe(false);
        expect(readiness.ok).toBe(true);
    });

    it("explicit required overrides legacy enforced derivation", () => {
        const metadata = metadataWithFieldRules({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
            rule_levels_v1: {
                version: 1,
                by_rule_id: { [ENFORCEABLE_RULE]: "required" },
            },
        });
        const readiness = readinessForTrigger("action_execute", metadata, "qualification", {
            action_key: "schedule_tour",
        });
        const gap = readiness.gaps.find((g) => g.requirement_id === ENFORCEABLE_RULE);
        expect(gap?.level).toBe("required");
        expect(gap?.blocking).toBe(false);
        expect(readiness.ok).toBe(true);
    });

    it("explicit enforced caps to required when not enforceable", () => {
        const metadata = metadataWithFieldRules({
            stage: "tour",
            required_rule_ids: [NON_ENFORCEABLE_RULE],
            recommended_rule_ids: [],
            rule_levels_v1: {
                version: 1,
                by_rule_id: { [NON_ENFORCEABLE_RULE]: "enforced" },
            },
        });
        const readiness = readinessForTrigger("action_execute", metadata, "tour", {
            action_key: "record_tour_outcome",
        });
        const gap = readiness.gaps.find((g) => g.requirement_id === NON_ENFORCEABLE_RULE);
        expect(gap?.level).toBe("required");
        expect(gap?.blocking).toBe(false);
    });

    it("enforced missing blocks on action_execute", () => {
        const metadata = metadataWithFieldRules({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        });
        const readiness = readinessForTrigger("action_execute", metadata, "qualification", {
            action_key: "schedule_tour",
        });
        const gap = readiness.gaps.find((g) => g.requirement_id === ENFORCEABLE_RULE);
        expect(gap?.level).toBe("enforced");
        expect(gap?.blocking).toBe(true);
        expect(readiness.primary_state).toBe("blocked");
        expect(readiness.ok).toBe(false);
    });

    it("enforced missing blocks on form_submit", () => {
        const metadata = metadataWithFieldRules({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        });
        const effective = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            trigger: "bos_scan",
            lifecycle_stage: "qualification",
            status: "new_inquiry",
            record: baseRecord(metadata, "qualification"),
        });
        const readiness = mapEffectiveRequirementsToReadinessResult(effective, {
            trigger: "form_submit",
            subject: SUBJECT,
            context: { org_id: "org-1", operator_stage: "qualification" },
        });
        const gap = readiness.gaps.find((g) => g.requirement_id === ENFORCEABLE_RULE);
        expect(gap?.level).toBe("enforced");
        expect(gap?.blocking).toBe(true);
        expect(readiness.primary_state).toBe("blocked");
    });

    it("enforced missing blocks on status_transition", () => {
        const metadata = metadataWithFieldRules({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        });
        const effective = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            trigger: "bos_scan",
            lifecycle_stage: "qualification",
            status: "new_inquiry",
            record: baseRecord(metadata, "qualification"),
        });
        const readiness = mapEffectiveRequirementsToReadinessResult(effective, {
            trigger: "status_transition",
            subject: SUBJECT,
            context: { org_id: "org-1", operator_stage: "qualification" },
        });
        const gap = readiness.gaps.find((g) => g.requirement_id === ENFORCEABLE_RULE);
        expect(gap?.level).toBe("enforced");
        expect(gap?.blocking).toBe(true);
    });

    it("enforced missing does not block on record_view", () => {
        const metadata = metadataWithFieldRules({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        });
        const readiness = readinessForTrigger("record_view", metadata, "qualification");
        const gap = readiness.gaps.find((g) => g.requirement_id === ENFORCEABLE_RULE);
        expect(gap?.level).toBe("enforced");
        expect(gap?.blocking).toBe(false);
        expect(readiness.primary_state).toBe("needs_information");
        expect(readiness.ok).toBe(true);
    });

    it("required missing never blocks in Phase 1", () => {
        const tourMetadata = metadataWithFieldRules({
            stage: "tour",
            required_rule_ids: [NON_ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        });

        const recordView = readinessForTrigger("record_view", tourMetadata, "tour");
        expect(recordView.gaps.find((g) => g.requirement_id === NON_ENFORCEABLE_RULE)?.blocking).toBe(false);
        expect(recordView.ok).toBe(true);

        const actionExecute = readinessForTrigger("action_execute", tourMetadata, "tour", {
            action_key: "record_tour_outcome",
        });
        const actionGap = actionExecute.gaps.find((g) => g.requirement_id === NON_ENFORCEABLE_RULE);
        expect(actionGap?.level).toBe("required");
        expect(actionGap?.blocking).toBe(false);

        const requiredLevelMetadata = metadataWithFieldRules({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
            rule_levels_v1: {
                version: 1,
                by_rule_id: { [ENFORCEABLE_RULE]: "required" },
            },
        });
        const effective = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            trigger: "bos_scan",
            lifecycle_stage: "qualification",
            status: "new_inquiry",
            record: baseRecord(requiredLevelMetadata, "qualification"),
        });
        for (const trigger of ["form_submit", "status_transition"] as const) {
            const readiness = mapEffectiveRequirementsToReadinessResult(effective, {
                trigger,
                subject: SUBJECT,
                context: { org_id: "org-1", operator_stage: "qualification" },
            });
            const gap = readiness.gaps.find((g) => g.requirement_id === ENFORCEABLE_RULE);
            expect(gap?.level).toBe("required");
            expect(gap?.blocking).toBe(false);
            expect(readiness.ok).toBe(true);
        }
    });

    it("legacy configs without rule_levels_v1 preserve enforceable blocking on action_execute", () => {
        const metadata = metadataWithFieldRules({
            stage: "qualification",
            required_rule_ids: [ENFORCEABLE_RULE],
            recommended_rule_ids: [],
        });
        const effective = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            trigger: "action_execute",
            lifecycle_stage: "qualification",
            status: "new_inquiry",
            record: baseRecord(metadata, "qualification"),
        });
        expect(effective.ok).toBe(false);
        expect(effective.blocking.some((v) => v.rule_id === ENFORCEABLE_RULE)).toBe(true);
        expect(effective.blocking.find((v) => v.rule_id === ENFORCEABLE_RULE)?.requirement_level).toBe(
            "enforced"
        );
    });
});
