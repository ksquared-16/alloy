import { describe, expect, it, beforeEach } from "vitest";

import { buildHouseholdIdentityCardVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import {
    resolveHouseholdRoleMergedGroup,
    withHouseholdRoleMergedGroups,
    HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import {
    defaultNestedSurfaceConfig,
    setFieldPresentationModeInNestedGroup,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import type { HouseholdEvidenceGroup } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";

const sampleGroups = (): HouseholdEvidenceGroup[] => [
    {
        key: "primary_contact",
        title: "Primary",
        contacts: [
            {
                personId: "p-1",
                name: "Kelly Kurzman",
                firstName: "Kelly",
                lastName: "Kurzman",
                roleLabel: "Primary",
                isPrimary: true,
                phone: "480-111-2222",
                email: "kelly@example.com",
                initials: "KK",
            },
        ],
        children: [],
        count: 1,
    },
];

describe("identity placement label publication", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("setFieldPresentationMode showLabel false writes placement.labelMode hidden", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldPresentationModeInNestedGroup(config, "primary_contact", "person.email", {
            showLabel: false,
        });
        const group = config.groups.find((g) => g.key === "primary_contact");
        const placements = (group?.fieldPlacements ?? []).filter((p) => p.fieldRef === "person.email");
        expect(placements.length).toBeGreaterThan(0);
        expect(placements.every((p) => p.labelMode === "hidden")).toBe(true);
        expect(group?.fieldModes?.["person.email"]?.showLabel).toBe(false);
    });

    it("publish round-trip role merge preserves explicit showLabel false", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldPresentationModeInNestedGroup(config, HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP, "person.email", {
            showLabel: false,
        });
        const merged = resolveHouseholdRoleMergedGroup(config, "primary_contact");
        expect(merged?.fieldModes?.["person.email"]?.showLabel).toBe(false);
        const emailPlacements = (merged?.fieldPlacements ?? []).filter((p) => p.fieldRef === "person.email");
        expect(emailPlacements.some((p) => p.labelMode === "hidden")).toBe(true);
    });

    it("buildHouseholdIdentityCardVM summary cells honor hidden labelMode", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldPresentationModeInNestedGroup(config, "primary_contact", "person.email", {
            showLabel: false,
        });
        config = withHouseholdRoleMergedGroups(config);
        const vm = buildHouseholdIdentityCardVM({ config, groups: sampleGroups(), canMutate: false });
        const email = vm.sections[0]!.items[0]!.summaryRows
            .flatMap((r) => r.cells)
            .find((c) => c.fieldRef === "person.email");
        expect(email?.labelMode).toBe("hidden");
    });

    it("republish true→false changes VM labelMode", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldPresentationModeInNestedGroup(config, "primary_contact", "person.email", {
            showLabel: true,
        });
        config = withHouseholdRoleMergedGroups(config);
        const visibleVm = buildHouseholdIdentityCardVM({ config, groups: sampleGroups(), canMutate: false });
        const visibleEmail = visibleVm.sections[0]!.items[0]!.summaryRows
            .flatMap((r) => r.cells)
            .find((c) => c.fieldRef === "person.email");
        expect(visibleEmail?.labelMode).toBe("visible");

        config = setFieldPresentationModeInNestedGroup(config, "primary_contact", "person.email", {
            showLabel: false,
        });
        config = withHouseholdRoleMergedGroups(config);
        const hiddenVm = buildHouseholdIdentityCardVM({ config, groups: sampleGroups(), canMutate: false });
        const hiddenEmail = hiddenVm.sections[0]!.items[0]!.summaryRows
            .flatMap((r) => r.cells)
            .find((c) => c.fieldRef === "person.email");
        expect(hiddenEmail?.labelMode).toBe("hidden");
    });

    it("bridges legacy fieldModes when placement.labelMode is absent", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = {
            ...config,
            groups: config.groups.map((group) => {
                if (group.key !== "primary_contact") return group;
                return {
                    ...group,
                    fieldModes: {
                        ...(group.fieldModes ?? {}),
                        "person.email": { ...(group.fieldModes?.["person.email"] ?? {}), showLabel: false },
                    },
                    fieldPlacements: (group.fieldPlacements ?? []).map((placement) =>
                        placement.fieldRef === "person.email"
                            ? { ...placement, labelMode: undefined }
                            : placement,
                    ),
                };
            }),
        };
        const vm = buildHouseholdIdentityCardVM({ config, groups: sampleGroups(), canMutate: false });
        const email = vm.sections[0]!.items[0]!.summaryRows
            .flatMap((r) => r.cells)
            .find((c) => c.fieldRef === "person.email");
        expect(email?.labelMode).toBe("hidden");
    });
});
