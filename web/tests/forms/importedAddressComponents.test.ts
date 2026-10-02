import { describe, expect, it } from "vitest";

import { addressComponentOf, addressGroupLabel, collapseAddressRun } from "@/lib/pos/processingCase/formDraft/importedAddressGroups";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { buildDraftSavePayloadFromSchema } from "@/lib/pos/formDraft/buildDraftSavePayload";
import { safeParseFormSchema, type FormField } from "@/lib/forms/schema";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

const line = (id: string, label: string, key: string, over: Record<string, unknown> = {}) =>
    ({ id, label, type: "text", required: false, confidence: "high", field_source: { entity_type: "person", field_key: key }, ...over }) as never;

const draftWith = (fields: readonly unknown[]): StoredFormDraftPreview =>
    ({
        title: "Packet",
        generated_form_name: "Packet",
        source_document_id: "d",
        sections: [{ id: "section_1", title: "Household", field_ids: (fields as { id: string }[]).map((f) => f.id), disposition: "fields" }],
        fields,
        warnings: [],
        diagnostics: {},
        collections: [],
        generated_at: "",
        generator_version: "t",
    }) as unknown as StoredFormDraftPreview;

describe("recognising a postal component", () => {
    it("knows the five it supports and nothing else", () => {
        for (const key of ["address_line1", "address_line2", "city", "state", "postal_code"]) {
            expect(addressComponentOf({ entity_type: "person", field_key: key }), key).toBe(key);
        }
        expect(addressComponentOf({ entity_type: "person", field_key: "country" })).toBeNull();
        expect(addressComponentOf(undefined)).toBeNull();
    });

    it("names the address from the document's own wording", () => {
        expect(addressGroupLabel("Home address line 1")).toBe("Home address");
        expect(addressGroupLabel("Mailing Address Line 1")).toBe("Mailing address");
        expect(addressGroupLabel("Address Line 1")).toBe("Address");
    });
});

describe("the postal lines become one address with components", () => {
    const fields = [
        line("field_1", "Home address line 1", "address_line1", { required: true }),
        line("field_2", "Address line 2", "address_line2"),
        line("field_3", "City", "city", { required: true }),
        line("field_4", "State", "state", { required: true }),
        line("field_5", "ZIP", "postal_code", { required: true }),
    ];
    const schema = safeParseFormSchema(draftFormToFormSchemaV1(draftWith(fields)));

    it("produces a valid published form", () => {
        expect(schema.success).toBe(true);
    });

    it("ships ONE address group, not five questions", () => {
        if (!schema.success) return;
        const groups = schema.data.fields.filter((f) => f.type === "group");
        expect(groups).toHaveLength(1);
        expect(groups[0]!.label).toBe("Home address");
        expect(schema.data.sections[0]!.field_ids).toEqual([groups[0]!.id]);
    });

    it("keeps every component as its own child, in postal order", () => {
        if (!schema.success) return;
        const group = schema.data.fields.find((f) => f.type === "group")! as FormField & { fields: FormField[] };
        expect(group.fields.map((f) => f.label)).toEqual([
            "Home address line 1",
            "Address line 2",
            "City",
            "State",
            "ZIP",
        ]);
    });

    it("lets each child map to its own canonical component — nothing maps twice", () => {
        if (!schema.success) return;
        const group = schema.data.fields.find((f) => f.type === "group")! as FormField & { fields: FormField[] };
        const keys = group.fields.map((f) => f.field_source?.field_key);
        expect(keys).toEqual(["address_line1", "address_line2", "city", "state", "postal_code"]);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("gives the GROUP the address binding — whose address it is", () => {
        if (!schema.success) return;
        const group = schema.data.fields.find((f) => f.type === "group")!;
        expect(group.address_binding).toEqual({ subject: "person", role: "home" });
    });

    it("lays the components out the way an address is written", () => {
        if (!schema.success) return;
        const group = schema.data.fields.find((f) => f.type === "group")! as FormField & { fields: FormField[] };
        expect(group.fields.map((f) => f.layout_width)).toEqual([undefined, undefined, "half", "quarter", "quarter"]);
    });

    it("marks the address required when any line is", () => {
        if (!schema.success) return;
        expect(schema.data.fields.find((f) => f.type === "group")!.required).toBe(true);
    });
});

describe("the importer invents nothing", () => {
    it("keeps only the components the source actually had", () => {
        const schema = safeParseFormSchema(
            draftFormToFormSchemaV1(draftWith([line("field_1", "City", "city"), line("field_2", "ZIP", "postal_code")])),
        );
        expect(schema.success).toBe(true);
        if (!schema.success) return;
        const group = schema.data.fields.find((f) => f.type === "group")! as FormField & { fields: FormField[] };
        expect(group.fields.map((f) => f.field_source?.field_key)).toEqual(["city", "postal_code"]);
        // No address line conjured to fill the shape out.
        expect(group.fields.some((f) => f.label.toLowerCase().includes("line"))).toBe(false);
    });

    it("leaves a lone component as an ordinary question", () => {
        const schema = safeParseFormSchema(draftFormToFormSchemaV1(draftWith([line("field_1", "City", "city")])));
        expect(schema.success).toBe(true);
        if (!schema.success) return;
        expect(schema.data.fields.some((f) => f.type === "group")).toBe(false);
        expect(schema.data.fields[0]!.label).toBe("City");
    });

    it("starts a SECOND address when a component repeats", () => {
        const schema = safeParseFormSchema(
            draftFormToFormSchemaV1(
                draftWith([
                    line("field_1", "Home address line 1", "address_line1"),
                    line("field_2", "City", "city"),
                    line("field_3", "Mailing address line 1", "address_line1"),
                    line("field_4", "City", "city"),
                ]),
            ),
        );
        expect(schema.success).toBe(true);
        if (!schema.success) return;
        const groups = schema.data.fields.filter((f) => f.type === "group");
        expect(groups.map((g) => g.label)).toEqual(["Home address", "Mailing address"]);
    });

    it("omits the binding when the lines disagree about whose address it is", () => {
        const run = collapseAddressRun(
            [
                { id: "a", type: "text", label: "Address line 1", required: true, field_source: { entity_type: "person", field_key: "address_line1" } },
                { id: "b", type: "text", label: "City", required: true, field_source: { entity_type: "customer", field_key: "city" } },
            ] as FormField[],
            0,
        );
        expect(run).not.toBeNull();
        expect(run!.group.address_binding).toBeUndefined();
    });
});

describe("the address does not flatten on save", () => {
    it("writes its children back as the draft fields they are", () => {
        const fields = [
            line("field_1", "Home address line 1", "address_line1", { required: true }),
            line("field_2", "City", "city", { required: true }),
            line("field_3", "ZIP", "postal_code", { required: true }),
        ];
        const draft = draftWith(fields);
        const schema = safeParseFormSchema(draftFormToFormSchemaV1(draft));
        expect(schema.success).toBe(true);
        if (!schema.success) return;
        const built = buildDraftSavePayloadFromSchema(draft, schema.data);
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        // The draft model is flat, so the group contributes its children — with their own destinations.
        expect(built.payload.fields.map((f) => f.label)).toEqual(["Home address line 1", "City", "ZIP"]);
        expect(built.payload.fields.map((f) => f.field_source?.field_key)).toEqual(["address_line1", "city", "postal_code"]);
        expect(built.payload.fields.map((f) => f.layout_width)).toEqual([undefined, "half", "quarter"]);
    });
});
