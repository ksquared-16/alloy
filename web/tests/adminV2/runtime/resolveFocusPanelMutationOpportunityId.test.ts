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

    it("resolves child Waitlist process-instance Attention to the family opportunity", () => {
        // Live defect: What's Next Send Tour Invitation used process_instance id as
        // opportunityId → opportunities lookup 404 → "This record is no longer available."
        const processInstanceId = "93722453-33e9-4207-8774-8931ee2c855d";
        const familyOpportunityId = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
        expect(
            resolveFocusPanelMutationOpportunityId({
                subjectId: processInstanceId,
                grain: "child",
                truth: {
                    id: familyOpportunityId,
                    "child.family_opportunity_id": familyOpportunityId,
                },
            }),
        ).toBe(familyOpportunityId);
    });
});

describe("CurrentWorkCard keys family opportunity for capabilities", () => {
    it("uses resolveFocusPanelMutationOpportunityId instead of raw subject.id", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const src = readFileSync(
            resolve(__dirname, "../../../components/admin/focusPanel/cards/CurrentWorkCard.tsx"),
            "utf8",
        );
        expect(src).toContain("resolveFocusPanelMutationOpportunityId");
        expect(src).not.toMatch(/const opportunityId = context\.subject\.id;/);
    });
});
