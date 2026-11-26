import { describe, expect, it, vi, beforeEach } from "vitest";

import { resolveWarmDrawerTargetsFromOpportunityRecord } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveWarmDrawerTargetsFromOpportunityRecord";
import { visibilityScopeForComposeDepth } from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmComposeDepth";
import { isDrawerModelSwapEligible } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";

describe("resolveWarmDrawerTargetsFromOpportunityRecord", () => {
    beforeEach(() => {
        vi.spyOn(console, "info").mockImplementation(() => {});
    });

    it("resolves primary from _primary_person_id and children from _inquiry_children", () => {
        const targets = resolveWarmDrawerTargetsFromOpportunityRecord({
            id: "opp-1",
            _primary_person_id: "parent-1",
            _inquiry_children: [{ person_id: "child-1", customer_member_id: "cm-1" }],
        });
        const child = targets.find((t) => t.personId === "child-1");
        const parent = targets.find((t) => t.personId === "parent-1");
        expect(child?.openSource).toBe("opportunity_inquiry_child");
        expect(child?.presentationEmphasis).toBe("child_lifecycle");
        expect(parent?.openSource).toBe("opportunity_primary_contact");
        expect(parent?.presentationEmphasis).toBe("guardian_communication");
    });

    it("resolves primary from _identity.primary_person", () => {
        const targets = resolveWarmDrawerTargetsFromOpportunityRecord({
            id: "opp-2",
            _identity: { primary_person: { id: "p-identity" } },
        });
        expect(targets.some((t) => t.personId === "p-identity")).toBe(true);
    });

    it("resolves inquiry children from metadata.inquiry_children", () => {
        const targets = resolveWarmDrawerTargetsFromOpportunityRecord({
            id: "opp-3",
            metadata: { inquiry_children: [{ person_id: "child-meta" }] },
        });
        expect(targets.some((t) => t.personId === "child-meta")).toBe(true);
    });
});

describe("personDrawerVmComposeDepth", () => {
    it("maps first_paint to reduced visibility scope", () => {
        expect(visibilityScopeForComposeDepth("first_paint")).toBe("first_paint");
        expect(visibilityScopeForComposeDepth("full")).toBe("full");
    });
});

describe("drawer model swap eligibility", () => {
    it("allows opportunity to person swap", () => {
        expect(isDrawerModelSwapEligible("opportunities", "opp-1", "persons", "p-1")).toBe(true);
    });
});
