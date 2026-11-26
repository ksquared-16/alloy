import { describe, expect, it } from "vitest";
import { resolveEmergencyContactFieldEditControl } from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/emergencyContactFieldEditBinding";

describe("resolveEmergencyContactFieldEditControl", () => {
    it("binds relationship_type to canonical option set", () => {
        const control = resolveEmergencyContactFieldEditControl(
            "person_child_relationship.relationship_type",
        );
        expect(control).toEqual({
            kind: "choice",
            optionSetKey: "person_child_relationship_type",
            storedValueKey: "relationship_type",
        });
    });

    it("binds tenant select custom fields to option_set_key", () => {
        const control = resolveEmergencyContactFieldEditControl(
            "person_child_relationship.pickup_relationship_category",
            [
                {
                    field_key: "pickup_relationship_category",
                    field_type: "select",
                    config: { option_set_key: "pickup_relationship_category" },
                },
            ],
        );
        expect(control).toEqual({
            kind: "choice",
            optionSetKey: "pickup_relationship_category",
            storedValueKey: "pickup_relationship_category",
        });
    });
});
