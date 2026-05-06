import { describe, expect, it, vi, beforeEach } from "vitest";
import { hydrateSelectOptionsForSchema } from "@/lib/public/forms/hydratePublicFormSelectOptions";
import { validateFormSchema } from "@/lib/forms/schema";
import {
    MEDICATION_AUTHORIZATION_DEMO_SCHEMA,
    MEDICATION_DEMO_ROUTE_ITEM_KEYS,
    MEDICATION_DEMO_SCHEDULE_ITEM_KEYS,
} from "@/lib/forms/seeds/medicationAuthorizationDemo";

vi.mock("@/lib/fields/resolveOptionSetOptions", () => ({
    resolveOptionSetsForOrg: vi.fn(),
}));

import { resolveOptionSetsForOrg } from "@/lib/fields/resolveOptionSetOptions";

describe("hydrateSelectOptionsForSchema", () => {
    beforeEach(() => {
        const scheduleLabels: Record<(typeof MEDICATION_DEMO_SCHEDULE_ITEM_KEYS)[number], string> = {
            daily: "Daily",
            twice_daily: "Twice daily",
            as_needed: "As needed",
            other: "Other",
        };
        const routeLabels: Record<(typeof MEDICATION_DEMO_ROUTE_ITEM_KEYS)[number], string> = {
            oral: "Oral",
            topical: "Topical",
            inhaled: "Inhaled",
            injection: "Injection",
            other: "Other",
        };
        vi.mocked(resolveOptionSetsForOrg).mockResolvedValue({
            med_demo_schedule: MEDICATION_DEMO_SCHEDULE_ITEM_KEYS.map((k) => ({
                value: k,
                label: scheduleLabels[k],
            })),
            med_demo_route: MEDICATION_DEMO_ROUTE_ITEM_KEYS.map((k) => ({
                value: k,
                label: routeLabels[k],
            })),
        });
    });

    it("maps nested select/multiselect fields to option_sets values by field id", async () => {
        const schema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        const out = await hydrateSelectOptionsForSchema({} as never, "org-id", schema);
        expect(out.option_values_by_field_id.schedule).toEqual([...MEDICATION_DEMO_SCHEDULE_ITEM_KEYS]);
        expect(out.option_values_by_field_id.route).toEqual([...MEDICATION_DEMO_ROUTE_ITEM_KEYS]);
        expect(out.option_choices_by_field_id.schedule?.[0]).toEqual({ value: "daily", label: "Daily" });
        expect(vi.mocked(resolveOptionSetsForOrg)).toHaveBeenCalledWith(
            {},
            "org-id",
            expect.arrayContaining(["med_demo_schedule", "med_demo_route"])
        );
    });
});
