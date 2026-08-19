/**
 * Does this field COLLECT something from the person filling the form, or merely PRESENT something?
 *
 * A `text_block` is printed prose — a handbook paragraph, a page heading. It holds no value, cannot
 * be answered, and cannot be outstanding. Treating one as a field to be filled produced participant
 * work items literally named "Page 2" and "Page 3", and counted them against the parent's progress.
 *
 * One predicate, shared by every consumer that reasons about work: the packet field plan and the
 * Enrollment information-needs projection must agree about what a field IS, or a fact can be a need
 * in one and absent in the other.
 *
 * Deliberately NOT folded into `walkScalarFormFields`. That walker's job is structural — flatten
 * groups — and renderers legitimately need the display fields it yields. This is a question about
 * meaning, asked by the consumers that care.
 */

import type { FormField } from "@/lib/forms/schema";

/** Field types that present content rather than collect it. */
export const DISPLAY_ONLY_FORM_FIELD_TYPES: ReadonlySet<string> = new Set(["text_block"]);

export function formFieldCollectsValue(field: Pick<FormField, "type">): boolean {
    return !DISPLAY_ONLY_FORM_FIELD_TYPES.has(field.type);
}
