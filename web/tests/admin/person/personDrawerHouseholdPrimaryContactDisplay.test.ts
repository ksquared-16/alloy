import { describe, expect, it } from "vitest";
import {
    applyHouseholdGuardianPrimaryDisplay,
    householdParentGuardianCount,
    householdShowsPrimaryContactControl,
} from "@/lib/admin/person/personDrawerHouseholdPrimaryContactDisplay";

describe("personDrawerHouseholdPrimaryContactDisplay", () => {
    it("treats a single guardian as primary for display", () => {
        const rows = applyHouseholdGuardianPrimaryDisplay([
            {
                person_id: "p1",
                display_name: "Claire Murphy",
                role_label: "Guardian",
                role_type: "parent",
                is_primary: false,
                role_chips: [],
                initials: "CM",
                photo_url: null,
            },
        ]);
        expect(rows[0]?.is_primary).toBe(true);
    });

    it("hides primary control for single-guardian or already-primary households", () => {
        expect(
            householdShowsPrimaryContactControl({
                guardianCount: 1,
                isPrimary: false,
                canMutate: true,
            })
        ).toBe(false);
        expect(
            householdShowsPrimaryContactControl({
                guardianCount: 2,
                isPrimary: true,
                canMutate: true,
            })
        ).toBe(false);
        expect(
            householdShowsPrimaryContactControl({
                guardianCount: 2,
                isPrimary: false,
                canMutate: true,
            })
        ).toBe(true);
    });

    it("counts viewing-person card in guardian total", () => {
        expect(householdParentGuardianCount([], true)).toBe(1);
        expect(householdParentGuardianCount([{ is_primary: false } as never], true)).toBe(2);
    });
});
