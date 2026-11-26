import { describe, expect, it } from "vitest";

import {
    editFromSchemaField,
    isDestinationStillBeingChosen,
} from "@/lib/pos/formDraft/importedFormMappingView";
import { buildDraftSavePayload } from "@/lib/pos/formDraft/buildDraftSavePayload";
import { buildManualFormDraft } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";
import { resolveFieldMapping } from "@/lib/pos/formDraft/resolveFieldMapping";
import type { FormField } from "@/lib/forms/schema";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

const field = (over: Partial<FormField>): FormField =>
    ({ id: "f1", type: "text", label: "Anything else?", required: false, ...over }) as FormField;

/**
 * The bug: an operator changed "Form field only" to a record field and the inspector snapped it back.
 *
 * The Studio inspector builds a destination in two steps. Choosing the RECORD writes
 * `{entity_type, field_key: "custom"}`; choosing the FIELD replaces the key. The adapter used to post
 * that intermediate as "no destination", the server rebuilt the draft without one, and the readback
 * overwrote the operator mid-sentence. These tests pin both halves of the repair.
 */
describe("a half-chosen destination is not a decision", () => {
    it("recognises the inspector's intermediate state", () => {
        expect(isDestinationStillBeingChosen(field({ field_source: { entity_type: "child", field_key: "custom" } }))).toBe(true);
        expect(isDestinationStillBeingChosen(field({ field_source: { entity_type: "child", field_key: "unmapped" } }))).toBe(true);
    });

    it("does not mistake a finished choice for an intermediate one", () => {
        expect(isDestinationStillBeingChosen(field({ field_source: { entity_type: "child", field_key: "allergies" } }))).toBe(false);
    });

    it("does not mistake a deliberate Form-only for an intermediate one", () => {
        // No field_source at all is the operator saying "keep it with the form". That IS a decision.
        expect(isDestinationStillBeingChosen(field({}))).toBe(false);
    });

    it("reports a deliberate Form-only as a destination of null, so it is saved and persists", () => {
        expect(editFromSchemaField(field({})).field_source).toBeNull();
    });

    it("never reports a placeholder key as a destination", () => {
        expect(editFromSchemaField(field({ field_source: { entity_type: "child", field_key: "custom" } })).field_source).toBeNull();
    });

    it("reports a settled destination exactly", () => {
        expect(editFromSchemaField(field({ field_source: { entity_type: "child", field_key: "allergies" } })).field_source).toEqual({
            entity_type: "child",
            field_key: "allergies",
        });
    });
});

/* The whole round trip, through the real save payload and the real server-side rebuild. */
function roundTrip(draft: StoredFormDraftPreview, fieldId: string, destination: { entity_type: string; field_key: string } | null) {
    const built = buildDraftSavePayload(draft, new Map([[fieldId, { field_source: destination }]]));
    if (!built.ok) throw new Error(`payload refused: ${built.reason}`);
    return buildManualFormDraft({
        title: built.payload.title,
        sourceDocumentId: draft.source_document_id ?? null,
        fields: built.payload.fields.map((f) => ({ ...f, bbox: f.bbox ? [...f.bbox] as [number, number, number, number] : undefined })),
        sectionDispositions: (draft.sections ?? [])
            .filter((sec) => typeof sec.disposition === "string")
            .map((sec) => ({ title: sec.title, disposition: sec.disposition! })),
    });
}

const baseDraft = {
    title: "Admissions Packet",
    generated_form_name: "Admissions Packet",
    source_document_id: "doc-1",
    sections: [
        { id: "section_1", title: "Child Information", field_ids: ["field_1", "field_2", "field_3"], disposition: "fields" },
    ],
    fields: [
        { id: "field_1", label: "Anything else we should know?", type: "text", required: false, confidence: "high" },
        {
            id: "field_2",
            label: "Allergies?",
            type: "select",
            required: false,
            confidence: "high",
            options: ["Yes", "No", "None known"],
        },
        {
            id: "field_3",
            label: "If yes, please describe",
            type: "text",
            required: false,
            confidence: "high",
            visible_when: { field_id: "field_2", op: "eq", value: "Yes" },
        },
    ],
} as unknown as StoredFormDraftPreview;

const stateOf = (draft: StoredFormDraftPreview, id: string) =>
    resolveFieldMapping(draft.fields.find((f) => f.id === id)!, "Child Information").state;

describe("mapping decisions survive the save, the rebuild and the reload", () => {
    it("A — Form only → mapped, and it stays mapped", () => {
        expect(stateOf(baseDraft, "field_1")).toBe("form_only");
        const after = roundTrip(baseDraft, "field_1", { entity_type: "child", field_key: "allergies" });
        expect(after.fields[0]!.field_source).toEqual({ entity_type: "child", field_key: "allergies" });
        expect(stateOf(after, "field_1")).toBe("mapped");
        // ...and a second save does not undo it.
        const again = roundTrip(after, "field_2", null);
        expect(again.fields[0]!.field_source).toEqual({ entity_type: "child", field_key: "allergies" });
        expect(stateOf(again, "field_1")).toBe("mapped");
    });

    it("B — mapped → a different canonical field, and the new one remains", () => {
        const first = roundTrip(baseDraft, "field_1", { entity_type: "child", field_key: "allergies" });
        const second = roundTrip(first, "field_1", { entity_type: "customer", field_key: "notes" });
        expect(second.fields[0]!.field_source).toEqual({ entity_type: "customer", field_key: "notes" });
        expect(stateOf(second, "field_1")).toBe("mapped");
    });

    it("C — mapped → Form only, and that decision persists too", () => {
        const mapped = roundTrip(baseDraft, "field_1", { entity_type: "child", field_key: "allergies" });
        const back = roundTrip(mapped, "field_1", null);
        expect(back.fields[0]!.field_source).toBeUndefined();
        expect(stateOf(back, "field_1")).toBe("form_only");
    });

    it("D — one field changes and everything else survives untouched", () => {
        const after = roundTrip(baseDraft, "field_1", { entity_type: "child", field_key: "allergies" });
        expect(after.fields.map((f) => f.label)).toEqual([
            "Anything else we should know?",
            "Allergies?",
            "If yes, please describe",
        ]);
        expect(after.sections.map((s) => s.title)).toEqual(["Child Information"]);
        expect(after.sections[0]!.disposition).toBe("fields");
        expect(after.fields[1]!.options).toEqual(["Yes", "No", "None known"]);
        expect(after.fields[2]!.visible_when).toEqual({ field_id: "field_2", op: "eq", value: "Yes" });
        expect(after.fields[1]!.required).toBe(false);
    });

    it("keeps field ids stable across the rebuild, so a condition still points at its trigger", () => {
        const after = roundTrip(baseDraft, "field_1", { entity_type: "child", field_key: "allergies" });
        expect(after.fields.map((f) => f.id)).toEqual(["field_1", "field_2", "field_3"]);
        // The condition's target is still the question it was authored against.
        expect(after.fields.find((f) => f.id === after.fields[2]!.visible_when!.field_id)?.label).toBe("Allergies?");
    });
});
