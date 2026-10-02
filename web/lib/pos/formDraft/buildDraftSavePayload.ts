/**
 * Saving the draft without losing the parts you did not touch.
 *
 * `POST .../form-draft/save` does not patch — it REBUILDS the draft from the fields it is handed.
 * That is safe for a surface that owns the whole field list and dangerous for one answering a single
 * question like "this address belongs to a parent", because anything missing from the payload is
 * deleted rather than left alone.
 *
 * The previous one-field builder sent only label, type, required and the destination. Everything else
 * a field carried was therefore dropped on the next mapping change: its SECTION (so the document
 * collapsed into one unnamed section), its accepted CONDITION, its CHOICES, and its page/region
 * provenance. Each of those is a thing an operator had already decided or the importer had already
 * found, so this module's job is to put every round-trippable property back on the wire.
 *
 * Round-trippable means: accepted by the save route and preserved by `buildManualFormDraft`. Anything
 * the rebuild cannot carry is not silently half-sent — it is listed here so the gap is visible.
 */

import type { DraftFormField, StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import type { FormVisibilityCondition } from "@/lib/forms/schema";

export type { MappingChoice } from "./buildDraftSavePayload.types";

/** One field exactly as the save route reads it. */
export type DraftSaveField = {
    readonly label: string;
    readonly type: string;
    readonly required: boolean;
    /** The section title. Omit it and every field lands in one default section. */
    readonly section?: string;
    readonly description?: string;
    readonly options?: readonly string[];
    readonly pdf_field_name?: string;
    readonly page?: number;
    readonly bbox?: readonly [number, number, number, number];
    readonly evidence?: string;
    readonly field_source?: { readonly entity_type: string; readonly field_key: string; readonly shared_value_key?: string };
    readonly visible_when?: FormVisibilityCondition;
};

export type DraftSavePayload = {
    readonly title: string;
    readonly form_name: string | null;
    readonly fields: readonly DraftSaveField[];
    readonly section_dispositions: readonly { readonly id: string; readonly disposition: string }[];
};

/** Per-field changes an operator made, keyed by the draft field id. Absent keys are left untouched. */
export type DraftFieldEdit = {
    readonly label?: string;
    readonly required?: boolean;
    /** `null` means "keep it with the form" — no canonical destination, expressed by omission. */
    readonly field_source?: { readonly entity_type: string; readonly field_key: string } | null;
    readonly options?: readonly string[];
    readonly visible_when?: FormVisibilityCondition | null;
};

export type DraftSaveResult =
    | { readonly ok: true; readonly payload: DraftSavePayload }
    /** A named field is not on this draft — refuse rather than post a list that drops it. */
    | { readonly ok: false; readonly reason: "unknown_field" | "no_fields" };

type DraftShape = Pick<StoredFormDraftPreview, "title" | "generated_form_name" | "fields" | "sections">;

function sectionTitleByFieldId(draft: DraftShape): Map<string, string> {
    const map = new Map<string, string>();
    for (const section of draft.sections ?? []) {
        for (const id of section.field_ids ?? []) map.set(id, section.title);
    }
    return map;
}

function carryOver(field: DraftFormField, sectionTitle: string | undefined, edit: DraftFieldEdit | undefined): DraftSaveField {
    const source = edit?.field_source === undefined ? field.field_source : edit.field_source;
    const condition = edit?.visible_when === undefined ? field.visible_when : edit.visible_when;
    const options = edit?.options ?? field.options;
    return {
        label: edit?.label ?? field.label,
        type: field.type,
        required: edit?.required ?? Boolean(field.required),
        ...(sectionTitle ? { section: sectionTitle } : {}),
        ...(field.description ? { description: field.description } : {}),
        ...(options?.length ? { options: [...options] } : {}),
        ...(field.pdf_field_name ? { pdf_field_name: field.pdf_field_name } : {}),
        ...(typeof field.page === "number" ? { page: field.page } : {}),
        ...(field.bbox ? { bbox: field.bbox } : {}),
        ...(field.evidence ? { evidence: field.evidence } : {}),
        ...(source?.entity_type && source?.field_key
            ? {
                  field_source: {
                      entity_type: source.entity_type,
                      field_key: source.field_key,
                      ...("shared_value_key" in source && typeof source.shared_value_key === "string"
                          ? { shared_value_key: source.shared_value_key }
                          : {}),
                  },
              }
            : {}),
        ...(condition ? { visible_when: condition } : {}),
    };
}

/**
 * The whole draft, with the named edits applied.
 *
 * Field order is preserved exactly, which matters beyond appearances: the rebuild renumbers ids
 * positionally, so a condition pointing at `field_4` keeps pointing at the same question only while
 * the order and the count hold.
 */
export function buildDraftSavePayload(
    draft: DraftShape,
    edits: ReadonlyMap<string, DraftFieldEdit> = new Map(),
): DraftSaveResult {
    const fields = draft.fields ?? [];
    if (!fields.length) return { ok: false, reason: "no_fields" };
    for (const id of edits.keys()) {
        if (!fields.some((f) => f.id === id)) return { ok: false, reason: "unknown_field" };
    }
    const titles = sectionTitleByFieldId(draft);
    return {
        ok: true,
        payload: {
            title: draft.title,
            form_name: (draft.generated_form_name ?? "").trim() || null,
            fields: fields.map((f) => carryOver(f, titles.get(f.id), edits.get(f.id))),
            // Section fate is an earlier operator decision; no field edit changes it.
            section_dispositions: (draft.sections ?? [])
                .filter((s) => typeof s.disposition === "string")
                .map((s) => ({ id: s.id, disposition: String(s.disposition) })),
        },
    };
}

/** The common case: one field's destination changes and nothing else moves. */
export function buildMappingChangePayload(
    draft: DraftShape,
    fieldId: string,
    destination: { readonly entity_type: string; readonly field_key: string } | null,
): DraftSaveResult {
    return buildDraftSavePayload(draft, new Map([[fieldId, { field_source: destination }]]));
}
