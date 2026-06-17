import { describe, expect, it, beforeEach } from "vitest";
import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { extractFactsFromText, __resetExtractFactCounterForTests } from "@/lib/intake/extract/extractFactsFromText";
import { mapFactsToActionIntake } from "@/lib/intake/map/mapFactsToActionIntake";

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

function mapPaste(text: string) {
    const extraction = extractFactsFromText({ text });
    return mapFactsToActionIntake({ extraction, spec });
}

function byKey(result: ReturnType<typeof mapPaste>) {
    return Object.fromEntries(result.candidates.map((c) => [c.payload_key, c.value]));
}

beforeEach(() => {
    __resetExtractFactCounterForTests();
});

describe("mapFactsToActionIntake — Ravi narrative", () => {
    it("maps facts to Create Lead payload keys", () => {
        const mapped = mapPaste(RAVI_PASTE);
        const fields = byKey(mapped);
        expect(fields.first_name).toBe("Ravi");
        expect(fields.last_name).toBe("Almead");
        expect(fields.phone).toBe("9879879876");
        expect(fields.email).toBe("ravi@almead.com");
        expect(fields.child_first_name).toBe("Kai");
        expect(fields.child_last_name).toBe("Almead");
        expect(fields.child_age).toBe("2");
        expect(fields.child_date_of_birth).toBe("2024-06-06");
        expect(fields.location_id).toBe("North Campus");
    });
});

describe("mapFactsToActionIntake — Jordan Lee", () => {
    it("maps simple contact paste", () => {
        const mapped = mapPaste(["Jordan Lee", "jordan.lee@test.com", "1231231234"].join("\n"));
        const fields = byKey(mapped);
        expect(fields.first_name).toBe("Jordan");
        expect(fields.last_name).toBe("Lee");
        expect(fields.email).toBe("jordan.lee@test.com");
        expect(fields.phone).toBe("1231231234");
    });
});
