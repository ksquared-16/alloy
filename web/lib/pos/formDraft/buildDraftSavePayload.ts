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
    readonly layout_width?: "full" | "half" | "third" | "quarter";
    readonly confidence?: "high" | "medium" | "low";
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
    readonly layout_width?: "full" | "half" | "third" | "quarter";
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
    const width = edit?.layout_width ?? field.layout_width;
    // Never edited by an operator — it is what the importer concluded, and it must survive the rebuild.
    const confidence = field.confidence;
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
        ...(width && width !== "full" ? { layout_width: width } : {}),
        ...(confidence ? { confidence } : {}),
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
    /**
     * Questions to leave off the rebuilt draft entirely.
     *
     * Only ever used for an explicit operator removal — the save route rebuilds from what it is given,
     * so an omission here is a deletion. Never populated automatically.
     */
    omitFieldIds: ReadonlySet<string> = new Set(),
): DraftSaveResult {
    const all = draft.fields ?? [];
    if (!all.length) return { ok: false, reason: "no_fields" };
    for (const id of edits.keys()) {
        if (!all.some((f) => f.id === id)) return { ok: false, reason: "unknown_field" };
    }
    const fields = all.filter((f) => !omitFieldIds.has(f.id));
    if (!fields.length) return { ok: false, reason: "no_fields" };
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


/**
 * Saving a form whose STRUCTURE the operator changed, not just its properties.
 *
 * The per-field edit path assumes every form field is still a draft field, which stops being true the
 * moment an operator splits "Parent/Guardian #1 Name" into two questions: the parts have ids the draft
 * has never seen, so a per-field save silently skipped them and the split did not survive. The same is
 * true of an address group, which is one form field standing for several draft fields.
 *
 * So when the structure has moved, the SCHEMA is the authority for what the form contains and the draft
 * is the authority for where each question came from. Every schema field is walked in order — a group
 * contributing its children, because the draft model is flat — and provenance is carried across by id
 * for anything the draft still recognises. A part the operator just created has no provenance to carry,
 * which is correct: it came from them, not from the page.
 */
export function buildDraftSavePayloadFromSchema(
    draft: DraftShape,
    schema: {
        readonly title?: string;
        readonly sections: readonly { readonly id: string; readonly title?: string; readonly field_ids: readonly string[] }[];
        readonly fields: readonly {
            readonly id: string;
            readonly type: string;
            readonly label: string;
            readonly required?: boolean;
            readonly layout_width?: "full" | "half" | "third" | "quarter";
            readonly field_source?: { readonly entity_type: string; readonly field_key: string; readonly shared_value_key?: string };
            readonly visibility?: { readonly all?: readonly FormVisibilityCondition[] };
            readonly static_options?: readonly { readonly value: string; readonly label: string }[];
            readonly fields?: readonly unknown[];
        }[];
    },
): DraftSaveResult {
    const draftById = new Map((draft.fields ?? []).map((f) => [f.id, f]));
    const sectionTitleByFieldId = new Map<string, string>();
    for (const section of schema.sections) {
        for (const id of section.field_ids) sectionTitleByFieldId.set(id, section.title ?? "Form fields");
    }
    const byId = new Map(schema.fields.map((f) => [f.id, f]));

    const out: DraftSaveField[] = [];
    const emit = (field: (typeof schema.fields)[number], sectionTitle: string): void => {
        // Prose the family reads is not a question; the draft keeps it as section text, not a field.
        if (field.type === "text_block") return;
        if (field.type === "group" && Array.isArray(field.fields)) {
            for (const child of field.fields as (typeof schema.fields)[number][]) emit(child, sectionTitle);
            return;
        }
        const source = draftById.get(field.id);
        const clause = field.visibility?.all?.[0];
        const options = field.static_options?.length
            ? field.static_options.map((o) => o.label)
            : source?.options;
        out.push({
            label: field.label,
            type: field.type,
            required: Boolean(field.required),
            ...(sectionTitle ? { section: sectionTitle } : {}),
            ...(source?.description ? { description: source.description } : {}),
            ...(options?.length ? { options: [...options] } : {}),
            ...(source?.pdf_field_name ? { pdf_field_name: source.pdf_field_name } : {}),
            ...(typeof source?.page === "number" ? { page: source.page } : {}),
            ...(source?.bbox ? { bbox: source.bbox } : {}),
            ...(source?.evidence ? { evidence: source.evidence } : {}),
            ...(field.field_source?.entity_type && field.field_source?.field_key && field.field_source.field_key !== "custom" && field.field_source.field_key !== "unmapped"
                ? {
                      field_source: {
                          entity_type: field.field_source.entity_type,
                          field_key: field.field_source.field_key,
                          ...(field.field_source.shared_value_key ? { shared_value_key: field.field_source.shared_value_key } : {}),
                      },
                  }
                : {}),
            ...(clause ? { visible_when: clause } : {}),
            ...(field.layout_width && field.layout_width !== "full" ? { layout_width: field.layout_width } : {}),
            ...(source?.confidence ? { confidence: source.confidence } : {}),
        });
    };

    for (const section of schema.sections) {
        for (const id of section.field_ids) {
            const field = byId.get(id);
            if (field) emit(field, section.title ?? "Form fields");
        }
    }

    if (!out.length) return { ok: false, reason: "no_fields" };
    return {
        ok: true,
        payload: {
            title: draft.title,
            form_name: (draft.generated_form_name ?? "").trim() || null,
            fields: out,
            section_dispositions: (draft.sections ?? [])
                .filter((s) => typeof s.disposition === "string")
                .map((s) => ({ id: s.id, disposition: String(s.disposition) })),
        },
    };
}
