/**
 * Person + Child drawer widget merge overlays.
 */

import { describe, expect, it } from "vitest";
import { mergeChildLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergeChildLayoutRuntimeWidgetRecord";
import { mergePersonLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergePersonLayoutRuntimeWidgetRecord";

describe("mergePersonLayoutRuntimeWidgetRecord", () => {
    it("overlays VM connected children when layout record is empty", () => {
        const merged = mergePersonLayoutRuntimeWidgetRecord(
            { id: "person-1", "person.id": "person-1" },
            {
                _household_child_links: [
                    {
                        person_id: "child-1",
                        customer_member_id: "cm-1",
                        display_name: "Riley Brooks",
                        date_of_birth: "2024-03-15",
                        status_label: "Active",
                    },
                ],
            },
        );
        const children = merged.household_children as unknown[];
        expect(Array.isArray(children)).toBe(true);
        expect(children?.length).toBe(1);
    });

    it("overlays VM widget notes onto overview data", () => {
        const merged = mergePersonLayoutRuntimeWidgetRecord(
            { id: "person-1", "person.id": "person-1", _overview_data: {} },
            { follow_up_notes: "Call back Tuesday" },
        );
        const overview = merged._overview_data as Record<string, unknown>;
        expect(overview.follow_up_notes).toBe("Call back Tuesday");
    });
});

describe("mergeChildLayoutRuntimeWidgetRecord", () => {
    it("overlays VM family adults when layout record is empty", () => {
        const merged = mergeChildLayoutRuntimeWidgetRecord(
            { id: "child-1", "child.id": "child-1" },
            {
                _household_adult_links: [
                    {
                        person_id: "person-1",
                        display_name: "Jamie Johnson",
                        role_label: "Primary contact",
                    },
                ],
            },
        );
        const adults = merged.family_adults as unknown[];
        expect(Array.isArray(adults)).toBe(true);
        expect(adults?.length).toBe(1);
    });

    it("fills enrollment scalars from VM when layout values are blank", () => {
        const merged = mergeChildLayoutRuntimeWidgetRecord(
            { id: "child-1", "child.id": "child-1", "inquiry_child.program_category_id": "—" },
            {
                first_name: "Riley",
                program_category_id: "cat-infants",
                _enrollment_mirror: [{ id: "ocm-1", customer_member_id: "cm-1", opportunity_id: "opp-1" }],
            },
        );
        expect(merged["inquiry_child.program_category_id"]).toBe("cat-infants");
    });
});
