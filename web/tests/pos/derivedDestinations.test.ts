/**
 * Derived destinations: values Alloy fills, at the moment the source actually means.
 *
 * The doctrine already existed in `lib/fields/derived` — including its own instruction that
 * "POS/forms should register their own bindings". Forms never did, so three required boxes had
 * nothing to fill them. These pin the resolver and the timing rule it turns on.
 */
import { describe, it, expect } from "vitest";
import { deriveExecutionDate, formatExecutionDate } from "@/lib/fields/derived/executionDate";
import { resolveDerivedFieldDisplay } from "@/lib/fields/derived/resolveDerivedFieldDisplay";
import { resolveFormDerivedValues, formDerivedBindings } from "@/lib/forms/derived/resolveFormDerivedValues";
import { assertValueProduction } from "@/lib/pos/packet/valueProduction";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

const f = (over: Partial<FormField> & { id: string }): FormField =>
    ({ type: "text", label: over.id, required: false, ...over }) as FormField;
const schemaOf = (fields: FormField[]): FormSchemaV1 =>
    ({ schema_version: "v1", title: "t", fields, sections: [{ id: "s1", title: "s", field_ids: fields.map((x) => x.id) }] }) as unknown as FormSchemaV1;

describe("execution date — the day the family signed, in the organisation's own day", () => {
    it("resolves the organisation-local calendar day, not the UTC one", () => {
        // 9:30pm Pacific on the 26th is already the 27th in UTC. A document signed that evening is
        // dated the 26th, because the centre's day is the one that counts.
        const r = deriveExecutionDate("2026-08-27T04:30:00Z", "America/Los_Angeles");
        expect(r?.source_value).toBe("2026-08-26");
        expect(r?.display).toBe("8/26/2026");
        expect(deriveExecutionDate("2026-08-27T04:30:00Z", "UTC")?.source_value).toBe("2026-08-27");
    });

    it("keeps the stored canonical date distinct from how an artifact prints it", () => {
        const r = deriveExecutionDate("2026-08-26T17:00:00Z", "America/Los_Angeles")!;
        expect(r.source_value).toBe("2026-08-26");
        expect(formatExecutionDate(r.source_value, "iso")).toBe("2026-08-26");
        expect(formatExecutionDate(r.source_value, "long")).toBe("August 26, 2026");
        expect(formatExecutionDate(r.source_value, "us_slash")).toBe("8/26/2026");
    });

    it("has no value before the artifact is executed", () => {
        const schema = schemaOf([f({ id: "d", type: "date", read_only: true, derived: { kind: "execution_date" } })]);
        expect(resolveFormDerivedValues(schema, {}, { executedAtIso: null, timeZone: "America/Los_Angeles" })).toEqual({});
        expect(resolveFormDerivedValues(schema, {}, { executedAtIso: "2026-08-26T17:00:00Z", timeZone: "America/Los_Angeles" })).toEqual({ d: "8/26/2026" });
    });
});

describe("age at a date — never age today", () => {
    const binding = { age: { kind: "age_from_date_of_birth" as const, source_key: "dob", as_of_key: "start" } };

    it("computes the age on the as-of date the source names", () => {
        const r = resolveDerivedFieldDisplay({ target_key: "age", values: { dob: "2021-04-02", start: "2026-09-08" }, bindings: binding });
        expect(r?.value).toEqual({ years: 5, months: 5 });
    });

    it("does NOT fall back to today when the as-of date is missing", () => {
        // Substituting the current date because the reference date is inconvenient is how a document
        // acquires a plausible wrong number.
        const r = resolveDerivedFieldDisplay({ target_key: "age", values: { dob: "2021-04-02" }, bindings: binding, asOfDate: new Date("2030-01-01T00:00:00Z") });
        expect(r).toBeNull();
    });

    it("uses the caller's as-of only when the binding names no date key", () => {
        const r = resolveDerivedFieldDisplay({
            target_key: "age",
            values: { dob: "2021-04-02" },
            bindings: { age: { kind: "age_from_date_of_birth", source_key: "dob" } },
            asOfDate: new Date("2026-09-08T00:00:00Z"),
        });
        expect(r?.value).toEqual({ years: 5, months: 5 });
    });
});

describe("the schema declares what fills a box, never its label", () => {
    it("reads bindings from the declaration alone", () => {
        const schema = schemaOf([
            f({ id: "age", read_only: true, derived: { kind: "age_from_date_of_birth", source_key: "dob", as_of_key: "start" } }),
            f({ id: "dob", type: "date" }),
            f({ id: "start", type: "date" }),
            f({ id: "plain", label: "Today's Date:" }),
        ]);
        const b = formDerivedBindings(schema);
        expect(Object.keys(b)).toEqual(["age"]);
        // A box called "Today's Date:" that declares nothing is not derived. Labels decide nothing.
        expect(b.plain).toBeUndefined();
    });
});

describe("value production — a truthful writer, not a value right now", () => {
    it("accepts an execution date even though no value exists yet", () => {
        const r = assertValueProduction(schemaOf([f({ id: "d", required: true, read_only: true, derived: { kind: "execution_date" } })]));
        expect(r.ok).toBe(true);
        expect(r.byPath.derived_value_writer).toBe(1);
    });

    it("accepts an age whose inputs are on the artifact", () => {
        const r = assertValueProduction(schemaOf([
            f({ id: "age", required: true, read_only: true, derived: { kind: "age_from_date_of_birth", source_key: "dob", as_of_key: "start" } }),
            f({ id: "dob", type: "date", required: true }),
            f({ id: "start", type: "date", required: true }),
        ]));
        expect(r.ok).toBe(true);
        expect(r.byPath.derived_value_writer).toBe(1);
    });

    it("STRANDS a derivation that cites an input the artifact does not carry", () => {
        // A declaration with nothing behind it is a story about a value, not a value.
        const r = assertValueProduction(schemaOf([
            f({ id: "age", required: true, read_only: true, derived: { kind: "age_from_date_of_birth", source_key: "dob", as_of_key: "not_here" } }),
            f({ id: "dob", type: "date" }),
        ]));
        expect(r.ok).toBe(false);
        expect(r.stranded[0]!.evidence).toContain("inputs unresolved");
    });

    it("still strands a derivation citing no source at all", () => {
        const r = assertValueProduction(schemaOf([f({ id: "age", required: true, read_only: true, derived: { kind: "age_from_date_of_birth" } })]));
        expect(r.ok).toBe(false);
    });
});

describe("the tamper guard must not erase a value the platform just derived", () => {
    it("restores the baseline for read-only fields but leaves derived ones alone", async () => {
        const { applyReadOnlyBaselineToPayload } = await import("@/lib/forms/readOnlyFormPayload");
        const schema = schemaOf([
            f({ id: "locked", read_only: true }),
            f({ id: "today", type: "date", read_only: true, derived: { kind: "execution_date" } }),
        ]);
        const out = applyReadOnlyBaselineToPayload(
            schema,
            { values: { locked: "tampered", today: "8/26/2026" } },
            { values: { locked: "server value", today: "" } },
        );
        expect(out.values.locked, "an operator-owned read-only value wins over the participant's").toBe("server value");
        expect(out.values.today, "the derived value was computed this second — the baseline is stale by definition").toBe("8/26/2026");
    });
});
