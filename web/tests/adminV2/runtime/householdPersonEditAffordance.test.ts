import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    isEditableHouseholdPersonId,
    seedHouseholdContactValuesForPerson,
    seedHouseholdContactValuesFromEvidence,
} from "@/lib/adminV2/runtime/focusPanel/household/householdContactEditState";

const ROOT = join(process.cwd());

describe("Household person-level edit affordance", () => {
    it("HouseholdCard wires inline onSaveField instead of legacy onEditField", () => {
        const src = readFileSync(join(ROOT, "components/admin/focusPanel/cards/HouseholdCard.tsx"), "utf8");
        expect(src).toContain("onSaveField=");
        expect(src).not.toContain("onEditField=");
        expect(src).toContain("onEditContact");
    });

    it("IdentityFieldValue only shows Edit when onEdit is provided (field-scoped)", () => {
        const src = readFileSync(
            join(ROOT, "components/admin/focusPanel/identity/IdentityFieldValue.tsx"),
            "utf8",
        );
        expect(src).toContain("identity-field-value--inline-editable");
    });

    it("rejects synthetic person ids for edit/save", () => {
        expect(isEditableHouseholdPersonId("primary")).toBe(false);
        expect(isEditableHouseholdPersonId("secondary:Kristi")).toBe(false);
        expect(isEditableHouseholdPersonId("p-kelly")).toBe(true);
    });

    it("seeds Kelly and Kristi distinctly from evidence", () => {
        const truth = {
            "person.primary_contact_name": "Kelly Kurzman",
            "person.primary_email": "kelly@example.com",
            "person.primary_phone": "4801112222",
            primary_person_id: "p-kelly",
            _opportunity_persons: [
                {
                    person_id: "p-kelly",
                    display_name: "Kelly Kurzman",
                    email: "kelly@example.com",
                    phone: "4801112222",
                    is_primary: true,
                },
                {
                    person_id: "p-kristi",
                    display_name: "Kristi Kurzman",
                    email: "kristi@example.com",
                    phone: "4803334444",
                    is_primary: false,
                },
            ],
        };
        const kelly = seedHouseholdContactValuesFromEvidence(truth, {
            personId: "p-kelly",
            name: "Kelly Kurzman",
            email: "kelly@example.com",
            phone: "(480) 111-2222",
        });
        const kristi = seedHouseholdContactValuesFromEvidence(truth, {
            personId: "p-kristi",
            name: "Kristi Kurzman",
            email: "kristi@example.com",
            phone: "(480) 333-4444",
        });
        expect(kelly?.personId).toBe("p-kelly");
        expect(kelly?.values.email).toContain("kelly");
        expect(kristi?.personId).toBe("p-kristi");
        expect(kristi?.values.email).toContain("kristi");
        expect(seedHouseholdContactValuesForPerson(truth, "secondary:x")).toBeNull();
    });
});
