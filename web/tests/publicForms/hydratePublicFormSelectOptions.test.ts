import { describe, expect, it, vi, beforeEach } from "vitest";
import { hydrateSelectOptionsForSchema } from "@/lib/public/forms/hydratePublicFormSelectOptions";
import { validateFormSchema } from "@/lib/forms/schema";
import { MEDICATION_AUTHORIZATION_DEMO_SCHEMA } from "@/lib/forms/seeds/medicationAuthorizationDemo";

vi.mock("@/lib/fields/resolveOptionSetOptions", () => ({
    resolveOptionSetsForOrg: vi.fn(),
}));

import { resolveOptionSetsForOrg } from "@/lib/fields/resolveOptionSetOptions";

describe("hydrateSelectOptionsForSchema", () => {
    beforeEach(() => {
        vi.mocked(resolveOptionSetsForOrg).mockResolvedValue({
            med_demo_schedule: [
                { value: "bid", label: "Twice daily" },
                { value: "prn", label: "As needed" },
            ],
            med_demo_route: [{ value: "oral", label: "Oral" }],
        });
    });

    it("maps nested select/multiselect fields to option_sets values by field id", async () => {
        const schema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        const out = await hydrateSelectOptionsForSchema({} as never, "org-id", schema);
        expect(out.option_values_by_field_id.schedule).toEqual(["bid", "prn"]);
        expect(out.option_values_by_field_id.route).toEqual(["oral"]);
        expect(out.option_choices_by_field_id.schedule?.[0]).toEqual({ value: "bid", label: "Twice daily" });
        expect(vi.mocked(resolveOptionSetsForOrg)).toHaveBeenCalledWith(
            {},
            "org-id",
            expect.arrayContaining(["med_demo_schedule", "med_demo_route"])
        );
    });
});
