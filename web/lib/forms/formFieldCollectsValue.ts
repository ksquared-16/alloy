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

/**
 * Is the PARTICIPANT asked for this value?
 *
 * A near neighbour of the predicate above, and deliberately not the same question. That one asks
 * whether a field holds a value at all, and the fill paths depend on it: a placement-only
 * destination still receives canonical prefill, or the finished document renders blank. This one
 * asks who supplies the value, which is the only question a conversation cares about.
 *
 * They came apart when a Form stopped asking a family for every box on the page. Of 173 destinations
 * in the certification packet, 100 are placed and not asked — a forty-box vaccine grid the family
 * never fills, prose reproduced beside a signature — and 7 more the platform derives. Sharing one
 * predicate made every one of them a participant need: the conversation counted 151 needs where 73
 * exist, and the parent's progress bar was measuring boxes nobody would ever type into.
 */
export function formFieldAsksParticipant(
    field: Pick<FormField, "type"> & { read_only?: boolean; derived?: unknown },
): boolean {
    if (!formFieldCollectsValue(field)) return false;
    // Placed so the document renders; the family is not asked.
    if (field.read_only === true) return false;
    // Alloy fills it from canonical truth at the moment the source means.
    if (field.derived) return false;
    return true;
}
