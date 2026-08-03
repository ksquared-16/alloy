import { describe, expect, it } from "vitest";
import { extractFactsFromText } from "@/lib/intake/extract/extractFactsFromText";
import { groupFactsIntoHouseholdCandidates } from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";

function household(text: string) {
    return groupFactsIntoHouseholdCandidates(extractFactsFromText({ text }).facts);
}
function facts(text: string) {
    return extractFactsFromText({ text }).facts;
}

describe("BOS parsing fixes (Kelly's Fitz thread)", () => {
    // Bug 3: "Girl" must not become a child's last name.
    it("does not treat a gender word as the child's last name", () => {
        const h = household("Brian and Brittany Fitz\nchildren: Caitlyn (DOB 7/7/2022) Girl and Ember DOB (6/6/2024) Girl");
        const caitlyn = h.children.find((c) => c.first_name === "Caitlyn");
        expect(caitlyn).toBeTruthy();
        expect(caitlyn!.last_name).not.toBe("Girl");
        // surname is inherited from the single parent surname
        expect(caitlyn!.last_name).toBe("Fitz");
    });

    // Bug 4a: a location phrase must not become an Additional person.
    it("treats 'North campus' as a location, not a parent person", () => {
        const f = facts("Brian and Brittany Fitz\nNorth campus");
        const personNames = f.filter((x) => x.fact_type === "person_name").map((x) => String(x.normalized_value));
        expect(personNames).not.toContain("North campus");
        expect(f.some((x) => x.fact_type === "location_label" && String(x.normalized_value).toLowerCase().includes("north campus"))).toBe(true);
    });

    // Bug 4b: a bare "toddler program" phrase is captured as program interest (not a child named "toddler").
    it("parses a bare 'toddler program' phrase as program interest", () => {
        const f = facts("Brian Fitz\ntoddler program");
        expect(f.some((x) => x.fact_type === "program_interest" && /toddler/i.test(String(x.normalized_value)))).toBe(true);
        expect(f.some((x) => x.fact_type === "person_name" && /toddler/i.test(String(x.normalized_value)))).toBe(false);
    });
});
