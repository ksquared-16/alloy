import { describe, expect, it, beforeEach } from "vitest";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";

const JORDAN_PASTE = ["Jordan Lee", "jordan.lee@test.com", "1231231234"].join("\n");

const RAVI_PASTE = [
    "Ravi Almead",
    "9879879876",
    "ravi@almead.com",
    "",
    "child is Kai Almead, he's 2 years old (06/06/2024 DOB)",
    "",
    "North Campus",
].join("\n");

function factsByType(result: ReturnType<typeof extractFactsFromText>, type: string) {
    return result.facts.filter((f) => f.fact_type === type);
}

function parentName(result: ReturnType<typeof extractFactsFromText>): string | null {
    const fact = result.facts.find((f) => f.fact_type === "person_name" && f.role_hint === "parent");
    return fact ? String(fact.normalized_value) : null;
}

function childName(result: ReturnType<typeof extractFactsFromText>): string | null {
    const fact = result.facts.find((f) => f.fact_type === "person_name" && f.role_hint === "child");
    return fact ? String(fact.normalized_value) : null;
}

beforeEach(() => {
    __resetExtractFactCounterForTests();
});

describe("extractFactsFromText — Jordan Lee simple contact", () => {
    it("extracts adult name, valid email, and valid phone", () => {
        const result = extractFactsFromText({ text: JORDAN_PASTE });
        expect(parentName(result)).toBe("Jordan Lee");
        expect(factsByType(result, "email")[0]?.validation_state).toBe("valid");
        expect(factsByType(result, "email")[0]?.normalized_value).toBe("jordan.lee@test.com");
        expect(factsByType(result, "phone")[0]?.validation_state).toBe("valid");
        expect(factsByType(result, "phone")[0]?.normalized_value).toBe("1231231234");
    });
});

describe("extractFactsFromText — Ravi narrative child and location", () => {
    it("extracts parent, child, age, dob, and location label", () => {
        const result = extractFactsFromText({ text: RAVI_PASTE });
        expect(parentName(result)).toBe("Ravi Almead");
        expect(factsByType(result, "phone")[0]?.normalized_value).toBe("9879879876");
        expect(factsByType(result, "email")[0]?.normalized_value).toBe("ravi@almead.com");
        expect(childName(result)).toBe("Kai Almead");
        expect(factsByType(result, "age_years")[0]?.normalized_value).toBe(2);
        expect(factsByType(result, "dob")[0]?.normalized_value).toBe("2024-06-06");
        const location = factsByType(result, "location_label")[0];
        expect(location?.normalized_value).toBe("North Campus");
        expect(location?.validation_state).toBe("unknown");
    });
});

describe("extractFactsFromText — varied child phrasing", () => {
    it.each([
        ["Child: Kai Almead", "Kai Almead"],
        ["Daughter is Kai Almead", "Kai Almead"],
        ["Son: Kai Almead", "Kai Almead"],
        ["Kai Almead, age 2", "Kai Almead"],
    ])("extracts child name from %s", (line, expected) => {
        const result = extractFactsFromText({ text: line });
        expect(childName(result)).toBe(expected);
    });

    it("extracts DOB from labeled line", () => {
        const result = extractFactsFromText({ text: "DOB: 06/06/2024" });
        expect(factsByType(result, "dob")[0]?.normalized_value).toBe("2024-06-06");
    });
});

describe("extractFactsFromText — labeled full paste", () => {
    it("extracts labeled parent, child, contact, source, and notes", () => {
        const result = extractFactsFromText({
            text: [
                "Parent: Jordan Lee",
                "Email: jordan@example.com",
                "Phone: (555) 123-4567",
                "Child: Riley Lee",
                "Source: Website form",
                "Notes: Interested in toddler program starting in September",
            ].join("\n"),
        });
        expect(parentName(result)).toBe("Jordan Lee");
        expect(childName(result)).toBe("Riley Lee");
        expect(factsByType(result, "source")[0]?.normalized_value).toBe("Website form");
        expect(factsByType(result, "notes")[0]?.raw_value).toContain("toddler program");
    });
});
