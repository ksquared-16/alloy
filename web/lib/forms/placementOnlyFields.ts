/**
 * A box that exists so the document renders, not so a family is asked.
 *
 * Realizing a Form from a scanned artifact places one participant field per source destination —
 * correct for producing the finished document, wrong as an interview. The Oregon CIS alone prints a
 * forty-box vaccine grid whose contents Health owns; the first live packet put every one of those in
 * front of a parent.
 *
 * `read_only` already carries the distinction through prefill and the submission tamper-guard. What
 * was missing is the participant's side of it: a read-only destination that has nothing to show has
 * nothing to say, so it should not occupy a step. A read-only destination that DOES carry a value is
 * a different thing — a confirmed fact — and stays visible, uneditable.
 *
 * Pure. No I/O.
 */

import type { FormField } from "@/lib/forms/schema";

export function isPlacementOnlyForParticipant(field: FormField, values: Record<string, unknown> | undefined): boolean {
    if (field.read_only !== true) return false;
    const v = values?.[field.id];
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}
