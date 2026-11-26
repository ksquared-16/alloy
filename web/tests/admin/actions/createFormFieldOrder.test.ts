/**
 * Create-form order follows meaning, not the alphabet: identity → contact → address → relationship/
 * operational → other canonical sections → custom. Fixtures are the two staging orgs' real person
 * configurations (2026-10-20), which file the same fields under different sections.
 */
import { describe, expect, it } from "vitest";

import { sortCreateFormFields, type EntityCreateFormField } from "@/lib/admin/actions/entityCreateFormFieldLoader";

const f = (field_key: string, section_key: string, sort_order: number, label = field_key): EntityCreateFormField => ({
    field_key, label, field_type: "text", is_required: false, placeholder: null, help_text: null, section_key, sort_order, option_set_key: null,
});
const keys = (rows: EntityCreateFormField[]) => rows.map((r) => r.field_key);

describe("sortCreateFormFields", () => {
    it("org A: identity first, then contact, address, relationship notes, canonical sections, custom last", () => {
        const fields = [
            f("communication_preference", "contact", 60), f("email", "contact", 50), f("phone", "contact", 60),
            f("contact_notes", "identity", 70), f("employer", "identity", 65), f("first_name", "identity", 10),
            f("last_name", "identity", 20), f("preferred_name", "identity", 40), f("sms_opt_in", "consent", 240),
            f("authorized_pickup_notes", "emergency", 130), f("emergency_contact_notes", "emergency", 140),
            f("city", "address", 30), f("address_line1", "address", 10), f("date_of_birth", "profile", 70),
            f("parent_guardian_1_employer", "imported", 100), f("allergies", "medical", 110),
        ];
        expect(keys(sortCreateFormFields(fields))).toEqual([
            "first_name", "last_name", "preferred_name", "date_of_birth",
            "phone", "email", "communication_preference",
            "address_line1", "city",
            "employer", "contact_notes", "authorized_pickup_notes", "emergency_contact_notes",
            "allergies", "sms_opt_in",
            "parent_guardian_1_employer",
        ]);
    });

    it("org B: the same order although employer and notes are filed under contact_profile", () => {
        const fields = [
            f("communication_preference", "contact_profile", 60), f("contact_notes", "contact_profile", 70),
            f("employer", "contact_profile", 65), f("phone", "contact", 60), f("email", "contact", 50),
            f("last_name", "basic", 20), f("first_name", "basic", 10), f("preferred_contact_method", "contact", 200),
        ];
        expect(keys(sortCreateFormFields(fields))).toEqual([
            "first_name", "last_name", "phone", "email", "communication_preference", "preferred_contact_method", "employer", "contact_notes",
        ]);
    });

    it("custom fields keep their configured sort_order among themselves, after canonical ones", () => {
        const fields = [f("zeta", "custom", 100, "Zeta"), f("alpha", "custom", 200, "Alpha"), f("first_name", "identity", 10), f("beta", "custom", 100, "Beta")];
        expect(keys(sortCreateFormFields(fields))).toEqual(["first_name", "beta", "zeta", "alpha"]);
    });
});
