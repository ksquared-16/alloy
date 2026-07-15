import { describe, expect, it, beforeEach } from "vitest";

import { HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP } from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import { buildHouseholdIdentityCardVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import { resolveIdentityFieldPolicy } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import {
    addFieldToNestedGroup,
    defaultNestedSurfaceConfig,
    setFieldVisibilityInNestedGroup,
    HOUSEHOLD_SURFACE_ID,
    setFieldPresentationModeInNestedGroup,
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

    it("isolates Summary vs Context Facts policy and label for the same Email field", () => {
        let config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
        config = addFieldToNestedGroup(config, "contact_edit", "person.email", { tier: "context_facts" });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.email", "read-only", {
            tier: "summary",
        });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.email", "editable", {
            tier: "context_facts",
        });
        config = setFieldVisibilityInNestedGroup(config, "contact_edit", "person.email", "editable", {
            tier: "details",
        });
        config = setFieldPresentationModeInNestedGroup(config, "contact_edit", "person.email", {
            showLabel: false,
        });
        config = {
            ...config,
            groups: config.groups.map((group) => {
                if (group.key !== HOUSEHOLD_PARENT_GUARDIAN_ROLE_GROUP) return group;
                return {
                    ...group,
                    fieldPlacements: (group.fieldPlacements ?? []).map((placement) => {
                        if (placement.fieldRef !== "person.email") return placement;
                        if (placement.tier === "context_fact") {
                            return { ...placement, labelMode: "visible" as const };
                        }
                        return placement;
                    }),
                };
            }),
        };

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
        const summaryEmail = record.summaryRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "person.email");
        const contextEmail = record.contextRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "person.email");
        const detailEmail = record.detailRows.flatMap((r) => r.cells).find((c) => c.fieldRef === "person.email");

        expect(summaryEmail?.policy).toBe("read-only");
        expect(summaryEmail?.editable).toBe(false);
        expect(summaryEmail?.labelMode).toBe("hidden");

        expect(contextEmail?.policy).toBe("editable");
        expect(contextEmail?.editable).toBe(true);
        expect(contextEmail?.labelMode).toBe("visible");

        if (detailEmail) {
            expect(detailEmail.policy).toBe("editable");
            expect(detailEmail.editable).toBe(true);
        }
    });
});
