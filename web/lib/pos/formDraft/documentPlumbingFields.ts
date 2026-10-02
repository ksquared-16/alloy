/**
 * A control the document never asked anybody about.
 *
 * `subject_line` turned up on an imported form and the Director could not find it anywhere in their
 * source — because it is not in the source as a QUESTION. The hosted-form reader falls back to a
 * control's `name` attribute when no human label is associated with it (`label: d.label || d.name`, and
 * it marks that case `confidence: "low"` precisely because no label existed). A mail-handling input
 * named `subject_line` with no label therefore arrived as a question whose entire prompt was its own
 * machine name, and the form asked a family to fill in the email subject.
 *
 * The product already had the right judgement written down — `looksLikeStructuralIdentifier` in
 * `participantQuestionEligibility`, whose comment reads "a snake_case identifier is document plumbing —
 * `subject_line` is not a thing to ask anyone". It was only wired into the concept/discovery path, so a
 * plain document import never consulted it. This module is that judgement applied where drafts are
 * built, and it reuses the existing predicate rather than restating it.
 *
 * The test is deliberately narrow, because dropping a real question would be far worse than keeping a
 * technical one. All three must hold: the reader found no label, the label is a bare snake_case token,
 * and that token is the control's own name. A question a human wrote keeps its wording and survives.
 */

import { looksLikeStructuralIdentifier } from "@/lib/pos/processingCase/formDraft/participantQuestionEligibility";

export type PlumbingCandidate = {
    readonly label: string;
    /** "high" when the reader found a real label; "low" when it fell back to the control's name. */
    readonly confidence?: string;
    /** The reader's provenance string, e.g. `hosted_form:container:subject_line`. */
    readonly evidence?: string;
};

/**
 * Is this field the document's plumbing rather than one of its questions?
 *
 * Returns false for anything it is not sure about. A labelled control, a prompt with a space in it, or
 * a snake_case label that is NOT the control's own name all stay on the form.
 */
export function isDocumentPlumbingField(field: PlumbingCandidate): boolean {
    const label = field.label.trim();
    if (!label) return false;
    // A label the reader actually found is a prompt somebody wrote. Never dropped.
    if (field.confidence !== "low") return false;
    if (!looksLikeStructuralIdentifier(label)) return false;
    // ...and the bare token has to be the control's own name, which is what the fallback copied.
    const evidence = field.evidence ?? "";
    if (!evidence.startsWith("hosted_form:")) return false;
    const controlName = evidence.slice(evidence.lastIndexOf(":") + 1);
    return controlName.length > 0 && controlName === label;
}

/** Said once per draft, so a dropped control is visible rather than silently gone. */
export function plumbingWarning(labels: readonly string[]): string | null {
    const named = labels.filter(Boolean);
    if (named.length === 0) return null;
    return `Left out of the form: ${named.join(", ")} — ${
        named.length === 1 ? "this is" : "these are"
    } how the page handles itself, not ${named.length === 1 ? "a question" : "questions"} for a family.`;
}


/**
 * Plumbing already sitting on a persisted draft.
 *
 * A draft created before the importer learned this rule still carries the control, and the rule cannot
 * reach backwards. Hiding it on the canvas would be a lie about what the form contains, and rewriting
 * the draft silently would be worse — an operator may have edited around it. So the surface NAMES what
 * it found and offers removal; this is only the finding half.
 */
export function plumbingFieldsOnDraft(
    fields: readonly PlumbingCandidate[] & readonly { readonly id?: string }[],
): ReadonlyArray<{ readonly id: string; readonly label: string }> {
    const out: Array<{ id: string; label: string }> = [];
    for (const field of fields) {
        const id = (field as { id?: string }).id;
        if (!id) continue;
        if (isDocumentPlumbingField(field)) out.push({ id, label: field.label.trim() });
    }
    return out;
}
