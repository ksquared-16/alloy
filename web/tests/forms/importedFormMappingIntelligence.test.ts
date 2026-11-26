import { describe, expect, it } from "vitest";

import { resolveFieldMapping, safeImportMappings } from "@/lib/pos/formDraft/resolveFieldMapping";
import type { DraftFormField } from "@/lib/pos/processingCase/formDraft/types";

const field = (over: Partial<DraftFormField>): DraftFormField =>
    ({ id: "f1", label: "Field", type: "text", required: false, confidence: "high", ...over }) as DraftFormField;

describe("mapping an imported question", () => {
    it("maps a child's date of birth without being asked", () => {
        const m = resolveFieldMapping(field({ label: "Child's Date of Birth", type: "date" }), "Child Information");
        expect(m.state).toBe("mapped");
        expect(m.apply).toBeTruthy();
        expect(m.explanation).toContain("Alloy already knows this");
    });

    it("reads a bare Name from the section it sits under, the way the resolver always could", () => {
        // The intelligence for this already existed; what is new is that it reaches the operator.
        const guardian = resolveFieldMapping(field({ label: "Name" }), "Parent or Guardian #1");
        expect(guardian.state).toBe("mapped");
        expect(guardian.destinationLabel).toMatch(/guardian|parent/i);
    });

    it("offers an uncertain destination as a suggestion and does NOT apply it", () => {
        const m = resolveFieldMapping(field({ label: "Child's Date of Birth", type: "date", confidence: "low" }), "Child");
        expect(m.state).toBe("suggested");
        // The whole safety law in one assertion: a proposal is visible, and nothing is written.
        expect(m.proposed).toBeTruthy();
        expect(m.apply).toBeNull();
    });

    it("keeps a question with no canonical subject at all with the form, rather than guessing one", () => {
        // "Carpool lane preference" is about nobody the records know. The resolver's answer is that it
        // belongs on the form, which is a decision — not the same thing as being unable to decide.
        const m = resolveFieldMapping(field({ label: "Carpool lane preference", confidence: "low" }), "Logistics");
        expect(m.state).toBe("form_only");
        expect(m.apply).toBeNull();
    });

    it("red-lines a question explicitly carrying no canonical binding", () => {
        /*
         * `unmapped` is how the engine records "a destination was considered and is not canonical".
         * That is the state the red line is for, and it is the one state the operator must resolve.
         */
        const m = resolveFieldMapping(
            field({ label: "Child's preferred classroom nickname", field_source: { entity_type: "child", field_key: "unmapped" }, confidence: "low" }),
            "Child Information",
        );
        expect(m.state).toBe("needs_mapping");
        expect(m.apply).toBeNull();
    });

    it("says a derived answer is not asked at all", () => {
        expect(resolveFieldMapping(field({ derived: { kind: "age_years" } as never }), "s").state).toBe("derived");
    });

    it("treats a destination already on the draft as settled, not as a proposal to re-derive", () => {
        const m = resolveFieldMapping(
            field({ label: "Anything we should know?", field_source: { entity_type: "customer_member", field_key: "notes" } }),
            "Other",
        );
        expect(m.state).toBe("mapped");
        expect(m.apply).toEqual({ entity_type: "customer_member", field_key: "notes" });
    });
});

describe("what gets written at import", () => {
    const titles = new Map([
        ["dob", "Child Information"],
        ["unknown", "Logistics"],
        ["uncertain", "Child Information"],
        ["already", "Other"],
    ]);

    it("writes only the destinations it can establish safely", () => {
        const applied = safeImportMappings(
            [
                field({ id: "dob", label: "Child's Date of Birth", type: "date" }),
                field({ id: "unknown", label: "Carpool lane preference", confidence: "low" }),
                field({ id: "uncertain", label: "Child's Date of Birth", type: "date", confidence: "low" }),
            ],
            titles,
        );
        expect(applied.has("dob")).toBe(true);
        // A safe half beats a dangerous nine tenths: neither of these is written.
        expect(applied.has("unknown")).toBe(false);
        expect(applied.has("uncertain")).toBe(false);
    });

    it("never overwrites a destination the draft already carries", () => {
        const applied = safeImportMappings(
            [field({ id: "already", label: "Child's Date of Birth", type: "date", field_source: { entity_type: "customer_member", field_key: "operator_choice" } })],
            titles,
        );
        expect(applied.has("already")).toBe(false);
    });

    it("leaves a question a collection already covers alone", () => {
        const applied = safeImportMappings(
            [field({ id: "dob", label: "Child's Date of Birth", type: "date", suppressed_by_collection: "c1" })],
            titles,
        );
        expect(applied.size).toBe(0);
    });
});
