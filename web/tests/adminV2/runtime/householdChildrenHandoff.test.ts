import { describe, expect, it } from "vitest";

import { householdAuthoringGroupKey } from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import { FOCUS_PANEL_CARD_NESTED_SURFACE } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";
import { transitionIdentityDisclosure } from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";

describe("Household Children configuration handoff", () => {
    it("maps children section to children surface id for composer navigation", () => {
        expect(FOCUS_PANEL_CARD_NESTED_SURFACE.children).toBe("children_surface");
        expect(householdAuthoringGroupKey("children")).toBe("children");
    });

    it("household child click resolves exact child details depth", () => {
        const next = transitionIdentityDisclosure(
            { depth: "context" },
            { type: "select_identity", identityId: "child-42", sectionKey: "children" },
        );
        expect(next.depth).toBe("details");
        expect(next.selectedIdentityId).toBe("child-42");
    });
});
