import { describe, expect, it, beforeEach } from "vitest";

import { buildHouseholdIdentityCardVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import { resolveIdentityFieldPolicy } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    setFieldVisibilityInNestedGroup,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import type { HouseholdEvidenceGroup } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";

describe("identity tier field policy isolation", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("does not leak contact_edit editable into Summary read-only on primary_contact", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.phone", "read-only", {
            tier: "summary",
        });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.phone", "editable", {
            tier: "context_facts",
        });

        expect(
            resolveIdentityFieldPolicy({
                config,
                groupKey: "primary_contact",
                fieldRef: "person.phone",
                editGroupKey: "contact_edit",
                tier: "summary",
            }),
        ).toBe("read-only");
        expect(
            resolveIdentityFieldPolicy({
                config,
                groupKey: "primary_contact",
                fieldRef: "person.phone",
                editGroupKey: "contact_edit",
                tier: "context_facts",
            }),
        ).toBe("editable");
    });

    it("marks detail cells editable when details tier policy is editable", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.phone", { tier: "expanded" });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.phone", "read-only", {
            tier: "summary",
        });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.phone", "editable", {
            tier: "details",
        });

        const groups: HouseholdEvidenceGroup[] = [
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
        ];

        const vm = buildHouseholdIdentityCardVM({ config, groups, canMutate: true });
        const record = vm.sections[0]!.items[0]!;
        const summaryPhone = record.summaryRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "person.phone");
        const detailPhone = record.detailRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "person.phone");
        expect(summaryPhone?.policy).toBe("read-only");
        expect(summaryPhone?.editable).toBe(false);
        expect(detailPhone?.policy).toBe("editable");
        expect(detailPhone?.editable).toBe(true);
    });
});
