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
                field_type: "select",
                config: { option_set_key: "custom_picklist" },
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
});
