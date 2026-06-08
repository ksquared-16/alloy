import { describe, expect, it } from "vitest";
import { mergeFieldDefinitionPoliciesFromBody } from "@/lib/fields/fieldDefinitionPolicyWrite";

describe("mergeFieldDefinitionPoliciesFromBody", () => {
    it("merges is_required only without error", () => {
        const r = mergeFieldDefinitionPoliciesFromBody({ is_required: true });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.is_required).toBe(true);
            expect(r.requirement_policy?.mode).toBe("required");
        }
    });

    it("rejects invalid interaction_policy", () => {
        const r = mergeFieldDefinitionPoliciesFromBody({
            interaction_policy: { version: 2, editability_mode: "editable" },
        });
        expect(r.ok).toBe(false);
    });
});
