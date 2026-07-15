import { describe, expect, it, beforeEach } from "vitest";

import { buildHouseholdIdentityCardVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import {
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import { withHouseholdRoleMergedGroups } from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import { reconcileIdentityNestedConfig } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import { identityRowsForDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityDisclosureVM";

describe("identity Details projection", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("keeps Details empty when published expandedFieldKeys is explicitly empty", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const template = config.groups.find((g) => g.key === "contact_edit")!;
        config = {
            ...config,
            groups: config.groups.map((g) =>
                g.key === "contact_edit"
                    ? { ...template, expandedFieldKeys: [], contextFieldKeys: ["person.phone"] }
                    : g,
            ),
        };
        config = withHouseholdRoleMergedGroups(reconcileIdentityNestedConfig("household_surface", config));

        const vm = buildHouseholdIdentityCardVM({
            config,
            groups: [
                {
                    key: "primary_contact",
                    title: "Primary",
                    contacts: [
                        {
                            personId: "p-1",
                            name: "Kelly Kurzman",
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
            ],
            canMutate: true,
        });
        const record = vm.sections[0]!.items[0]!;
        expect(record.detailRows).toEqual([]);
        expect(record.contextFactRows.flatMap((r) => r.cells).some((c) => c.fieldRef === "person.phone")).toBe(true);
    });

    it("details depth inherits context facts in visible rows when expanded keys are empty", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        const template = config.groups.find((g) => g.key === "contact_edit")!;
        config = {
            ...config,
            groups: config.groups.map((g) =>
                g.key === "contact_edit"
                    ? { ...template, expandedFieldKeys: [], contextFieldKeys: ["person.phone"] }
                    : g,
            ),
        };
        config = withHouseholdRoleMergedGroups(reconcileIdentityNestedConfig("household_surface", config));

        const vm = buildHouseholdIdentityCardVM({
            config,
            groups: [
                {
                    key: "primary_contact",
                    title: "Primary",
                    contacts: [
                        {
                            personId: "p-1",
                            name: "Kelly Kurzman",
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
            ],
            canMutate: true,
        });
        const record = vm.sections[0]!.items[0]!;
        expect(record.canShowDetails).toBe(true);
        const detailsView = identityRowsForDisclosureDepth(record, "details");
        expect(detailsView.visibleRows.flatMap((r) => r.cells).some((c) => c.fieldRef === "person.phone")).toBe(true);
        expect(detailsView.detailRows).toEqual([]);
    });
});
