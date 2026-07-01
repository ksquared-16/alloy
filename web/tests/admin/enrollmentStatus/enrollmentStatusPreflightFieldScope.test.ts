import { describe, expect, it } from "vitest";
import { buildCompletionContextFromRecord } from "@/lib/completion/evaluateCompletionRequirements";
import { buildLifecycleFieldRulesOverridePatch } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { evaluateLifecycleActionRequirements } from "@/lib/completion/lifecycleActionRequirementCatalog";
import { filterChildrenToScope } from "@/lib/admin/enrollmentStatus/evaluateEnrollmentStatusTransitionPreflight";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";
import type { EnrollmentStatusTransitionScope } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";

const CHILD_FIELD_KEYS = new Set([
    "desired_program_category_id",
    "desired_program_type",
    "desired_schedule_type",
    "desired_start_date",
]);

const JONNY = {
    id: "ocm-jonny",
    person_id: "person-jonny",
    desired_program_category_id: "cat-infant",
    desired_schedule_type: "full_time",
    desired_start_date: "2026-09-01",
};

const SIBLING = {
    id: "ocm-sibling",
    person_id: "person-sibling",
    desired_program_category_id: null,
    desired_schedule_type: null,
    desired_start_date: null,
};

const waitlistRequiresIntakeFields = buildLifecycleFieldRulesOverridePatch({
    stage: "waitlist",
    required_rule_ids: ["child:program_interest", "child:desired_schedule", "child:desired_start_date"],
    recommended_rule_ids: [],
    existingMetadata: {},
});

function moveToWaitlistCtx(children: Array<Record<string, unknown>>): CompletionEvaluationContext {
    return {
        phase: "action",
        entity_type: "opportunity",
        entity_id: "opp-1",
        action_key: "move_to_waitlist",
        values: {},
        related: {
            department_metadata: waitlistRequiresIntakeFields,
            inquiry_children: children,
        },
    };
}

function childFieldBlocks(result: { blocking: Array<{ field_key?: string }> }): string[] {
    return result.blocking
        .map((v) => v.field_key)
        .filter((k): k is string => typeof k === "string" && CHILD_FIELD_KEYS.has(k));
}

describe("enrollment preflight child field scope", () => {
    it("preserves canonical child fields through related-context projection", () => {
        const ctx = buildCompletionContextFromRecord({
            entity_type: "opportunity",
            entity_id: "opp-1",
            phase: "action",
            record: {
                _inquiry_children: [{
                    id: "ocm-kai",
                    desired_program_category_id: "cat-infant",
                    desired_program_type: "infant",
                    desired_schedule_type: "full_time",
                    desired_start_date: "2026-09-01",
                }],
            },
        });
        const child = ctx.related?.inquiry_children?.[0];
        expect(child?.desired_program_category_id).toBe("cat-infant");
        expect(child?.desired_program_type).toBe("infant");
        expect(child?.desired_schedule_type).toBe("full_time");
        expect(child?.desired_start_date).toBe("2026-09-01");
    });

    it("scopes children to the active OCM for child grain, keeps all for case grain", () => {
        const all = [JONNY, SIBLING];
        const childScope: EnrollmentStatusTransitionScope = {
            grain: "child",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: "ocm-jonny",
        };
        const caseScope: EnrollmentStatusTransitionScope = { grain: "case", opportunityId: "opp-1" };

        expect(filterChildrenToScope(all, childScope).map((c) => c.id)).toEqual(["ocm-jonny"]);
        expect(filterChildrenToScope(all, caseScope).map((c) => c.id)).toEqual(["ocm-jonny", "ocm-sibling"]);
    });

    it("does not block Program/Schedule/Start when the selected child has them filled", () => {
        const scoped = filterChildrenToScope([JONNY, SIBLING], {
            grain: "child",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: "ocm-jonny",
        });
        const result = evaluateLifecycleActionRequirements(moveToWaitlistCtx(scoped));
        expect(childFieldBlocks(result)).toHaveLength(0);
    });

    it("sibling's missing fields do not block when moving only the selected child", () => {
        const jonnyScoped = filterChildrenToScope([JONNY, SIBLING], {
            grain: "child",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: "ocm-jonny",
        });
        const siblingScoped = filterChildrenToScope([JONNY, SIBLING], {
            grain: "child",
            opportunityId: "opp-1",
            opportunityCustomerMemberId: "ocm-sibling",
        });

        // Moving Jonny only: clean.
        expect(childFieldBlocks(evaluateLifecycleActionRequirements(moveToWaitlistCtx(jonnyScoped)))).toHaveLength(0);
        // The sibling row genuinely lacks the fields → blocks only when the sibling is the subject.
        const siblingBlocks = childFieldBlocks(evaluateLifecycleActionRequirements(moveToWaitlistCtx(siblingScoped)));
        expect(siblingBlocks).toContain("desired_program_category_id");
        expect(siblingBlocks).toContain("desired_schedule_type");
        expect(siblingBlocks).toContain("desired_start_date");
    });

    it("case grain (whole family) surfaces an incomplete sibling", () => {
        const all = filterChildrenToScope([JONNY, SIBLING], { grain: "case", opportunityId: "opp-1" });
        const blocks = childFieldBlocks(evaluateLifecycleActionRequirements(moveToWaitlistCtx(all)));
        expect(blocks).toContain("desired_program_category_id");
    });
});
