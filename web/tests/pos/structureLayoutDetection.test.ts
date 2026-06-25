/**
 * POS-FP11.1 — layout-aware structure detection for government / medical / childcare forms.
 *
 * Proves the new patterns produce fields where the old whole-line "Label:" detector got
 * ZERO: multiple fields per line, underlined blanks, checkbox groups, Yes/No, signature
 * lines. Honest: prose still yields nothing; every field has a real label from the text.
 */

import { describe, it, expect } from "vitest";
import { detectDocumentStructure } from "@/lib/pos/processingCase/structure/detectDocumentStructure";

function labels(text: string): string[] {
    return detectDocumentStructure(text).sections.flatMap((s) => s.fields.map((f) => f.label));
}
function fieldsByLabel(text: string) {
    return Object.fromEntries(
        detectDocumentStructure(text).sections.flatMap((s) => s.fields).map((f) => [f.label.toLowerCase(), f])
    );
}

describe("multiple fields per line", () => {
    it("colon segments: 'First Name: ___ Last Name: ___ DOB: __/__/__' → 3 fields", () => {
        const by = fieldsByLabel("First Name: ______ Last Name: ______ DOB: __/__/____");
        expect(Object.keys(by).sort()).toEqual(["dob", "first name", "last name"]);
        expect(by["dob"].suggested_type).toBe("date");
        expect(by["first name"].suggested_type).toBe("text");
    });

    it("underlined blanks without colon: 'Mother ____ Father ____' → 2 fields", () => {
        expect(labels("Mother ________ Father ________").sort()).toEqual(["Father", "Mother"]);
    });
});

describe("checkbox / yes-no / signature patterns", () => {
    it("checkbox option group: '[ ] Measles [ ] Mumps [ ] Rubella' → 3 checkbox fields", () => {
        const by = fieldsByLabel("IMMUNIZATIONS\n[ ] Measles [ ] Mumps [ ] Rubella");
        expect(by["measles"].suggested_type).toBe("checkbox");
        expect(by["mumps"].suggested_type).toBe("checkbox");
        expect(by["rubella"].suggested_type).toBe("checkbox");
    });

    it("Yes/No pair uses the preceding prompt", () => {
        const by = fieldsByLabel("Immunizations up to date\n☐ Yes ☐ No");
        expect(by["immunizations up to date"]?.suggested_type).toBe("checkbox");
    });

    it("inline Yes/No question: 'Has allergies? Yes No' → field", () => {
        const by = fieldsByLabel("Has allergies? Yes No");
        expect(by["has allergies"]?.suggested_type).toBe("checkbox");
    });

    it("signature line → signature field", () => {
        const by = fieldsByLabel("Parent/Guardian Signature: __________________");
        const sig = Object.values(by).find((f) => f.suggested_type === "signature");
        expect(sig).toBeTruthy();
    });
});

describe("sections + honesty", () => {
    it("ALL CAPS headers become sections with their fields", () => {
        const r = detectDocumentStructure("CHILD INFORMATION\nChild Name: ____\nEMERGENCY CONTACT\nContact Name: ____");
        const titles = r.sections.map((s) => s.title);
        expect(titles).toContain("CHILD INFORMATION");
        expect(titles).toContain("EMERGENCY CONTACT");
    });

    it("prose with no prompts → zero fields + warning (never fabricated)", () => {
        const r = detectDocumentStructure("This document describes the policies and procedures of the program in general terms.");
        expect(r.sections).toEqual([]);
        expect(r.warnings.some((w) => /no labelled fields/i.test(w))).toBe(true);
    });

    it("before/after: a real government-style block now yields many fields (was 0)", () => {
        const govForm = [
            "SCHOOL AGE CHILD HEALTH REPORT",
            "CHILD INFORMATION",
            "Child Name: ______________  Date of Birth: __/__/____",
            "Address: ____________________  Phone: ____________",
            "IMMUNIZATIONS",
            "Up to date? Yes No",
            "[ ] DTaP  [ ] Polio  [ ] MMR",
            "PHYSICAL EXAM",
            "Height ________  Weight ________",
            "Provider Signature: __________________  Date: __/__/____",
        ].join("\n");
        const fields = detectDocumentStructure(govForm).sections.flatMap((s) => s.fields);
        // The old detector produced 0 here (multi-field lines + checkboxes). Now: many.
        expect(fields.length).toBeGreaterThanOrEqual(8);
        const names = fields.map((f) => f.label.toLowerCase());
        expect(names).toContain("child name");
        expect(names).toContain("date of birth");
        expect(names).toContain("height");
        expect(names.some((n) => /signature/.test(n))).toBe(true);
        expect(names).toContain("dtap");
    });
});
