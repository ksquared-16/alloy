/**
 * Patch 19C — Person layout runtime record mapping + opportunity context fields.
 */

import { describe, expect, it } from "vitest";
import { buildPersonLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildPersonLayoutRuntimeRecordFromVm";

describe("buildPersonLayoutRuntimeRecordFromVm", () => {
    it("maps _household_child_links with enrollment mirror program labels", () => {
        const record = buildPersonLayoutRuntimeRecordFromVm({
            personId: "person-1",
            vmRecord: {
                first_name: "Kev",
                last_name: "Mitchell",
                _household_context: [{ customer_id: "cust-1", customer_name: "Mitchell Household" }],
                _household_child_links: [
                    {
                        customer_member_id: "cm-1",
                        customer_id: "cust-1",
                        person_id: "child-1",
                        display_name: "Ava Mitchell",
                        date_of_birth: "2022-04-10",
                        age_label: "Toddler",
                        status_label: "Active",
                    },
                ],
                _enrollment_mirror: [
                    {
                        id: "em-1",
                        opportunity_id: "opp-1",
                        customer_member_id: "cm-1",
                        program_label: "Toddler Full Day",
                        room_label: "Sunroom",
                    },
                ],
            },
        });

        expect(record["customer.household_name"]).toBe("Mitchell Household");
        const children = record.household_children as Record<string, unknown>[];
        expect(children).toHaveLength(1);
        expect(children[0]?.["child.name"]).toBe("Ava Mitchell");
        expect(children[0]?.["child.program"]).toBe("Toddler Full Day");
        expect(children[0]?.["child.age_band"]).toBe("Toddler");
    });

    it("marks opportunity fallback source on merged inquiry children without inventing household links", () => {
        const record = buildPersonLayoutRuntimeRecordFromVm({
            personId: "person-1",
            vmRecord: {
                _inquiry_children: [
                    {
                        id: "cm-2",
                        person_id: "child-2",
                        display_name: "Sam Mitchell",
                        age_band: "Infant",
                    },
                ],
                _person_children_context_source: "opportunity_household_fallback",
                _primary_contact_on_opportunity: true,
            },
        });

        const children = record.children as Record<string, unknown>[];
        expect(children).toHaveLength(1);
        expect(children[0]?.["child.name"]).toBe("Sam Mitchell");
        expect(children[0]?._layout_runtime_child_source).toBe("opportunity_household_fallback");
        expect(record["person.relationship"]).toBe("Primary contact");
    });
});
