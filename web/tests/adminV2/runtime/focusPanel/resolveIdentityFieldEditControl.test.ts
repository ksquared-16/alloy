import { describe, expect, it } from "vitest";
import { resolveIdentityFieldEditControl } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldEditControl";

describe("resolveIdentityFieldEditControl", () => {
    it("binds child.gender to person_gender select control", () => {
        const control = resolveIdentityFieldEditControl("child.gender");
        expect(control).toEqual({
            kind: "select",
            optionSetKey: "person_gender",
        });
    });

    it("binds tenant select custom fields to option_set_key", () => {
        const control = resolveIdentityFieldEditControl("child.custom_picklist", [
            {
                field_key: "custom_picklist",
                // Every value below is fixed by this test's own scenario: a TENANT CUSTOM
                // (is_system false) ACTIVE select on the child entity, resolved as
                // "child.custom_picklist". label is unread here, so it stays null rather than
                // asserting a display string the test never exercises.
                label: null,
                entity_type: "child",
                field_type: "select",
                config: { option_set_key: "custom_picklist" },
                is_system: false,
                is_active: true,
            },
        ]);
        expect(control).toEqual({
            kind: "select",
            optionSetKey: "custom_picklist",
        });
    });

    it("binds date fields to date control", () => {
        const control = resolveIdentityFieldEditControl("child.date_of_birth");
        expect(control).toEqual({ kind: "date" });
    });

    it("binds Location fields to site placement select (Editable, not Linked)", () => {
        expect(resolveIdentityFieldEditControl("inquiry_child.location_id")).toEqual({
            kind: "placement_select",
            placement: "site",
        });
        expect(resolveIdentityFieldEditControl("child.location")).toEqual({
            kind: "placement_select",
            placement: "site",
        });
    });

    it("binds Program fields to program placement select", () => {
        expect(resolveIdentityFieldEditControl("inquiry_child.program")).toEqual({
            kind: "placement_select",
            placement: "program",
        });
    });
});
