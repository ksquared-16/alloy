/**
 * Person/Child drawer VM → layout runtime record adapters.
 */

import { describe, expect, it } from "vitest";
import {
    buildChildLayoutRuntimeRecordFromVm,
    buildPersonLayoutRuntimeRecordFromVm,
} from "@/lib/layout/runtime/buildPersonChildLayoutRuntimeRecordFromVm";

describe("buildPersonLayoutRuntimeRecordFromVm", () => {
    it("maps person VM fields and children to refKeys", () => {
        const record = buildPersonLayoutRuntimeRecordFromVm(
            {
                first_name: "Jamie",
                last_name: "Johnson",
                phone: "(555) 234-8901",
                email: "jamie.j@example.com",
                household_name: "Johnson Household",
                children: [{ person_id: "p-1", display_name: "Alex Johnson", status_label: "Active" }],
            },
            "person-1",
        );
        expect(record.id).toBe("person-1");
        expect(record["person.primary_contact_name"]).toBe("Jamie Johnson");
        expect(record["person.primary_phone"]).toBe("(555) 234-8901");
        expect(record["household.name"]).toBe("Johnson Household");
        const children = record.children as Record<string, string>[];
        expect(children[0]["child.name"]).toBe("Alex Johnson");
        expect(children[0]["child.status"]).toBe("Active");
    });

    it("renders blank (empty) for missing fields, not undefined", () => {
        const record = buildPersonLayoutRuntimeRecordFromVm({ first_name: "Solo" }, "p-2");
        expect(record["person.primary_email"]).toBe("");
        expect(record["household.name"]).toBe("");
        expect(record.children).toEqual([]);
    });
});

describe("buildChildLayoutRuntimeRecordFromVm", () => {
    it("maps child VM fields, program, and parents to refKeys", () => {
        const record = buildChildLayoutRuntimeRecordFromVm(
            {
                display_name: "Alex Johnson",
                date_of_birth: "2024-03-15",
                age_band: "Infant",
                desired_program_label: "Infant Care",
                primary_contact_name: "Jamie Johnson",
                primary_phone: "(555) 234-8901",
                parents: [{ person_id: "par-1", display_name: "Jamie Johnson", relationship: "Guardian" }],
            },
            "child-person-1",
        );
        expect(record["child.name"]).toBe("Alex Johnson");
        expect(record["child.date_of_birth"]).toBe("2024-03-15");
        expect(record["inquiry_child.program"]).toBe("Infant Care");
        expect(record["person.primary_contact_name"]).toBe("Jamie Johnson");
        const parents = record.parents as Record<string, string>[];
        expect(parents[0]["person.primary_contact_name"]).toBe("Jamie Johnson");
        expect(parents[0]["person.household_role"]).toBe("Guardian");
    });
});
