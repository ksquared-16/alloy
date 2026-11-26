/**
 * Shared identity disclosure navigation — Household and Children must use the same
 * transition helpers and keep Context stable until intentional back navigation.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    backIdentityDisclosure,
    identityDisclosureCoordinationLevel,
    INITIAL_IDENTITY_DISCLOSURE_STATE,
    transitionIdentityDisclosure,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";

const ROOT = join(process.cwd());

function readCard(name: string): string {
    return readFileSync(join(ROOT, "components/admin/focusPanel/cards", name), "utf8");
}

describe("identity disclosure navigation parity", () => {
    it("View Household/Children enters Context and remains until back", () => {
        const context = transitionIdentityDisclosure(INITIAL_IDENTITY_DISCLOSURE_STATE, {
            type: "enter_context",
        });
        expect(context.depth).toBe("context");
        expect(backIdentityDisclosure(context).depth).toBe("summary");
        // No transition from context back to summary without explicit back action
        expect(
            transitionIdentityDisclosure(context, {
                type: "select_identity",
                identityId: "p-1",
                sectionKey: "primary_contact",
            }).depth,
        ).toBe("details");
    });

    it("Collection (context) uses shared centered focus elevation", () => {
        const context = transitionIdentityDisclosure(INITIAL_IDENTITY_DISCLOSURE_STATE, {
            type: "enter_context",
        });
        expect(identityDisclosureCoordinationLevel({ depth: context.depth })).toBe("focused");
    });

    it("selecting identity transitions Context to Details for parent and child flows", () => {
        const context = transitionIdentityDisclosure(INITIAL_IDENTITY_DISCLOSURE_STATE, {
            type: "enter_context",
        });
        const parentDetails = transitionIdentityDisclosure(context, {
            type: "select_identity",
            identityId: "p-sarah",
            sectionKey: "primary_contact",
        });
        expect(parentDetails.depth).toBe("details");
        expect(identityDisclosureCoordinationLevel({ depth: parentDetails.depth })).toBe("focused");

        const childDetails = transitionIdentityDisclosure(context, {
            type: "select_identity",
            identityId: "child-1",
            sectionKey: "roster",
        });
        expect(childDetails.depth).toBe("details");
    });

    it("Household and Children cards share identityDisclosureCoordinationLevel", () => {
        const household = readCard("HouseholdCard.tsx");
        const children = readCard("ChildrenCard.tsx");
        expect(household).toContain("identityDisclosureCoordinationLevel");
        expect(children).toContain("identityDisclosureCoordinationLevel");
        expect(household).not.toMatch(/disclosure\.depth !== "summary" \? "focused"/);
        expect(children).not.toMatch(/disclosure\.depth !== "summary" \? "focused"/);
    });

    it("preview mode skips compose reset effects in both cards", () => {
        const household = readCard("HouseholdCard.tsx");
        const children = readCard("ChildrenCard.tsx");
        expect(household).toContain('composeCanvasMode === "preview"');
        expect(children).toContain('composeCanvasMode === "preview"');
    });

    it("useSyncBuilderDisclosure does not reset preview-owned disclosure", () => {
        const sync = readFileSync(
            join(ROOT, "lib/adminV2/runtime/focusPanel/identity/useSyncBuilderDisclosure.ts"),
            "utf8",
        );
        expect(sync).toContain('composeCanvasMode === "preview"');
    });
});
