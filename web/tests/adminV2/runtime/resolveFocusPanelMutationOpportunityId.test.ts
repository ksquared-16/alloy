import { describe, expect, it } from "vitest";
import { resolveFocusPanelMutationOpportunityId } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

describe("resolveFocusPanelMutationOpportunityId", () => {
    it("uses Attention subject id for family grain", () => {
        expect(
            resolveFocusPanelMutationOpportunityId({
                subjectId: "opp-family",
                grain: "family",
                truth: { id: "opp-family" },
            }),
        ).toBe("opp-family");
    });

    it("prefers child.family_opportunity_id when Attention is the child", () => {
        expect(
            resolveFocusPanelMutationOpportunityId({
                subjectId: "child-member-1",
                grain: "child",
                truth: {
                    id: "opp-family",
                    "child.family_opportunity_id": "opp-family",
                    "child.customer_member_id": "child-member-1",
                },
            }),
        ).toBe("opp-family");
    });

    it("falls back to settlement truth.id when family binding is missing", () => {
        expect(
            resolveFocusPanelMutationOpportunityId({
                subjectId: "child-member-1",
                grain: "child",
                truth: { id: "opp-family" },
            }),
        ).toBe("opp-family");
    });

    it("does not treat the child Attention id as the mutation opportunity", () => {
        const childId = "child-member-1";
        const resolved = resolveFocusPanelMutationOpportunityId({
            subjectId: childId,
            grain: "child",
            truth: {
                id: "opp-family",
                "child.family_opportunity_id": "opp-family",
            },
        });
        expect(resolved).not.toBe(childId);
        expect(resolved).toBe("opp-family");
    });
});
