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

    it("packs Context Facts half widths into paired rows on Primary Contact", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = {
            ...config,
            groups: config.groups.map((group) => {
                if (group.key !== HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP) return group;
                return {
                    ...group,
                    contextFieldKeys: ["person.first_name", "person.last_name", "person.phone", "person.email"],
                    fieldLayoutWidthsByPurpose: {
                        ...(group.fieldLayoutWidthsByPurpose ?? {}),
                        context_facts: {
                            "person.first_name": "half",
                            "person.last_name": "half",
                            "person.phone": "half",
                            "person.email": "half",
                        },
                    },
                    fieldIcons: {
                        "person.phone": "phone",
                        "person.email": "mail",
                    },
                    fieldModes: {
                        ...(group.fieldModes ?? {}),
                        "person.phone": { ...(group.fieldModes?.["person.phone"] ?? {}), showIcon: true },
                        "person.email": { ...(group.fieldModes?.["person.email"] ?? {}), showIcon: true },
                    },
                };
            }),
        };
        const primary = resolveHouseholdRoleMergedGroup(config, "primary_contact");
        expect(primary?.fieldLayoutWidthsByPurpose?.context_facts?.["person.first_name"]).toBe("half");
        expect(primary?.fieldIcons?.["person.phone"]).toBe("phone");

        const contextPlacements = (primary?.fieldPlacements ?? []).filter(
            (placement) => placement.tier === "context_fact",
        );
        expect(contextPlacements.filter((p) => p.row === 1).map((p) => p.fieldRef)).toEqual([
            "person.first_name",
            "person.last_name",
        ]);
        expect(contextPlacements.filter((p) => p.row === 2).map((p) => p.fieldRef)).toEqual([
            "person.phone",
            "person.email",
        ]);
        expect(contextPlacements.find((p) => p.fieldRef === "person.phone")?.icon).toBe("phone");
    });

    it("keeps Summary full widths from Parent / Guardian even when primary_contact has half pairing", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = {
            ...config,
            groups: config.groups.map((group) => {
                if (group.key === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP) {
                    return {
                        ...group,
                        selectedFieldKeys: ["person.email", "person.phone"],
                        fieldLayoutWidthsByPurpose: {
                            ...(group.fieldLayoutWidthsByPurpose ?? {}),
                            summary: {
                                "person.email": "full",
                                "person.phone": "full",
                            },
                            context_facts: {
                                "person.email": "half",
                                "person.phone": "half",
                            },
                        },
                    };
                }
                if (group.key === "primary_contact") {
                    return {
                        ...group,
                        selectedFieldKeys: ["person.email", "person.phone"],
                        fieldLayoutWidthsByPurpose: {
                            summary: {
                                "person.email": "half",
                                "person.phone": "half",
                            },
                        },
                        fieldPlacements: [
                            {
                                fieldRef: "person.email",
                                tier: "summary",
                                row: 1,
                                column: 1,
                                width: "half",
                            },
                            {
                                fieldRef: "person.phone",
                                tier: "summary",
                                row: 1,
                                column: 2,
                                width: "half",
                            },
                        ],
                    };
                }
                return group;
            }),
        };

        const primary = resolveHouseholdRoleMergedGroup(config, "primary_contact");
        expect(primary?.fieldLayoutWidthsByPurpose?.summary?.["person.email"]).toBe("full");
        expect(primary?.fieldLayoutWidthsByPurpose?.summary?.["person.phone"]).toBe("full");
        const summaryPlacements = (primary?.fieldPlacements ?? []).filter(
            (placement) => placement.tier === "summary",
        );
        expect(summaryPlacements.filter((p) => p.row === 1).map((p) => p.fieldRef)).toEqual(["person.email"]);
        expect(summaryPlacements.filter((p) => p.row === 2).map((p) => p.fieldRef)).toEqual(["person.phone"]);
    });
});
