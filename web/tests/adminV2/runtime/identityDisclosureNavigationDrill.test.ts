import { describe, expect, it } from "vitest";

import { transitionIdentityDisclosure } from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";

describe("identity direct drill navigation", () => {
    it("selecting Parent 1 opens that identity at Details depth", () => {
        const next = transitionIdentityDisclosure(
            { depth: "context" },
            { type: "select_identity", identityId: "parent-1", sectionKey: "primary_contact" },
        );
        expect(next.depth).toBe("details");
        expect(next.selectedIdentityId).toBe("parent-1");
        expect(next.selectedSectionKey).toBe("primary_contact");
    });

    it("selecting Parent 2 opens the other parent record", () => {
        const next = transitionIdentityDisclosure(
            { depth: "context" },
            { type: "select_identity", identityId: "parent-2", sectionKey: "other_parent_guardian" },
        );
        expect(next.selectedIdentityId).toBe("parent-2");
    });

    it("back from Details returns to Context without selected identity", () => {
        const details = transitionIdentityDisclosure(
            { depth: "context" },
            { type: "select_identity", identityId: "child-1", sectionKey: "children" },
        );
        const back = transitionIdentityDisclosure(details, { type: "back" });
        expect(back.depth).toBe("context");
        expect(back.selectedIdentityId).toBeUndefined();
    });
});
