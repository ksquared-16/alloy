/**
 * Direct identity/section navigation — Context is configuration, collection is one hop.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    INITIAL_IDENTITY_DISCLOSURE_STATE,
    identityDisclosureDepthLabel,
    transitionIdentityDisclosure,
    backIdentityDisclosure,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";

const ROOT = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(ROOT, rel), "utf8");
}

describe("identity disclosure direct navigation", () => {
    it("View Household enters collection (context depth) and remains open until back", () => {
        const collection = transitionIdentityDisclosure(INITIAL_IDENTITY_DISCLOSURE_STATE, {
            type: "enter_context",
        });
        expect(collection.depth).toBe("context");
        expect(identityDisclosureDepthLabel(collection.depth)).toBe("Collection");
        expect(backIdentityDisclosure(collection).depth).toBe("summary");
    });

    it("enter_context can focus a section (e.g. emergency) without selecting a person", () => {
        const focused = transitionIdentityDisclosure(INITIAL_IDENTITY_DISCLOSURE_STATE, {
            type: "enter_context",
            sectionKey: "emergency_contacts",
        });
        expect(focused.depth).toBe("context");
        expect(focused.selectedSectionKey).toBe("emergency_contacts");
        expect(focused.selectedIdentityId).toBeUndefined();
    });

    it("parent click opens exact parent Details (from summary or collection)", () => {
        const details = transitionIdentityDisclosure(INITIAL_IDENTITY_DISCLOSURE_STATE, {
            type: "select_identity",
            identityId: "jordan",
            sectionKey: "primary_contact",
        });
        expect(details.depth).toBe("details");
        expect(details.selectedIdentityId).toBe("jordan");
        expect(details.selectedSectionKey).toBe("primary_contact");
    });

    it("specific emergency contact opens exact contact Details", () => {
        const details = transitionIdentityDisclosure(
            { depth: "context", selectedSectionKey: "emergency_contacts" },
            {
                type: "select_identity",
                identityId: "ec-1",
                sectionKey: "emergency_contacts",
            },
        );
        expect(details.selectedIdentityId).toBe("ec-1");
        expect(details.depth).toBe("details");
    });

    it("Household summary wires parent activate, section preview, and Children handoff", () => {
        const household = read("components/admin/focusPanel/cards/HouseholdCard.tsx");
        expect(household).toContain("handlePreviewGroup");
        expect(household).toContain("openChildrenSection");
        expect(household).toContain('requestFocus("children"');
        expect(household).toContain("onSelectIdentity");
        expect(household).toContain('(id) => onSelectIdentity(id, "primary_contact")');
        expect(household).toContain("focusedSectionKey={disclosure.selectedSectionKey}");
    });

    it("Children summary rows are activatable and View Children opens collection", () => {
        const children = read("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(children).toContain("selectChildIdentity");
        expect(children).toContain("View children →");
        expect(children).toContain("onActivate={");
        expect(children).toMatch(/ChildSummaryRow[\s\S]*onActivate/);
    });

    it("collection defaults to Summary + Context Facts (not Details)", () => {
        const collection = read("components/admin/focusPanel/identity/IdentityCollectionContext.tsx");
        expect(collection).toContain("collectionSummaryOnly = false");
        expect(collection).toContain('depth={collectionSummaryOnly ? "summary" : "context"}');
        expect(collection).not.toContain('depth="details"');
    });

    it("empty Context Facts do not require a separately named Context screen", () => {
        const state = read("lib/adminV2/runtime/focusPanel/identity/identityDisclosureState.ts");
        expect(state).toMatch(/not a separately[\s\S]*mandatory[\s\S]*runtime screen/);
        expect(identityDisclosureDepthLabel("context")).toBe("Collection");
    });
});
