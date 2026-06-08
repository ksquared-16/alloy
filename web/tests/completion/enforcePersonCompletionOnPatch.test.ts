import { describe, expect, it } from "vitest";
import { isPersonEmployeePlacementOnlyPatch } from "@/lib/admin/personEmployeePlacementFields";
import { evaluateCompletionRequirements } from "@/lib/completion/evaluateCompletionRequirements";
import { evaluatePersonCompletionRequirements } from "@/lib/completion/evaluatePersonCompletionRequirements";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";

describe("isPersonEmployeePlacementOnlyPatch", () => {
    it("returns true for employee field patches only", () => {
        expect(isPersonEmployeePlacementOnlyPatch({ is_employee: true })).toBe(true);
        expect(isPersonEmployeePlacementOnlyPatch({ is_employee: false, employee_id: null })).toBe(true);
    });

    it("returns false when other person fields are included", () => {
        expect(isPersonEmployeePlacementOnlyPatch({ is_employee: true, first_name: "Pat" })).toBe(false);
    });
});

describe("employee PATCH completion isolation", () => {
    it("skips household primary contact block for employee-only save context", () => {
        const personCtx: CompletionEvaluationContext = {
            phase: "save",
            entity_type: "person",
            entity_id: "person_parent",
            values: { first_name: "Parent", last_name: "Williams", is_employee: true },
            related: {
                customer_id: "cust_williams",
                customer_persons: [{ role_type: "guardian", is_primary: true }],
                household_guardian_count: 1,
                household_has_primary_contact: false,
            },
        };

        const merged = evaluateCompletionRequirements(personCtx);
        expect(merged.ok).toBe(false);
        expect(merged.blocking.some((b) => b.label === "Primary contact")).toBe(true);

        if (isPersonEmployeePlacementOnlyPatch({ is_employee: true })) {
            const personOnly = evaluatePersonCompletionRequirements(personCtx);
            expect(personOnly.ok).toBe(true);
            expect(personOnly.blocking.some((b) => b.label === "Primary contact")).toBe(false);
        }
    });
});
