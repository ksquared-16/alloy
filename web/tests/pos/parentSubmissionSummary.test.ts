import { describe, it, expect } from "vitest";
import { buildParentSubmissionSummary } from "@/lib/forms/parentSubmissionSummary";
import type { FormField } from "@/lib/forms/schema";

function f(id: string, opts: { type?: FormField["type"]; required?: boolean; label?: string } = {}): FormField {
    return { id, label: opts.label ?? id, required: opts.required ?? false, type: opts.type ?? "text" } as FormField;
}

describe("buildParentSubmissionSummary", () => {
    const schema = {
        fields: [
            f("child_name", { required: true }),
            f("dob", { type: "date", required: true }),
            f("allergies", { required: false }),
            f("signature", { type: "signature", required: true }),
        ],
    };

    it("splits known (present) vs needed (absent)", () => {
        const s = buildParentSubmissionSummary(schema, { child_name: "Ada", dob: "2018-01-01" });
        expect(s.known.map((k) => k.id)).toEqual(["child_name", "dob"]);
        expect(s.needed.map((n) => n.id)).toEqual(["allergies", "signature"]);
        expect(s.knownCount).toBe(2);
        expect(s.neededCount).toBe(2);
    });

    it("counts required-needed as the parent's minimum", () => {
        const s = buildParentSubmissionSummary(schema, { child_name: "Ada" });
        // needed: dob(req), allergies(opt), signature(req) → 2 required
        expect(s.requiredNeededCount).toBe(2);
    });

    it("treats empty string / whitespace / empty array as not present", () => {
        const s = buildParentSubmissionSummary(schema, { child_name: "  ", dob: "", allergies: [] });
        expect(s.knownCount).toBe(0);
        expect(s.neededCount).toBe(4);
    });

    it("skips group (structural) fields", () => {
        const withGroup = {
            fields: [
                f("child_name", { required: true }),
                { id: "g", label: "G", required: false, type: "group", fields: [f("inner")] } as FormField,
            ],
        };
        const s = buildParentSubmissionSummary(withGroup, { child_name: "Ada" });
        expect(s.known.map((k) => k.id)).toEqual(["child_name"]);
        expect(s.needed).toEqual([]);
    });

    it("everything present → nothing needed", () => {
        const s = buildParentSubmissionSummary(schema, { child_name: "Ada", dob: "2018-01-01", allergies: "none", signature: "signed" });
        expect(s.neededCount).toBe(0);
        expect(s.requiredNeededCount).toBe(0);
        expect(s.knownCount).toBe(4);
    });
});
