import { describe, expect, it } from "vitest";
import { buildLifecycleFieldRulesOverridePatch } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { evaluateLifecycleActionRequirements } from "@/lib/completion/lifecycleActionRequirementCatalog";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";
import {
    evaluateFieldRulesForStage,
    extractPrimaryPersonSnapshot,
} from "@/lib/lifecycle/lifecycleFieldRuleEvaluator";

describe("lifecycleFieldRuleEvaluator", () => {
    it("extractPrimaryPersonSnapshot reads related primary_person", () => {
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            values: {},
            related: {
                primary_person: {
                    first_name: "Jane",
                    email: null,
                    phone: "555-0100",
                },
            },
        };
        const snap = extractPrimaryPersonSnapshot(ctx);
        expect(snap.first_name).toBe("Jane");
        expect(snap.phone).toBe("555-0100");
    });

    it("blocks when person email required and missing", () => {
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            status_from: "new_inquiry",
            values: { primary_person_id: "p1" },
            related: {
                primary_person: {
                    first_name: "Jane",
                    last_name: "Doe",
                    email: null,
                    phone: null,
                },
                department_metadata: buildLifecycleFieldRulesOverridePatch({
                    stage: "lead",
                    required_rule_ids: ["person:first_name", "person:email"],
                    recommended_rule_ids: [],
                    existingMetadata: {},
                }),
            },
        };
        const violations = evaluateFieldRulesForStage(ctx, "lead", {
            required_rule_ids: ["person:first_name", "person:email"],
            recommended_rule_ids: [],
        });
        expect(violations.some((v) => v.label.includes("Email"))).toBe(true);
    });

    it("evaluateLifecycleActionRequirements respects lead field_rules on schedule_tour", () => {
        const metadata = buildLifecycleFieldRulesOverridePatch({
            stage: "lead",
            required_rule_ids: ["person:email"],
            recommended_rule_ids: [],
            existingMetadata: {},
        });
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            status_from: "new_inquiry",
            values: { primary_person_id: "p1" },
            related: {
                primary_person: { first_name: "Jane", email: null, phone: null },
                department_metadata: metadata,
                inquiry_children: [
                    {
                        id: "ocm-1",
                        program_category_id: "cat-infant",
                        schedule_type: "full_time",
                        start_date: "2026-09-01",
                    },
                ],
            },
        };
        const result = evaluateLifecycleActionRequirements(ctx);
        expect(result.ok).toBe(false);
        expect(result.blocking.some((v) => v.label.includes("Email"))).toBe(true);

        const okCtx: CompletionEvaluationContext = {
            ...ctx,
            related: {
                ...ctx.related,
                primary_person: { first_name: "Jane", email: "jane@example.com", phone: null },
            },
        };
        const ok = evaluateLifecycleActionRequirements(okCtx);
        expect(ok.blocking.some((v) => v.label.includes("Email"))).toBe(false);
    });
});
