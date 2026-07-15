import { describe, expect, it, beforeEach } from "vitest";

import {
    resolveHouseholdRoleMergedGroup,
    withHouseholdRoleMergedGroups,
    householdAuthoringGroupKey,
    HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import {
    defaultNestedSurfaceConfig,
    setFieldVisibilityInNestedGroup,
    setNestedGroupSectionLabel,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

describe("household role-based configuration", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("maps primary and other parent authoring to Parent / Guardian template", () => {
        expect(householdAuthoringGroupKey("primary_contact")).toBe(HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP);
        expect(householdAuthoringGroupKey("other_parent_guardian")).toBe(HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP);
        expect(householdAuthoringGroupKey("emergency_contacts")).toBe("emergency_contacts");
    });

    it("applies Parent / Guardian config to Primary and Other Parent runtime sections", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "contact.phone", "editable", {
            tier: "context_fact",
        });
        const merged = withHouseholdRoleMergedGroups(config);

        const primaryPolicy = merged.groups
            .find((group) => group.key === "primary_contact")
            ?.fieldPlacements?.find(
                (placement) => placement.fieldRef === "person.phone" && placement.tier === "context_fact",
            )?.policy;
        const otherPolicy = merged.groups
            .find((group) => group.key === "other_parent_guardian")
            ?.fieldPlacements?.find(
                (placement) => placement.fieldRef === "person.phone" && placement.tier === "context_fact",
            )?.policy;

        expect(primaryPolicy).toBe("editable");
        expect(otherPolicy).toBe("editable");
    });

    it("respects explicit primary override when roleOverride is set", () => {
        let config = withHouseholdRoleMergedGroups(defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID));
        config = {
            ...config,
            groups: config.groups.map((group) =>
                group.key === "primary_contact"
                    ? { ...group, roleOverride: true, selectedFieldKeys: ["person.email"] }
                    : group,
            ),
        };
        const primary = resolveHouseholdRoleMergedGroup(config, "primary_contact");
        expect(primary?.selectedFieldKeys).toEqual(["person.email"]);
    });

    it("renders configured section labels from nested config", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setNestedGroupSectionLabel(config, "other_parent_guardian", "Secondary Parent");
        const group = config.groups.find((g) => g.key === "other_parent_guardian");
        expect(group?.sectionLabel).toBe("Secondary Parent");
    });
});
