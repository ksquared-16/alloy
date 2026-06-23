/**
 * Parent Guided Intake — pure partitioning of a form into guided stages.
 *
 * Turns a form schema + current (prefilled) payload into the ordered stages of a guided
 * intake experience, so the parent confirms known data, provides missing data, and handles
 * uploads/signatures separately — instead of facing one raw form. Pure, deterministic, no
 * I/O. `subSchemaForFields` lets the shell render each stage with the EXISTING form engine
 * over the SAME payload (no storage rebuild).
 *
 * Top-level fields only; `group` (structural) fields are excluded from staging (rendered
 * with the rest in the form step if needed). Reuses the known/missing notion from
 * `parentSubmissionSummary`.
 */

import type { FormSchemaV1, FormField } from "@/lib/forms/schema";

export type GuidedStageKey = "welcome" | "review_known" | "fill_missing" | "uploads" | "review" | "submit";

export interface GuidedFieldRef {
    id: string;
    label: string;
    required: boolean;
    type: FormField["type"];
}

export interface GuidedIntakePartition {
    /** Scalar fields Alloy already has a value for — the parent confirms these. */
    known: GuidedFieldRef[];
    /** Scalar fields with no value yet — the parent provides these. */
    missing: GuidedFieldRef[];
    /** Upload + signature fields — handled in their own step. */
    uploads: GuidedFieldRef[];
    /** Ordered stage keys, including only stages that have content (welcome/review/submit always present). */
    stages: GuidedStageKey[];
    counts: { known: number; missing: number; uploads: number; requiredMissing: number };
}

const UPLOAD_TYPES = new Set<FormField["type"]>(["file_ref", "signature"]);

function isPresent(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

export function buildGuidedIntakePartition(
    schema: Pick<FormSchemaV1, "fields">,
    values: Record<string, unknown>
): GuidedIntakePartition {
    const known: GuidedFieldRef[] = [];
    const missing: GuidedFieldRef[] = [];
    const uploads: GuidedFieldRef[] = [];

    for (const field of schema.fields) {
        if (field.type === "group") continue;
        const ref: GuidedFieldRef = { id: field.id, label: field.label, required: Boolean(field.required), type: field.type };
        if (UPLOAD_TYPES.has(field.type)) {
            uploads.push(ref);
        } else if (isPresent(values[field.id])) {
            known.push(ref);
        } else {
            missing.push(ref);
        }
    }

    const stages: GuidedStageKey[] = ["welcome"];
    if (known.length > 0) stages.push("review_known");
    if (missing.length > 0) stages.push("fill_missing");
    if (uploads.length > 0) stages.push("uploads");
    stages.push("review", "submit");

    return {
        known,
        missing,
        uploads,
        stages,
        counts: {
            known: known.length,
            missing: missing.length,
            uploads: uploads.length,
            requiredMissing: missing.filter((m) => m.required).length,
        },
    };
}

/**
 * Build a valid FormSchemaV1 containing only `fieldIds` (one section), preserving field
 * order from the source schema. Lets the guided shell render a stage's subset with the
 * existing FormEngineRenderer, bound to the same payload. Group fields are included whole
 * if referenced.
 */
export function subSchemaForFields(schema: FormSchemaV1, fieldIds: string[], title?: string): FormSchemaV1 {
    const want = new Set(fieldIds);
    const fields = schema.fields.filter((f) => want.has(f.id));
    return {
        schema_version: 1,
        title: title ?? schema.title,
        sections: [{ id: "guided-stage", title, field_ids: fields.map((f) => f.id) }],
        fields,
    };
}

/**
 * Sub-schema for a field subset that PRESERVES the form's section grouping (and titles), so
 * a single guided screen still shows section headers — batching related fields and showing
 * progress by section rather than one screen per field. Sections with no included fields are
 * dropped; fields outside any section trail in a final group.
 */
export function subSchemaForFieldsGrouped(schema: FormSchemaV1, fieldIds: string[], title?: string): FormSchemaV1 {
    const want = new Set(fieldIds);
    const fields = schema.fields.filter((f) => want.has(f.id));
    const sections = schema.sections
        .map((s) => ({ ...s, field_ids: s.field_ids.filter((id) => want.has(id)) }))
        .filter((s) => s.field_ids.length > 0);
    const inSection = new Set(sections.flatMap((s) => s.field_ids));
    const orphans = fields.filter((f) => !inSection.has(f.id)).map((f) => f.id);
    if (orphans.length > 0) sections.push({ id: "guided-extra", field_ids: orphans });
    return { schema_version: 1, title: title ?? schema.title, sections, fields };
}
