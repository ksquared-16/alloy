import { describe, expect, it, beforeEach } from "vitest";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";
import {
    __resetHouseholdCandidateCounterForTests,
    groupFactsIntoHouseholdCandidates,
} from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import { mapFactsToActionIntake } from "@/lib/intake/map/mapFactsToActionIntake";
import { buildIntakeDebugTrace } from "@/lib/intake/debug/buildIntakeDebugTrace";
import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";

const EMERSON_PASTE = [
    "Sarah & Rudy Emerson 1222344321 sarah@emerson.net",
    "",
    "Children: Jet DOB 2/4/2026 and Chet 10/10/2023",
].join("\n");

beforeEach(() => {
    __resetExtractFactCounterForTests();
    __resetHouseholdCandidateCounterForTests();
});

function fieldValue(
    mapped: ReturnType<typeof mapFactsToActionIntake>,
    key: string,
): string | undefined {
    return mapped.candidates.find((c) => c.payload_key === key)?.value;
}

describe("compact contact-block intake — Emerson household", () => {
    it("extracts parents, contact, children, and DOBs from compact paste", () => {
        const extraction = extractFactsFromText({ text: EMERSON_PASTE });
        const parentFacts = extraction.facts.filter(
            (f) => f.fact_type === "person_name" && f.role_hint === "parent",
        );
        const childFacts = extraction.facts.filter(
            (f) => f.fact_type === "person_name" && f.role_hint === "child",
        );
        const dobFacts = extraction.facts.filter((f) => f.fact_type === "dob");

        expect(parentFacts).toHaveLength(2);
        expect(childFacts).toHaveLength(2);
        expect(extraction.facts.filter((f) => f.fact_type === "phone")).toHaveLength(1);
        expect(extraction.facts.filter((f) => f.fact_type === "email")).toHaveLength(1);
        expect(dobFacts.map((f) => f.normalized_value)).toEqual(
            expect.arrayContaining(["2026-02-04", "2023-10-10"]),
        );
    });

    it("groups household with surname inference and relationships", () => {
        const extraction = extractFactsFromText({ text: EMERSON_PASTE });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);

        expect(household.parents).toHaveLength(2);
        expect(household.parents.map((p) => `${p.first_name} ${p.last_name}`)).toEqual([
            "Sarah Emerson",
            "Rudy Emerson",
        ]);
        expect(household.children).toHaveLength(2);
        expect(household.children[0]).toMatchObject({
            first_name: "Jet",
            last_name: "Emerson",
            dob: "2026-02-04",
            last_name_inferred: true,
        });
        expect(household.children[1]).toMatchObject({
            first_name: "Chet",
            last_name: "Emerson",
            dob: "2023-10-10",
            last_name_inferred: true,
        });
        expect(household.relationships).toHaveLength(4);
        expect(household.relationships.every((r) => r.inferred === true)).toBe(true);
    });

    it("maps Create Lead primary fields without missing contact", () => {
        const extraction = extractFactsFromText({ text: EMERSON_PASTE });
        const spec = createLeadParserSpec("dept-emerson");
        const mapped = mapFactsToActionIntake({ extraction, spec });

        expect(fieldValue(mapped, "first_name")).toBe("Sarah");
        expect(fieldValue(mapped, "last_name")).toBe("Emerson");
        expect(fieldValue(mapped, "email")).toBe("sarah@emerson.net");
        expect(fieldValue(mapped, "phone")).toBe("1222344321");
        expect(fieldValue(mapped, "child_first_name")).toBe("Jet");
        expect(fieldValue(mapped, "child_last_name")).toBe("Emerson");
        expect(fieldValue(mapped, "child_date_of_birth")).toBe("2026-02-04");

        const missingRequired = mapped.candidates.filter(
            (c) => c.confidence === "invalid" || (c.validation_state === "invalid" && !c.value),
        );
        expect(missingRequired).toHaveLength(0);
    });

    it("debug trace shows full pipeline for compact intake", () => {
        const spec = createLeadParserSpec("dept-emerson");
        const trace = buildIntakeDebugTrace({ text: EMERSON_PASTE, spec });

        expect(trace.facts.filter((f) => f.fact_type === "person_name" && f.role_hint === "parent")).toHaveLength(2);
        expect(trace.facts.filter((f) => f.fact_type === "phone")).toHaveLength(1);
        expect(trace.facts.filter((f) => f.fact_type === "email")).toHaveLength(1);
        expect(trace.household.children).toHaveLength(2);
        expect(trace.relationships).toHaveLength(4);
        expect(trace.review_warnings.some((w) => w.includes("Rudy Emerson"))).toBe(true);
        expect(trace.review_warnings.some((w) => w.includes("Chet"))).toBe(true);
        expect(trace.commit_preview.will_create.some((row) => row.detail?.includes("Sarah Emerson"))).toBe(true);
    });
});

describe("mixed-surname parents — no child surname inference", () => {
    it("does not infer child last name when parents differ", () => {
        const text = [
            "Sarah Emerson and Rudy Carter 1222344321 sarah@test.com",
            "Children: Jet DOB 2/4/2026",
        ].join("\n");
        const extraction = extractFactsFromText({ text });
        const household = groupFactsIntoHouseholdCandidates(extraction.facts);

        expect(household.children[0]?.last_name).toBeNull();
        const codes = household.review_warnings.map((w) => w.code);
        expect(codes).toContain("child_last_name_needs_review");
    });
});
