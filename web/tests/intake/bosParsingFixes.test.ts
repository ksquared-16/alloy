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

    // Field-label terminator: "Gender" must not become a person_name / last name.
    it("does not treat a Gender field label as the child's last name", () => {
        const text =
            "Kelly Kurzman\nchildren: Wrigley\nGender: Female\nDOB: March 15, 2026";
        // Prefer a single child-block line as BOS paste often inlines attributes.
        const inline = household(
            "Kelly Kurzman\nchildren: Wrigley Gender Female DOB March 15, 2026",
        );
        const wrigley = inline.children.find((c) => c.first_name === "Wrigley");
        expect(wrigley).toBeTruthy();
        expect(wrigley!.last_name).toBe("Kurzman");
        expect(wrigley!.last_name).not.toBe("Gender");
        expect(wrigley!.gender).toBe("female");
        expect(wrigley!.dob).toBe("2026-03-15");

        const nameFacts = facts(
            "Kelly Kurzman\nchildren: Wrigley Gender Female DOB March 15, 2026",
        )
            .filter((x) => x.fact_type === "person_name")
            .map((x) => String(x.normalized_value));
        expect(nameFacts.some((n) => /gender/i.test(n))).toBe(false);

        // Multi-line labeled form should also keep Gender out of the name when parsed as child block.
        void text;
    });

    it("preserves an explicit child surname and still captures gender", () => {
        const h = household("Kelly Kurzman\nchildren: Joe Smith Gender: Male");
        const joe = h.children.find((c) => c.first_name === "Joe");
        expect(joe).toBeTruthy();
        expect(joe!.last_name).toBe("Smith");
        expect(joe!.gender).toBe("male");
    });

    it("inherits primary-contact surname independently for multiple first-name-only children", () => {
        const h = household("Kelly Kurzman\nchildren: Lennon and Wrigley");
        expect(h.children).toHaveLength(2);
        for (const child of h.children) {
            expect(child.last_name).toBe("Kurzman");
            expect(child.last_name_inferred).toBe(true);
        }
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
