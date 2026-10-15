/**
 * What the Studio canvas needs to know about an imported form's mappings.
 *
 * The canvas and the inspector are the ones manual forms use, and they take a `FormSchemaV1`. The
 * mapping states live on the DRAFT, because that is where the source provenance is. This module is the
 * join: for every field on the schema it answers "what does Alloy know about this one?", following the
 * operator's unsaved edits rather than the last saved state, so a destination chosen in the inspector
 * turns the field's edge Bend Pine the moment it is chosen.
 *
 * It is a projection, not a second resolver — every state comes from `resolveFieldMapping`.
 */

import type { FormField, FormSchemaV1, FormVisibilityCondition } from "@/lib/forms/schema";
import type { DraftFormField, StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";
import { resolveFieldMapping, type FieldMapping, type FieldMappingState } from "./resolveFieldMapping";

export type MappingAttention = "all" | "mapped" | "needs_mapping" | "suggested" | "form_only";

export const MAPPING_ATTENTION_FILTERS: ReadonlyArray<{ readonly id: MappingAttention; readonly label: string }> = [
    { id: "all", label: "All" },
    { id: "mapped", label: "Mapped" },
    { id: "needs_mapping", label: "Needs mapping" },
    { id: "suggested", label: "Suggested" },
    { id: "form_only", label: "Form only" },
];

/** True when the field is what the chosen filter is about — i.e. drawn at full strength. */
export function matchesAttention(state: FieldMappingState | undefined, filter: MappingAttention): boolean {
    if (filter === "all") return true;
    if (!state) return false;
    if (filter === "form_only") return state === "form_only" || state === "derived";
    return state === filter;
}

function sectionTitleFor(schema: FormSchemaV1, fieldId: string): string {
    for (const section of schema.sections) {
        if (section.field_ids.includes(fieldId)) return section.title ?? "";
    }
    return "";
}

/** True when the field itself stores a real canonical destination — not a placeholder, not nothing. */
export function hasStoredDestination(field: Pick<FormField, "field_source">): boolean {
    const source = field.field_source;
    return Boolean(source?.entity_type) && !PLACEHOLDER_KEYS.has(source?.field_key ?? "");
}

/**
 * "Mapped" is a statement about what the form STORES.
 *
 * `resolveFieldMapping` answers a different question — what the import is allowed to apply — and for a
 * field with no destination it can still conclude "mapped" from its own confident proposal. At import
 * that conclusion is written (`safeImportMappings`), so the two agree. In the Studio they need not: a
 * draft saved before that law, or a question whose destination the operator cleared, has nothing
 * stored, and calling it Mapped would claim answers are written somewhere they are not. That is a
 * suggestion until the operator accepts it, so it is reported as one, with nothing to apply.
 */
function studioMapping(field: FormField, mapping: FieldMapping): FieldMapping {
    if (mapping.state !== "mapped" || hasStoredDestination(field)) return mapping;
    const label = mapping.destinationLabel ?? "a destination";
    return {
        ...mapping,
        state: "suggested",
        explanation: `Alloy thinks this is ${label}. Nothing is stored there until you choose it.`,
        apply: null,
    };
}

/**
 * Resolve every schema field against the draft it came from.
 *
 * The schema field's own `field_source` wins over the draft's: it carries the operator's current
 * intent, including a change they have made and not yet saved.
 */
export function resolveImportedFormMappings(
    schema: FormSchemaV1,
    draft: Pick<StoredFormDraftPreview, "fields">,
): ReadonlyMap<string, FieldMapping> {
    const draftById = new Map<string, DraftFormField>((draft.fields ?? []).map((f) => [f.id, f]));
    const out = new Map<string, FieldMapping>();
    for (const field of schema.fields) {
        // A group is a collection/address concept, not a source field; its children carry the mapping.
        if (field.type === "group") continue;
        if (field.type === "text_block") continue;
        const source = draftById.get(field.id);
        if (!source) continue;
        out.set(
            field.id,
            studioMapping(
                field,
                resolveFieldMapping(
                    { ...source, label: field.label, required: field.required, ...(field.field_source ? { field_source: field.field_source } : { field_source: undefined }) },
                    sectionTitleFor(schema, field.id),
                ),
            ),
        );
    }
    return out;
}

export type MappingCounts = Record<MappingAttention, number>;

/**
 * The number beside each chip, counted with the SAME rule the filter uses.
 *
 * Counting source questions only would have put 12 beside "Mapped" and then shown thirteen things,
 * because a collection or address group is a placement too. A count that disagrees with its own filter
 * is worse than no count.
 */
export function mappingCounts(schema: FormSchemaV1, mappings: ReadonlyMap<string, FieldMapping>): MappingCounts {
    const counts: MappingCounts = { all: 0, mapped: 0, needs_mapping: 0, suggested: 0, form_only: 0 };
    for (const field of schema.fields) {
        if (field.type === "text_block") continue;
        counts.all += 1;
        for (const filter of ["mapped", "needs_mapping", "suggested", "form_only"] as const) {
            if (groupMatches(field, filter) || matchesAttention(mappings.get(field.id)?.state, filter)) {
                counts[filter] += 1;
            }
        }
    }
    return counts;
}

/**
 * The form as the chosen filter shows it.
 *
 * Filtering is an AUTHORING VIEW, not a mutation. The draft is untouched and this returns a projection
 * of the schema, so "Mapped → All" restores the complete form exactly because nothing was ever removed
 * from it — the previous dimming model was replaced because a dimmed field is still something the
 * operator has to read past when they asked to see six fields out of ninety.
 *
 * Section and group rules follow from the same idea: an empty section shell tells the operator nothing
 * and makes the form look damaged, so a section with no surviving field is not rendered. A group is a
 * single concept, so it survives as a whole when it matches — a half-shown address is not an address.
 */
export function filterSchemaForAttention(
    schema: FormSchemaV1,
    mappings: ReadonlyMap<string, FieldMapping>,
    filter: MappingAttention,
): FormSchemaV1 {
    if (filter === "all") return schema;

    const keep = new Set<string>();
    for (const field of schema.fields) {
        if (groupMatches(field, filter)) {
            keep.add(field.id);
            continue;
        }
        if (matchesAttention(mappings.get(field.id)?.state, filter)) keep.add(field.id);
    }

    const sections = schema.sections
        .map((section) => ({ ...section, field_ids: section.field_ids.filter((id) => keep.has(id)) }))
        .filter((section) => section.field_ids.length > 0);

    return {
        ...schema,
        sections,
        // Field order is preserved: a filter reorders nothing, it only narrows.
        fields: schema.fields.filter((f) => keep.has(f.id)),
    };
}

/**
 * Whether a group concept belongs in the filtered view.
 *
 * A group is not a source question with a destination of its own — it IS the destination. A collection
 * or address binding is a canonical placement, so such a group reads as mapped; a plain group holds
 * answers with nowhere canonical to go, so it reads as kept-with-the-form. Text blocks are prose the
 * family reads and are never a mapping decision, so they appear only under All.
 */
function groupMatches(field: FormField, filter: MappingAttention): boolean {
    if (field.type !== "group") return false;
    const bound = Boolean(field.collection_binding || field.address_binding);
    return bound ? filter === "mapped" : filter === "form_only";
}

/** The overlay states, in the shape the shared canvas takes. */
export function canvasMappingStates(mappings: ReadonlyMap<string, FieldMapping>): ReadonlyMap<string, FieldMappingState> {
    const out = new Map<string, FieldMappingState>();
    for (const [id, m] of mappings) out.set(id, m.state);
    return out;
}

/**
 * One schema field's round-trippable properties, and whether it is safe to save yet.
 *
 * The Studio inspector builds a destination in two steps: choosing the record writes
 * `{entity_type, field_key: "custom"}`, and choosing the field replaces the key. That intermediate is
 * NOT a decision — there is nothing canonical to store — so saving it posts no destination, the server
 * answers "form field only", and the readback contradicts the operator mid-sentence. `custom` and
 * `unmapped` therefore mean "still choosing": keep them on screen, keep them out of the payload.
 *
 * An ABSENT `field_source` is different, and it is a real decision: the operator picked "Form field
 * only". That saves, and it must persist, which is why it is reported as a destination of `null` rather
 * than as something to skip.
 */
export type SchemaFieldEdit = {
    readonly label: string;
    readonly required: boolean;
    readonly field_source: { readonly entity_type: string; readonly field_key: string; readonly shared_value_key?: string } | null;
    /**
     * The condition as the operator has it now — `null` meaning "always ask this question".
     *
     * Carried explicitly rather than left to the draft's own copy, because the inspector can now author
     * and CLEAR a condition. Falling back to the stored value would have made clearing one impossible:
     * the save would have put it straight back.
     */
    readonly visible_when: FormVisibilityCondition | null;
    /** The width the operator set in the shared inspector, so side-by-side survives the save. */
    readonly layout_width: "full" | "half" | "third" | "quarter";
};

const PLACEHOLDER_KEYS = new Set(["custom", "unmapped", ""]);

export function editFromSchemaField(field: FormField): SchemaFieldEdit {
    const source = field.field_source;
    const key = source?.field_key ?? "";
    const settled = Boolean(source?.entity_type) && !PLACEHOLDER_KEYS.has(key);
    const clause = field.visibility?.all?.[0] ?? null;
    return {
        label: field.label,
        required: Boolean(field.required),
        field_source: settled
            ? {
                  entity_type: source!.entity_type,
                  field_key: key,
                  // The shared value key is part of the destination's identity; dropping it here quietly
                  // changed a valid canonical mapping on every unrelated save.
                  ...(typeof source!.shared_value_key === "string" && source!.shared_value_key
                      ? { shared_value_key: source!.shared_value_key }
                      : {}),
              }
            : null,
        visible_when: clause ? { field_id: clause.field_id, op: clause.op, value: clause.value } : null,
        layout_width: field.layout_width ?? "full",
    };
}

/** True while the operator has named a record but not yet the field on it. */
export function isDestinationStillBeingChosen(field: FormField): boolean {
    const source = field.field_source;
    if (!source?.entity_type) return false;
    return PLACEHOLDER_KEYS.has(source.field_key ?? "");
}

/**
 * The per-field edits an operator's change actually makes: one entry per question whose round-trippable
 * properties differ between `before` and `next`.
 *
 * Only these are sent. Every other question keeps exactly what the draft stores, so an unrelated edit —
 * a width, a requiredness — can never turn something the Studio is merely showing into a saved
 * destination. A destination still being chosen (record picked, field not yet) is held back, and a
 * question the draft has never seen belongs to the structural save, not this one.
 */
export function changedFieldEdits(
    before: FormSchemaV1,
    next: FormSchemaV1,
    draft: Pick<StoredFormDraftPreview, "fields">,
): Map<string, SchemaFieldEdit> {
    const draftIds = new Set((draft.fields ?? []).map((f) => f.id));
    const beforeById = new Map(before.fields.map((f) => [f.id, f] as const));
    const edits = new Map<string, SchemaFieldEdit>();
    for (const field of next.fields) {
        if (field.type === "group" || field.type === "text_block") continue;
        if (!draftIds.has(field.id)) continue;
        if (isDestinationStillBeingChosen(field)) continue;
        const edit = editFromSchemaField(field);
        const prior = beforeById.get(field.id);
        if (prior && JSON.stringify(editFromSchemaField(prior)) === JSON.stringify(edit)) continue;
        edits.set(field.id, edit);
    }
    return edits;
}
