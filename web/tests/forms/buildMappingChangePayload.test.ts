import { describe, expect, it } from "vitest";
import { buildMappingChangePayload, mappingChoicesFor } from "@/lib/pos/formDraft/buildMappingChangePayload";

type Draft = Parameters<typeof buildMappingChangePayload>[0];
const draft = {
    title: "Admissions Packet",
    generated_form_name: "Admissions",
    sections: [
        { id: "s1", title: "Child", field_ids: ["a", "b"], disposition: "fields" },
        { id: "s2", title: "Intro", field_ids: [], disposition: "static" },
        { id: "s3", title: "No fate", field_ids: [] },
    ],
    fields: [
        { id: "a", label: "First name", type: "text", required: true, confidence: "high", field_source: { entity_type: "customer_member", field_key: "first_name" } },
        { id: "b", label: "Mailing address", type: "text", required: false, confidence: "low" },
    ],
} as unknown as Draft;

const guardian = { id: "guardian", label: "A parent or guardian", destination: { entity_type: "person", field_key: "address_line1" } };

describe("changing one destination without losing the draft", () => {
    it("posts EVERY field, not just the changed one", () => {
        const r = buildMappingChangePayload(draft, "b", guardian);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.payload.fields.map((f) => f.label)).toEqual(["First name", "Mailing address"]);
    });

    it("applies the choice to the named field and leaves the others untouched", () => {
        const r = buildMappingChangePayload(draft, "b", guardian);
        if (!r.ok) throw new Error("expected ok");
        expect(r.payload.fields[0]!.field_source).toEqual({ entity_type: "customer_member", field_key: "first_name" });
        expect(r.payload.fields[1]!.field_source).toEqual({ entity_type: "person", field_key: "address_line1" });
    });

    it("expresses 'keep it with the form' by omitting the destination, not by sending an empty one", () => {
        const r = buildMappingChangePayload(draft, "a", { id: "form_only", label: "Keep it with the form", destination: null });
        if (!r.ok) throw new Error("expected ok");
        expect("field_source" in r.payload.fields[0]!).toBe(false);
    });

    it("carries the operator's form name and only the sections that have a decided fate", () => {
        const r = buildMappingChangePayload(draft, "b", guardian);
        if (!r.ok) throw new Error("expected ok");
        expect(r.payload.form_name).toBe("Admissions");
        expect(r.payload.section_dispositions).toEqual([
            { id: "s1", disposition: "fields" },
            { id: "s2", disposition: "static" },
        ]);
    });

    it("refuses a field that is not on the draft rather than posting a list that drops it", () => {
        expect(buildMappingChangePayload(draft, "nope", guardian)).toEqual({ ok: false, reason: "unknown_field" });
    });

    it("refuses an empty draft, which the save route would reject anyway", () => {
        expect(buildMappingChangePayload({ ...draft, fields: [] } as Draft, "a", guardian)).toEqual({ ok: false, reason: "no_fields" });
    });
});

describe("the choices an operator is offered", () => {
    it("asks whose answer it is, and allows keeping it with the form", () => {
        const labels = mappingChoicesFor("Text").map((c) => c.label);
        expect(labels).toEqual(["The child", "A parent or guardian", "The household", "Keep it with the form"]);
    });

    it("uses no engineering vocabulary in anything offered", () => {
        const text = mappingChoicesFor("Address").map((c) => c.label).join(" ").toLowerCase();
        for (const leak of ["entity_type", "field_key", "customer_member", "provider", "canonical"]) {
            expect(text).not.toContain(leak);
        }
    });
});
