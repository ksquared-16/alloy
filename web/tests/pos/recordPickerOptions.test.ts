import { describe, it, expect } from "vitest";
import { buildRecordPickerOptions, type GlobalSearchHitLike } from "@/lib/pos/packet/recordPickerOptions";

function hit(over: Partial<GlobalSearchHitLike> & Pick<GlobalSearchHitLike, "entity_type" | "entity_id" | "name">): GlobalSearchHitLike {
    return over;
}

describe("buildRecordPickerOptions", () => {
    it("maps each result grain to the right launch entity type", () => {
        const opts = buildRecordPickerOptions([
            hit({ entity_type: "opportunities", entity_id: "o1", name: "Chen Family", status_label: "Tour Scheduled" }),
            hit({ entity_type: "persons", entity_id: "p1", name: "Mei Chen", type_label: "Guardian" }),
            hit({ entity_type: "customer_members", entity_id: "m1", name: "Ada Chen", age_label: "4y 2mo" }),
            hit({ entity_type: "customers", entity_id: "c1", name: "Chen", household_name: "Chen Household" }),
        ]);
        const byType = Object.fromEntries(opts.map((o) => [o.entity_type, o]));
        expect(byType.opportunity.entity_id).toBe("o1");
        expect(byType.person.entity_id).toBe("p1");
        expect(byType.customer_member.entity_id).toBe("m1");
        expect(byType.customer.entity_id).toBe("c1");
    });

    it("skips locations (not launchable)", () => {
        const opts = buildRecordPickerOptions([hit({ entity_type: "locations", entity_id: "l1", name: "North Campus" })]);
        expect(opts).toEqual([]);
    });

    it("derives a household option from customer_id + household_name", () => {
        const opts = buildRecordPickerOptions([
            hit({ entity_type: "customer_members", entity_id: "m1", name: "Ada", customer_id: "c9", household_name: "Chen Household" }),
        ]);
        expect(opts.map((o) => o.entity_type)).toEqual(["customer_member", "customer"]);
        const household = opts.find((o) => o.entity_type === "customer");
        expect(household).toMatchObject({ entity_id: "c9", label: "Chen Household", sublabel: "Household" });
    });

    it("dedupes by (entity_type, entity_id)", () => {
        const opts = buildRecordPickerOptions([
            hit({ entity_type: "customer_members", entity_id: "m1", name: "Ada", customer_id: "c9", household_name: "Chen Household" }),
            hit({ entity_type: "persons", entity_id: "p1", name: "Mei", customer_id: "c9", household_name: "Chen Household" }),
            hit({ entity_type: "customers", entity_id: "c9", name: "Chen", household_name: "Chen Household" }),
        ]);
        // c9 household should appear exactly once.
        expect(opts.filter((o) => o.entity_type === "customer" && o.entity_id === "c9")).toHaveLength(1);
    });

    it("builds friendly labels (child includes age, opportunity includes status)", () => {
        const opts = buildRecordPickerOptions([
            hit({ entity_type: "customer_members", entity_id: "m1", name: "Ada Chen", age_label: "4y 2mo", household_name: "Chen Household" }),
            hit({ entity_type: "opportunities", entity_id: "o1", name: "Chen Family", status_label: "Active", location_label: "North Campus" }),
        ]);
        const child = opts.find((o) => o.entity_type === "customer_member");
        expect(child?.label).toBe("Ada Chen · 4y 2mo");
        expect(child?.sublabel).toBe("Child · Chen Household");
        const opp = opts.find((o) => o.entity_type === "opportunity");
        expect(opp?.sublabel).toBe("Lead · Active · North Campus");
    });

    it("falls back to generic labels when name is missing", () => {
        const opts = buildRecordPickerOptions([hit({ entity_type: "opportunities", entity_id: "o1", name: "", lead_short_label: "Chen" })]);
        expect(opts[0].label).toBe("Chen");
    });

    it("ignores hits with empty entity_id", () => {
        const opts = buildRecordPickerOptions([hit({ entity_type: "persons", entity_id: "", name: "Ghost" })]);
        expect(opts).toEqual([]);
    });
});
