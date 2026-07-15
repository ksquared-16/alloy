import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    dedupeHouseholdIdentityFieldRefs,
    normalizeHouseholdIdentityFieldRef,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRoleConfig";
import { resolveIdentityFieldValue } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompose";
import { isIdentityFieldSaveSupported } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import { personContactSaveKeyForIdentityFieldRef } from "@/lib/adminV2/runtime/focusPanel/household/householdSurfaceFields";
import { buildHouseholdIdentityCardVM } from "@/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM";
import { defaultNestedSurfaceConfig, HOUSEHOLD_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

describe("atomic household name fields", () => {
    it("maps contact first/last to person.first_name and person.last_name", () => {
        expect(normalizeHouseholdIdentityFieldRef("contact.first_name")).toBe("person.first_name");
        expect(normalizeHouseholdIdentityFieldRef("contact.last_name")).toBe("person.last_name");
    });

    it("does not dedupe first and last into one canonical ref", () => {
        const refs = dedupeHouseholdIdentityFieldRefs([
            "person.first_name",
            "person.last_name",
            "person.primary_contact_name",
        ]);
        expect(refs).toEqual(["person.first_name", "person.last_name", "person.primary_contact_name"]);
    });

    it("resolves distinct first/last values for person subjects", () => {
        const subject = {
            kind: "person" as const,
            value: {
                personId: "p-1",
                name: "Kelly Kurzman",
                firstName: "Kelly",
                lastName: "Kurzman",
                roleLabel: null,
                isPrimary: true,
                phone: null,
                email: null,
                initials: "KK",
            },
        };
        expect(resolveIdentityFieldValue(subject, "person.first_name")).toBe("Kelly");
        expect(resolveIdentityFieldValue(subject, "person.last_name")).toBe("Kurzman");
        expect(resolveIdentityFieldValue(subject, "person.primary_contact_name")).toBe("Kelly Kurzman");
    });

    it("renders separate summary cells when both names are configured", () => {
        const config = defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID);
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
                            firstName: "Kelly",
                            lastName: "Kurzman",
                            roleLabel: "Primary",
                            isPrimary: true,
                            phone: null,
                            email: null,
                            initials: "KK",
                        },
                    ],
                    children: [],
                    count: 1,
                },
            ],
            canMutate: false,
        });
        const refs = vm.sections[0]!.items[0]!.summaryRows.flatMap((row) => row.cells.map((c) => c.fieldRef));
        expect(refs.filter((r) => r === "person.first_name" || r === "person.last_name").length).toBeGreaterThanOrEqual(0);
    });

    it("person.full_name resolves from first+last and refreshes when parts change", () => {
        const subject = {
            kind: "person" as const,
            value: {
                personId: "p-1",
                name: "Kelly Kurzman",
                firstName: "Kelly",
                lastName: "Kurzman",
                roleLabel: null,
                isPrimary: true,
                phone: null,
                email: null,
                initials: "KK",
            },
        };
        expect(resolveIdentityFieldValue(subject, "person.full_name")).toBe("Kelly Kurzman");
        subject.value.firstName = "Sam";
        subject.value.lastName = "";
        expect(resolveIdentityFieldValue(subject, "person.full_name")).toBe("Sam");
        subject.value.firstName = "";
        subject.value.lastName = "Lee";
        expect(resolveIdentityFieldValue(subject, "person.full_name")).toBe("Lee");
    });

    it("person.full_name stays distinct from primary_contact_name and is not editable", () => {
        const subject = {
            kind: "person" as const,
            value: {
                personId: "p-1",
                name: "Evidence Name",
                firstName: "Kelly",
                lastName: "Kurzman",
                roleLabel: null,
                isPrimary: true,
                phone: null,
                email: null,
                initials: "KK",
            },
        };
        expect(resolveIdentityFieldValue(subject, "person.full_name")).toBe("Kelly Kurzman");
        expect(resolveIdentityFieldValue(subject, "person.primary_contact_name")).toBe("Evidence Name");
        expect(isIdentityFieldSaveSupported("person.full_name")).toBe(false);
        expect(personContactSaveKeyForIdentityFieldRef("person.full_name")).toBeNull();
    });

    it("IdentityFieldValue uses hover affordance class for inline edit", () => {
        const src = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/identity/IdentityFieldValue.tsx"),
            "utf8",
        );
        expect(src).toContain("identity-field-value--inline-editable");
    });
});
