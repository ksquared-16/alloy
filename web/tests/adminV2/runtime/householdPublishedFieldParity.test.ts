import { describe, expect, it, beforeEach } from "vitest";

import {
    resolveHouseholdRoleMergedGroup,
    withHouseholdRoleMergedGroups,
    normalizeHouseholdIdentityFieldRef,
    dedupeHouseholdIdentityFieldRefs,
    HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import { buildHouseholdIdentityCardVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import {
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import type { HouseholdEvidenceGroup } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";

describe("published Household field parity", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("normalizes address aliases to canonical line1/line2", () => {
        expect(normalizeHouseholdIdentityFieldRef("person.address_line")).toBe("person.address_line1");
        expect(normalizeHouseholdIdentityFieldRef("contact.address_line1")).toBe("person.address_line1");
        expect(normalizeHouseholdIdentityFieldRef("contact.address_line2")).toBe("person.address_line2");
        expect(
            dedupeHouseholdIdentityFieldRefs([
                "person.address_line",
                "person.address_line1",
                "person.address_line2",
            ]),
        ).toEqual(["person.address_line1", "person.address_line2"]);
    });

    it("explicit contact_edit Details wins over seeded primary_contact DOB/address_line", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = {
            ...config,
            groups: config.groups.map((group) => {
                if (group.key === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP) {
                    return {
                        ...group,
                        expandedFieldKeys: ["person.address_line1", "person.address_line2"],
                        fieldPlacements: [
                            {
                                fieldRef: "person.address_line1",
                                tier: "details",
                                row: 0,
                                column: 1,
                                width: "full",
                            },
                            {
                                fieldRef: "person.address_line2",
                                tier: "details",
                                row: 1,
                                column: 1,
                                width: "full",
                            },
                        ],
                    };
                }
                if (group.key === "primary_contact") {
                    // Simulate platform seed pollution on runtime section
                    return {
                        ...group,
                        expandedFieldKeys: [
                            "person.date_of_birth",
                            "person.address_line",
                            "person.address_line1",
                            "person.address_line2",
                        ],
                    };
                }
                return group;
            }),
        };

        const primary = resolveHouseholdRoleMergedGroup(config, "primary_contact");
        expect(primary?.expandedFieldKeys).toEqual(["person.address_line1", "person.address_line2"]);
        expect(primary?.expandedFieldKeys).not.toContain("person.date_of_birth");
        expect(primary?.expandedFieldKeys).not.toContain("person.address_line");
    });

    it("explicit empty Details stays empty (no seed append)", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = {
            ...config,
            groups: config.groups.map((group) => {
                if (group.key === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP) {
                    return { ...group, expandedFieldKeys: [] };
                }
                if (group.key === "primary_contact") {
                    return {
                        ...group,
                        expandedFieldKeys: ["person.date_of_birth", "person.address_line"],
                    };
                }
                return group;
            }),
        };
        const primary = resolveHouseholdRoleMergedGroup(config, "primary_contact");
        expect(primary?.expandedFieldKeys).toEqual([]);
    });

    it("runtime VM Details rows match published Parent/Guardian address fields only", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = {
            ...config,
            groups: config.groups.map((group) => {
                if (group.key === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP) {
                    return {
                        ...group,
                        expandedFieldKeys: ["person.address_line1", "person.address_line2"],
                    };
                }
                if (group.key === "primary_contact") {
                    return {
                        ...group,
                        expandedFieldKeys: [
                            "person.date_of_birth",
                            "person.address_line",
                            "person.address_line1",
                            "person.address_line2",
                        ],
                    };
                }
                return group;
            }),
        };
        const groups: HouseholdEvidenceGroup[] = [
            {
                key: "primary_contact",
                title: "Primary Contact",
                contacts: [
                    {
                        personId: "p-kelly",
                        name: "Kelly Kurzman",
                        roleLabel: "Primary",
                        isPrimary: true,
                        phone: "4801112222",
                        email: "kelly@example.com",
                        initials: "KK",
                    },
                ],
                children: [],
                count: 1,
            },
        ];
        const vm = buildHouseholdIdentityCardVM({
            config: withHouseholdRoleMergedGroups(config),
            groups,
            canMutate: true,
        });
        const primary = vm.sections.find((s) => s.key === "primary_contact")?.items[0];
        const detailRefs = primary?.detailRows.flatMap((row) => row.cells.map((c) => c.fieldRef)) ?? [];
        expect(detailRefs).toEqual(["person.address_line1", "person.address_line2"]);
        expect(detailRefs).not.toContain("person.date_of_birth");
        expect(detailRefs).not.toContain("person.address_line");
    });

    it("undefined contact_edit Details does not inherit primary_contact seed DOB/address_line", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = {
            ...config,
            groups: config.groups.map((group) => {
                if (group.key === HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP) {
                    // Summary only — Details intentionally unset on the role template.
                    return { ...group, expandedFieldKeys: undefined };
                }
                if (group.key === "primary_contact") {
                    return {
                        ...group,
                        expandedFieldKeys: [
                            "person.date_of_birth",
                            "person.address_line",
                            "person.address_line1",
                            "person.address_line2",
                        ],
                    };
                }
                return group;
            }),
        };
        const primary = resolveHouseholdRoleMergedGroup(config, "primary_contact");
        expect(primary?.expandedFieldKeys).toBeUndefined();
        const card = buildHouseholdIdentityCardVM({
            config,
            groups: [
                {
                    key: "primary_contact",
                    title: "Primary contact",
                    contacts: [
                        {
                            personId: "p1",
                            name: "Kelly Kurzman",
                            roleLabel: "Primary",
                            isPrimary: true,
                            phone: "555-0100",
                            email: "kelly@example.com",
                            initials: "KK",
                        },
                    ],
                    children: [],
                    count: 1,
                },
            ],
            canMutate: false,
        });
        const primaryItem = card.sections.find((section) => section.key === "primary_contact")?.items[0]!;
        const detailRefs = primaryItem.detailRows.flatMap((row) => row.cells).map((cell) => cell.fieldRef);
        expect(detailRefs).toEqual([]);
        expect(detailRefs).not.toContain("person.date_of_birth");
    });

});
