/**
 * The authored Admissions v12 draft, measured as the publisher would measure it.
 *
 * A read-only assertion over the saved draft schema captured from the Studio. It exists so the
 * counts in the Director handoff are machine-checked rather than eyeballed, and so the draft is
 * known to satisfy `validateFormSchema` BEFORE anyone presses Publish.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateFormSchema } from "@/lib/forms/schema";

const schema = JSON.parse(readFileSync(join(process.cwd(), ".qa8/v12-draft.json"), "utf8"));

describe("Admissions v12 draft", () => {
    it("satisfies the schema a publish would enforce", () => {
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("has the authored shape", () => {
        expect(schema.sections.length).toBe(8);
        expect(schema.fields.length).toBe(58);
    });

    it("carries every normalization semantic the plan called for", () => {
        const n = (pred: (f: Record<string, unknown>) => boolean) => schema.fields.filter(pred).length;
        expect(n((f) => Boolean(f.field_source))).toBeGreaterThanOrEqual(10);
        expect(n((f) => Boolean(f.option_set_key))).toBe(1);
        expect(n((f) => Boolean(f.visibility))).toBe(5);
        expect(n((f) => Boolean(f.derived))).toBe(1);
        expect(n((f) => Boolean(f.absence))).toBeGreaterThanOrEqual(9);
        // 9 held for Health (D-H5), 3 for the medical providers Alloy has no party model for,
        // and 1 for Consent (D-H3).
        expect(n((f) => Boolean(f.retention))).toBe(13);
        expect(n((f) => Boolean(f.supplied_by))).toBe(1);
        expect(n((f) => Boolean(f.address_binding))).toBe(2);
        expect(n((f) => Boolean(f.party_collection))).toBe(3);
        expect(n((f) => f.type === "signature")).toBe(1);
    });

    it("derives the age from the two dates rather than asking for it", () => {
        const age = schema.fields.find((f: { label?: string }) => f.label === "Age at enrollment");
        expect(age.derived.kind).toBe("age_from_date_of_birth");
        expect(age.derived.source_key).toBeTruthy();
        expect(age.derived.as_of_key).toBeTruthy();
    });

    it("holds the Health facts for an owner that does not exist yet (D-H5)", () => {
        const health = schema.fields.filter((f: { retention?: { owner_hint?: string } }) => f.retention?.owner_hint === "Health");
        expect(health.length).toBeGreaterThanOrEqual(9);
        // A held fact must not also claim a canonical destination.
        for (const f of health) expect(f.field_source).toBeUndefined();
    });
});
