import { describe, expect, it, beforeEach } from "vitest";

import {
    defaultNestedSurfaceConfig,
    removeFieldFromNestedGroup,
    addFieldToNestedGroup,
    reconcileNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
    identityConfigurationFieldKeys,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

describe("identity composer field state correctness", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("removing a default-seeded detail field persists as explicit empty tier keys", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.date_of_birth", { tier: "details" });
        config = removeFieldFromNestedGroup(config, "contact_edit", "person.date_of_birth", { tier: "details" });
        const group = config.groups.find((g) => g.key === "contact_edit");
        expect(group?.expandedFieldKeys).toEqual([]);
        expect(
            identityConfigurationFieldKeys(config, "contact_edit", "details"),
        ).toEqual([]);
    });

    it("save/reload reconcile preserves explicit empty expandedFieldKeys", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.date_of_birth", { tier: "details" });
        config = removeFieldFromNestedGroup(config, "contact_edit", "person.date_of_birth", { tier: "details" });
        const reloaded = reconcileNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID, config);
        const group = reloaded.groups.find((g) => g.key === "contact_edit");
        expect(group?.expandedFieldKeys).toEqual([]);
    });

    it("adding another field does not reintroduce a removed detail field", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.date_of_birth", { tier: "details" });
        config = removeFieldFromNestedGroup(config, "contact_edit", "person.date_of_birth", { tier: "details" });
        config = addFieldToNestedGroup(config, "contact_edit", "person.address_line", { tier: "details" });
        const keys = identityConfigurationFieldKeys(config, "contact_edit", "details");
        expect(keys).toEqual(["person.address_line"]);
        expect(keys).not.toContain("person.date_of_birth");
    });

    it("removed placement does not survive in another tier", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "contact.phone", { tier: "details" });
        config = removeFieldFromNestedGroup(config, "contact_edit", "contact.phone", { tier: "details" });
        const group = config.groups.find((g) => g.key === "contact_edit");
        const detailPlacements = (group?.fieldPlacements ?? []).filter((p) => p.tier === "details");
        expect(detailPlacements.some((p) => p.fieldRef === "contact.phone")).toBe(false);
        expect(identityConfigurationFieldKeys(config, "contact_edit", "summary")).toContain("contact.phone");
    });
});
