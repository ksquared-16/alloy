import { describe, expect, it, beforeEach } from "vitest";
import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { applyHighConfidenceCreateLeadExtraction } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";
import { mapFactsToActionIntake } from "@/lib/intake/map/mapFactsToActionIntake";
import { parseCreateLeadIntakeText } from "@/lib/intake/adapt/parseCreateLeadIntakeText";

const spec = createLeadParserSpec("dept-1");

const RAVI_PASTE = [
    "Ravi Almead",
    "9879879876",
    "ravi@almead.com",
    "",
    "child is Kai Almead, he's 2 years old (06/06/2024 DOB)",
    "",
    "North Campus",
].join("\n");

const NORTH_CAMPUS_OPTIONS = [{ value: "site-north", label: "North Campus" }];

function mapPaste(text: string, locationOptions = NORTH_CAMPUS_OPTIONS) {
    const extraction = extractFactsFromText({ text });
    return mapFactsToActionIntake({
        extraction,
        spec,
        field_options: { location_id: locationOptions },
    });
}

function byKey(result: ReturnType<typeof mapPaste>) {
    return Object.fromEntries(result.candidates.map((c) => [c.payload_key, c.value]));
}

beforeEach(() => {
    __resetExtractFactCounterForTests();
});

describe("mapFactsToActionIntake — Ravi narrative with location options", () => {
    it("maps child names with high confidence and resolves location UUID", () => {
        const mapped = mapPaste(RAVI_PASTE);
        const fields = byKey(mapped);
        expect(fields.first_name).toBe("Ravi");
        expect(fields.last_name).toBe("Almead");
        expect(fields.child_first_name).toBe("Kai");
        expect(fields.child_last_name).toBe("Almead");
        expect(fields.child_age).toBe("2");
        expect(fields.child_date_of_birth).toBe("2024-06-06");
        expect(fields.location_id).toBe("site-north");

        const childFirst = mapped.candidates.find((c) => c.payload_key === "child_first_name");
        expect(childFirst?.confidence).toBe("high");

        const applied = applyHighConfidenceCreateLeadExtraction({}, parseCreateLeadIntakeText({
            text: RAVI_PASTE,
            spec,
            field_options: { location_id: NORTH_CAMPUS_OPTIONS },
        }));
        expect(applied.child_first_name).toBe("Kai");
        expect(applied.child_last_name).toBe("Almead");
        expect(applied.location_id).toBe("site-north");
    });
});

describe("mapFactsToActionIntake — multiple children", () => {
    it("maps first child to UI fields and preserves additional candidate warning", () => {
        const text = [
            "Parent: Ravi Almead",
            "Phone: 9879879876",
            "Children:",
            "Kai Almead DOB 06/06/2024",
            "Mia Almead age 4",
            "North Campus",
        ].join("\n");
        const mapped = mapPaste(text);
        const fields = byKey(mapped);
        expect(fields.child_first_name).toBe("Kai");
        expect(mapped.household?.children).toHaveLength(2);
        expect(mapped.review_warnings?.some((w) => w.toLowerCase().includes("additional"))).toBe(true);
    });
});

describe("mapFactsToActionIntake — two parents", () => {
    it("maps primary parent and preserves second parent warning", () => {
        const text = [
            "Parents: Ravi Almead and Sam Almead",
            "Email: ravi@almead.com",
            "Phone: 9879879876",
            "Child: Kai Almead, age 2",
        ].join("\n");
        const mapped = mapPaste(text, []);
        expect(byKey(mapped).first_name).toBe("Ravi");
        expect(mapped.household?.parents).toHaveLength(2);
        expect(mapped.review_warnings?.some((w) => w.includes("parent"))).toBe(true);
    });
});

describe("mapFactsToActionIntake — location ambiguity", () => {
    it("does not set location_id when multiple sites match", () => {
        const mapped = mapPaste(RAVI_PASTE, [
            { value: "a", label: "North Campus Main" },
            { value: "b", label: "North Campus East" },
        ]);
        expect(byKey(mapped).location_id).toBeUndefined();
        expect(mapped.review_warnings?.some((w) => w.includes("multiple sites"))).toBe(true);
    });
});

describe("mapFactsToActionIntake — address preserved", () => {
    it("does not map address to location_id", () => {
        const text = [
            "Ravi Almead",
            "123 Main Street",
            "Springfield, IL 62704",
            "ravi@almead.com",
        ].join("\n");
        const mapped = mapPaste(text, NORTH_CAMPUS_OPTIONS);
        expect(byKey(mapped).location_id).toBeUndefined();
        expect(mapped.review_warnings?.some((w) => w.toLowerCase().includes("address"))).toBe(true);
    });
});
