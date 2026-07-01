import { describe, it, expect } from "vitest";
import { buildManualFormDraft } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { buildCanonicalPrefillFieldMap } from "@/lib/forms/prefill/canonicalPrefillMap";
import { safeParseFormSchema, type FormField } from "@/lib/forms/schema";

function fsOf(field: FormField | undefined) {
    return field?.field_source ?? null;
}

describe("Document → Draft → Generated FormSchemaV1: field_source survives", () => {
    it("operator-reviewed binding persists through the whole pipeline", () => {
        const draft = buildManualFormDraft({
            title: "MO500",
            sourceDocumentId: "doc-1",
            fields: [
                { label: "Childs Name", type: "text", field_source: { entity_type: "customer_member", field_key: "display_name" } },
                { label: "Birthdate", type: "date", field_source: { entity_type: "customer_member", field_key: "dob" } },
            ],
        });
        // draft fields carry the operator binding
        expect(draft.fields[0].field_source).toEqual({ entity_type: "customer_member", field_key: "display_name" });

        const schema = draftFormToFormSchemaV1(draft);
        expect(safeParseFormSchema(schema).success).toBe(true);
        expect(fsOf(schema.fields[0])).toEqual({ entity_type: "customer_member", field_key: "display_name" });
        expect(fsOf(schema.fields[1])).toEqual({ entity_type: "customer_member", field_key: "dob" });

        // and prefill resolves regardless of the generated field IDs
        const map = buildCanonicalPrefillFieldMap(schema);
        expect(map[schema.fields[0].id]).toBe("customer_member.display_name");
        expect(map[schema.fields[1].id]).toBe("customer_member.dob");
    });

    it("auto-suggests a binding when the operator left it unbound but the label is recognizable", () => {
        const draft = buildManualFormDraft({
            title: "Health",
            sourceDocumentId: null,
            fields: [{ label: "Date of Birth", type: "date" }, { label: "Parent Email", type: "text" }],
        });
        // draft has no binding (operator didn't set one)
        expect(draft.fields[0].field_source).toBeUndefined();

        const schema = draftFormToFormSchemaV1(draft);
        // schema builder fills the canonical binding from the label
        expect(fsOf(schema.fields[0])).toEqual({ entity_type: "customer_member", field_key: "dob" });
        expect(fsOf(schema.fields[1])).toEqual({ entity_type: "person", field_key: "email" });
    });

    it("packet-only / unrecognized fields stay unbound (no silent wrong binding)", () => {
        const draft = buildManualFormDraft({
            title: "Misc",
            sourceDocumentId: null,
            fields: [{ label: "Favorite color", type: "text" }],
        });
        const schema = draftFormToFormSchemaV1(draft);
        expect(fsOf(schema.fields[0])).toBeNull();
        expect(buildCanonicalPrefillFieldMap(schema)[schema.fields[0].id]).toBeUndefined();
    });
});
