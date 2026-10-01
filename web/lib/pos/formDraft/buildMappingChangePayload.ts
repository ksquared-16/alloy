/**
 * Changing ONE question's destination, without losing the rest of the draft.
 *
 * `POST .../form-draft/save` does not patch — it REBUILDS the draft from the fields it is given. That
 * is fine for the manual builder, which owns the whole field list, and dangerous for a surface that
 * only wants to answer "this address belongs to a parent": posting the single changed field would
 * silently delete every other question an operator had just reviewed.
 *
 * So the payload is built from the draft as it stands, with exactly one field's destination replaced.
 * Pure, and tested, because the failure mode is data loss rather than an error message.
 */

import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/** The choices an operator is offered, in their language. Each carries the destination it means. */
export type MappingChoice = {
    readonly id: string;
    readonly label: string;
    /** Absent means "keep it with the form" — collected as evidence, no canonical destination. */
    readonly destination: { readonly entity_type: string; readonly field_key: string } | null;
};

export type MappingSavePayload = {
    readonly title: string;
    readonly form_name: string | null;
    readonly fields: readonly {
        readonly label: string;
        readonly type: string;
        readonly required: boolean;
        readonly field_source?: { readonly entity_type: string; readonly field_key: string };
    }[];
    readonly section_dispositions: readonly { readonly id: string; readonly disposition: string }[];
};

export type MappingChangeResult =
    | { readonly ok: true; readonly payload: MappingSavePayload }
    /** The field is not on this draft — refuse rather than post a list that silently drops it. */
    | { readonly ok: false; readonly reason: "unknown_field" | "no_fields" };

export function buildMappingChangePayload(
    draft: Pick<StoredFormDraftPreview, "title" | "generated_form_name" | "fields" | "sections">,
    fieldId: string,
    choice: MappingChoice,
): MappingChangeResult {
    const fields = draft.fields ?? [];
    if (!fields.length) return { ok: false, reason: "no_fields" };
    if (!fields.some((f) => f.id === fieldId)) return { ok: false, reason: "unknown_field" };

    return {
        ok: true,
        payload: {
            title: draft.title,
            form_name: (draft.generated_form_name ?? "").trim() || null,
            fields: fields.map((f) => {
                const base = { label: f.label, type: f.type, required: Boolean(f.required) };
                if (f.id !== fieldId) {
                    return f.field_source?.entity_type && f.field_source?.field_key
                        ? { ...base, field_source: { entity_type: f.field_source.entity_type, field_key: f.field_source.field_key } }
                        : base;
                }
                // The changed one. A null destination means the operator chose to keep it form-only,
                // which is expressed by omitting field_source rather than by sending an empty one.
                return choice.destination ? { ...base, field_source: { ...choice.destination } } : base;
            }),
            // Section fate is the operator's earlier decision and is not what this control changes.
            section_dispositions: (draft.sections ?? [])
                .filter((s) => typeof s.disposition === "string")
                .map((s) => ({ id: s.id, disposition: String(s.disposition) })),
        },
    };
}

/**
 * The destinations an operator can pick from, in business terms.
 *
 * Deliberately short. A long list of every canonical field would be the decision queue again, in a
 * dropdown; these are the answers to "whose answer is this?", which is the question the red line asks.
 */
export function mappingChoicesFor(answerShape: string): readonly MappingChoice[] {
    const isAddressish = /address/i.test(answerShape);
    return [
        { id: "child", label: "The child", destination: { entity_type: "customer_member", field_key: isAddressish ? "address_line1" : "value" } },
        { id: "guardian", label: "A parent or guardian", destination: { entity_type: "person", field_key: isAddressish ? "address_line1" : "value" } },
        { id: "household", label: "The household", destination: { entity_type: "customer", field_key: isAddressish ? "address_line1" : "value" } },
        { id: "form_only", label: "Keep it with the form", destination: null },
    ];
}
