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

/*
 * The draft is captured INTO the test tree, not read from a scratch directory.
 *
 * This suite first read `.qa8/v12-draft.json`, which is the authoring driver's scratch output and is
 * not tracked. The test therefore passed only in the worktree that authored the draft and would have
 * failed everywhere else — a fixture nobody else has is not evidence. Recapture it by reading the
 * latest version of form 57507992-db0e-4ceb-b4ba-ba2d9bc0155f through the admin Forms API whenever
 * the Studio authoring changes.
 */
const schema = JSON.parse(readFileSync(join(__dirname, "../fixtures/admissionsV12Draft.json"), "utf8"));

describe("Admissions v12 draft", () => {
    it("satisfies the schema a publish would enforce", () => {
        expect(() => validateFormSchema(schema)).not.toThrow();
    });

    it("has the authored shape", () => {
        expect(schema.sections.length).toBe(8);
        // 58 authored from the plan + the one Director-approved sibling gate (below).
        expect(schema.fields.length).toBe(59);
    });

    it("carries every normalization semantic the plan called for", () => {
        const n = (pred: (f: Record<string, unknown>) => boolean) => schema.fields.filter(pred).length;
        expect(n((f) => Boolean(f.field_source))).toBeGreaterThanOrEqual(10);
        expect(n((f) => Boolean(f.option_set_key))).toBe(1);
        /*
         * 5 conditionals from the plan + the approved sibling gate.
         *
         * "Other children in your household" was authored at min 0, which asks every family to
         * prove a negative by leaving a collection empty. The gate asks whether there ARE other
         * children; the collection applies only then, and owes at least one entry when it does.
         * `conditionalRequiredness.test.ts` owns the runtime half of that contract.
         */
        expect(n((f) => Boolean(f.visibility))).toBe(6);
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

    /*
     * THE APPROVED SIBLING GATE, AS THE FAMILY MEETS IT.
     *
     * A collection that does not apply cannot be incomplete — but it also cannot be revealed by a
     * question the family has not reached yet. Order is part of the contract, not decoration: the
     * gate is authored into the same section, immediately before the collection it governs.
     */
    it("asks whether there are other children before offering the collection", () => {
        const gate = schema.fields.find((f: { label?: string }) => f.label === "Do you have other children in your household?");
        const coll = schema.fields.find((f: { label?: string }) => f.label === "Other children in your household");
        expect(gate.type).toBe("boolean");
        expect(gate.required).toBe(true);

        // The collection applies only when the gate is answered Yes, and then owes a real entry.
        expect(coll.visibility).toEqual({ all: [{ op: "eq", value: true, field_id: gate.id }] });
        expect(coll.repeat.min).toBe(1);

        const section = schema.sections.find((x: { field_ids: string[] }) => x.field_ids.includes(coll.id));
        expect(section.field_ids).toContain(gate.id);
        expect(section.field_ids.indexOf(gate.id)).toBeLessThan(section.field_ids.indexOf(coll.id));
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
