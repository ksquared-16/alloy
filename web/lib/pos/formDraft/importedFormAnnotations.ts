/**
 * The two things an imported question knows that a `FormSchemaV1` field cannot say.
 *
 * Almost everything the importer learns has somewhere canonical to live: a question becomes a field, an
 * accepted condition becomes `visibility`, a repeatable becomes a collection-bound group, an address
 * becomes an address-bound group. Two do not, and both were previously computed inside a presenter that
 * is being retired along with the question-card surface — so they are extracted here rather than lost.
 *
 *  1. ABSENCE. Paper that offers "None" is telling you a family can have nothing to report. That is
 *     real information about the question, and it is read only from choices the SOURCE declared —
 *     inventing the affordance would change what the document asks.
 *  2. A SUGGESTED condition. The importer notices that "If yes, please describe" follows a yes/no
 *     question. Noticing is not agreeing: nothing is hidden from a family until an operator accepts it,
 *     so the suggestion has no schema representation by design. It still has to be visible, or the
 *     operator never gets the chance to accept it.
 */

import type { DraftFormField } from "@/lib/pos/processingCase/formDraft/types";

/**
 * A choice that means "nothing to report".
 *
 * Matched on whole choices rather than substrings, so "No known allergies" counts and "Nonbinary" does
 * not. Never offered on a required question, which by definition has no nothing-to-report answer.
 */
const ABSENCE_CHOICE =
    /^(none|n\/?a|not applicable|no known [a-z ]+|none known|none at (this )?time|no|we (do not|don'?t) have (one|any)|nothing)$/i;

export function absenceTextFor(field: Pick<DraftFormField, "required" | "options">): string | null {
    if (field.required) return null;
    const offered = (field.options ?? [])
        .map((o) => o.trim())
        .filter(Boolean)
        .find((o) => ABSENCE_CHOICE.test(o));
    return offered ? `Allows “${offered}”` : null;
}

/** An explicit "if yes" is a strong read; a bare "please describe" is a weaker one. Both are offers. */
const EXPLICIT_IF = /^\s*(if\s+(yes|so|true|checked|applicable)\b|if\s+the\s+answer\s+is\s+yes\b)/i;
const SOFT_FOLLOW_UP =
    /^\s*(please\s+(describe|explain|list|specify)|if\s+(no|not)\b|describe\b|explain\b|details?\b|which\b|list\b)/i;

export type SuggestedCondition = {
    /** The yes/no question above it that appears to govern this one. */
    readonly triggerFieldId: string;
    readonly triggerLabel: string;
    /** The answer that appears to reveal it. */
    readonly triggerValue: "Yes";
};

/**
 * Conditions the importer noticed and nobody has accepted.
 *
 * Detected only directly after a yes/no question, and only from the follow-up's own wording. A field
 * that ALREADY carries an accepted condition is not offered a suggestion — the decision is made.
 */
export function suggestedConditionsFor(
    fieldsInOrder: readonly DraftFormField[],
): ReadonlyMap<string, SuggestedCondition> {
    const out = new Map<string, SuggestedCondition>();
    for (let i = 1; i < fieldsInOrder.length; i += 1) {
        const field = fieldsInOrder[i]!;
        const previous = fieldsInOrder[i - 1]!;
        if (field.visible_when) continue;
        if (previous.type !== "boolean") continue;
        if (field.type === "signature" || field.type === "file_ref") continue;
        if (!EXPLICIT_IF.test(field.label) && !SOFT_FOLLOW_UP.test(field.label)) continue;
        out.set(field.id, { triggerFieldId: previous.id, triggerLabel: previous.label, triggerValue: "Yes" });
    }
    return out;
}
