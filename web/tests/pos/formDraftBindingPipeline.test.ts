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

    it("does NOT bind a recognizable label the operator never decided about", () => {
        /*
         * THIS ASSERTION IS INVERTED ON PURPOSE, AND THE OLD ONE WAS THE DEFECT.
         *
         * It used to require the materializer to fill a binding from the label whenever the operator
         * had left one unset — "recognizable" being the whole justification. That is how the real
         * Admissions import was saved with four approved bindings and stored fifteen: every
         * undecided question quietly acquired the label matcher's best guess, and the guess was then
         * indistinguishable from a decision anyone had actually taken.
         *
         * "Date of Birth" and "Parent Email" are exactly the easy cases that made the old rule look
         * safe. They are still not decisions. The matcher keeps its real job — it is offered to the
         * operator in review — but it no longer writes anything.
         *
         * The rule is asymmetric by design: a missing binding costs one operator decision, a false
         * one silently writes a stranger's fact onto a family's record and looks right doing it.
         */
        const draft = buildManualFormDraft({
            title: "Health",
            sourceDocumentId: null,
            fields: [{ label: "Date of Birth", type: "date" }, { label: "Parent Email", type: "text" }],
        });
        expect(draft.fields[0].field_source).toBeUndefined();

        const schema = draftFormToFormSchemaV1(draft);
        expect(fsOf(schema.fields[0])).toBeNull();
        expect(fsOf(schema.fields[1])).toBeNull();
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
