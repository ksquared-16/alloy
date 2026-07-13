import { describe, expect, it, beforeEach } from "vitest";

import { defaultNestedSurfaceConfig, HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { resolveHouseholdContactSectionKey } from "@/lib/adminV2/runtime/focusPanel/household/identityRelationshipSections";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

describe("configurable household relationship sections", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("assigns parent roles to other_parent_guardian before additional contacts", () => {
        const config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const assigned = new Set<string>();
        const parent = resolveHouseholdContactSectionKey({
            config,
            roleType: "parent",
            isPrimary: false,
            assignedPersonIds: assigned,
            personId: "p1",
        });
        expect(parent).toBe("other_parent_guardian");
        assigned.add("p1");
        const duplicate = resolveHouseholdContactSectionKey({
            config,
            roleType: "contact",
            isPrimary: false,
            assignedPersonIds: assigned,
            personId: "p1",
        });
        expect(duplicate).toBe("");
    });

    it("routes emergency roles to emergency_contacts section", () => {
        const config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const section = resolveHouseholdContactSectionKey({
            config,
            roleType: "emergency_contact",
            isPrimary: false,
            assignedPersonIds: new Set(),
            personId: "e1",
        });
        expect(section).toBe("emergency_contacts");
    });
});
