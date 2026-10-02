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

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
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
            resolveFieldMapping(
                { ...source, label: field.label, required: field.required, ...(field.field_source ? { field_source: field.field_source } : { field_source: undefined }) },
                sectionTitleFor(schema, field.id),
            ),
        );
    }
    return out;
}

export type MappingCounts = Record<MappingAttention, number>;

export function mappingCounts(mappings: ReadonlyMap<string, FieldMapping>): MappingCounts {
    const counts: MappingCounts = { all: 0, mapped: 0, needs_mapping: 0, suggested: 0, form_only: 0 };
    for (const m of mappings.values()) {
        counts.all += 1;
        if (m.state === "mapped") counts.mapped += 1;
        else if (m.state === "needs_mapping") counts.needs_mapping += 1;
        else if (m.state === "suggested") counts.suggested += 1;
        else counts.form_only += 1;
    }
    return counts;
}

/** Field ids to de-emphasise under the chosen filter. Membership never changes — only emphasis. */
export function dimmedFieldIds(
    schema: FormSchemaV1,
    mappings: ReadonlyMap<string, FieldMapping>,
    filter: MappingAttention,
): ReadonlySet<string> {
    const dimmed = new Set<string>();
    if (filter === "all") return dimmed;
    for (const field of schema.fields) {
        if (!matchesAttention(mappings.get(field.id)?.state, filter)) dimmed.add(field.id);
    }
    return dimmed;
}

/** The overlay states, in the shape the shared canvas takes. */
export function canvasMappingStates(mappings: ReadonlyMap<string, FieldMapping>): ReadonlyMap<string, FieldMappingState> {
    const out = new Map<string, FieldMappingState>();
    for (const [id, m] of mappings) out.set(id, m.state);
    return out;
}

/** The round-trippable properties of one schema field, for the whole-draft save. */
export function editFromSchemaField(field: FormField): {
    readonly label: string;
    readonly required: boolean;
    readonly field_source: { readonly entity_type: string; readonly field_key: string } | null;
} {
    const source = field.field_source;
    const usable = source?.entity_type && source?.field_key && source.field_key !== "custom" && source.field_key !== "unmapped";
    return {
        label: field.label,
        required: Boolean(field.required),
        field_source: usable ? { entity_type: source!.entity_type, field_key: source!.field_key } : null,
    };
}
