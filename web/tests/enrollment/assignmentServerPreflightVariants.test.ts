import { describe, expect, it } from "vitest";
import { evaluateFieldRulesForStage } from "@/lib/lifecycle/lifecycleFieldRuleEvaluator";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";

describe("assignment requirement preflight — config variants (server evaluator)", () => {
    const baseChild = {
        id: "ocm-1",
        customer_member_id: "cm-a",
        person_id: "p-a",
        location_id: "site-1",
        program_category_id: "prog-1",
        schedule_type: "full_day",
        start_date: "2026-09-01",
        requested_days_per_week: 3,
        weekdays: [1, 2, 3],
        tuition_plan_id: "rate-1",
    };

    function makeCtx(children: Record<string, unknown>[]): CompletionEvaluationContext {
        return {
            phase: "status_change",
            entity_type: "opportunity",
            entity_id: "opp-1",
            org_id: "org-1",
            status_from: "enrollment",
            status_to: "enrolled",
            values: {},
            related: { inquiry_children: children as never },
        };
    }

    it("Tenant A — Room + quote acceptance block stage exit when missing", () => {
        const ctx = makeCtx([{ ...baseChild, program_room_cohort_key: null, quote_accepted: false }]);
        const violations = evaluateFieldRulesForStage(ctx, "enrollment", {
            required_rule_ids: ["child:classroom", "child:quote_accepted", "child:tuition_plan"],
            recommended_rule_ids: [],
        });
        const keys = violations.map((v) => v.field_key).sort();
        expect(keys).toContain("program_room_cohort_key");
        expect(keys).toContain("quote_accepted");
        expect(keys).not.toContain("tuition_plan_id");
    });

    it("Tenant B — same runtime, neither Room nor quote acceptance configured → no those blockers", () => {
        const ctx = makeCtx([{ ...baseChild, program_room_cohort_key: null, quote_accepted: false }]);
        const violations = evaluateFieldRulesForStage(ctx, "enrollment", {
            required_rule_ids: ["child:tuition_plan", "child:requested_days_per_week"],
            recommended_rule_ids: [],
        });
        const keys = violations.map((v) => v.field_key);
        expect(keys).not.toContain("program_room_cohort_key");
        expect(keys).not.toContain("quote_accepted");
        expect(keys).not.toContain("tuition_plan_id");
        expect(keys).not.toContain("requested_days_per_week");
    });

    it("multi-child isolation — only the incomplete child is reported", () => {
        const ctx = makeCtx([
            { ...baseChild, id: "ocm-a", customer_member_id: "cm-a", person_id: "p-a", requested_days_per_week: 3 },
            {
                ...baseChild,
                id: "ocm-b",
                customer_member_id: "cm-b",
                person_id: "p-b",
                requested_days_per_week: null,
            },
        ]);
        const violations = evaluateFieldRulesForStage(ctx, "enrollment", {
            required_rule_ids: ["child:requested_days_per_week"],
            recommended_rule_ids: [],
        });
        expect(violations).toHaveLength(1);
        expect(violations[0]?.entity_id).toBe("p-b");
    });
});
