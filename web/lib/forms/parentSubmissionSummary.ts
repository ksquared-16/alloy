/**
 * Parent submission summary — "what we already have" vs "what we still need".
 *
 * POS doctrine for parent packets: the parent should mostly CONFIRM information Alloy
 * already holds and only PROVIDE what is missing. This pure helper turns a form schema +
 * the current (prefilled) payload values into that split, so the parent experience can
 * present a confirm-known / provide-missing summary above the form.
 *
 * Pure, deterministic, no I/O. Top-level fields only; `group` (structural) fields are
 * skipped. A field counts as "known" when its current value is present (non-empty).
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";

export interface ParentSummaryField {
    id: string;
    label: string;
    required: boolean;
}

export interface ParentSubmissionSummary {
    /** Fields Alloy already has a value for — the parent confirms these. */
    known: ParentSummaryField[];
    /** Fields with no value yet — the parent provides these. */
    needed: ParentSummaryField[];
    knownCount: number;
    neededCount: number;
    /** Subset of `needed` that is required — the parent's minimum to complete. */
    requiredNeededCount: number;
}

/** Present unless null/undefined, empty/whitespace string, or empty array. */
function isPresent(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

export function buildParentSubmissionSummary(
    schema: Pick<FormSchemaV1, "fields">,
    values: Record<string, unknown>
): ParentSubmissionSummary {
    const known: ParentSummaryField[] = [];
    const needed: ParentSummaryField[] = [];

    for (const field of schema.fields) {
        if (field.type === "group") continue;
        const entry: ParentSummaryField = { id: field.id, label: field.label, required: Boolean(field.required) };
        if (isPresent(values[field.id])) known.push(entry);
        else needed.push(entry);
    }

    return {
        known,
        needed,
        knownCount: known.length,
        neededCount: needed.length,
        requiredNeededCount: needed.filter((f) => f.required).length,
    };
}
