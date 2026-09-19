/**
 * Is this authored label a QUESTION, and if so is it a closed one?
 *
 * ## Why one owner
 *
 * Two layers need the same answer about the same string and were each about to grow their own rule.
 *
 *   The IMPORTER asks it to choose an interaction type for an extracted line — a question opening
 *   "Does your child…" is a yes/no box, not a paragraph.
 *
 *   The PARTICIPANT RUNTIME asks it to tell an acknowledgement from a question. "I acknowledge the
 *   information above is accurate" is a statement a family accepts beside the document it refers
 *   to; "Does your child have siblings?" is a question the conversation asks out loud. Both are
 *   unbound, required booleans, so structure alone cannot separate them — and the rule that only
 *   looked at structure silently removed every genuine yes/no question from the conversation.
 *
 * ## It is grammar, not vocabulary
 *
 * This is deliberately NOT a list of labels or of school words. A question in English opens with an
 * auxiliary verb or a wh- word; a statement does not. That distinction survives a tenant who writes
 * "I agree" instead of "I acknowledge", and it survives a school whose questions nobody has ever
 * seen — which a keyword list does not. It is also why the leading word is consulted positionally:
 * "why do you need this" opens with one, "reason: why we moved" does not.
 *
 * Pure. No I/O.
 */

/**
 * Auxiliary and modal verbs that open a CLOSED question — one answerable yes or no.
 *
 * "Has your child ever been stung by a bee or wasp?" "Is your child able to play alone?"
 */
const AUXILIARY_LEAD = /^(has|have|does|do|did|is|are|was|were|can|could|will|would|should|may|must|shall|am)\b/i;

/**
 * Wh- words that open an OPEN question — one whose answer is words.
 *
 * "How is your child comforted?" is a question and is not a yes/no.
 */
const INTERROGATIVE_LEAD = /^(how|what|whats|what's|when|where|which|who|whom|whose|why)\b/i;

/** Strip the decoration an authoring tool or a source document leaves around a label. */
function core(label: string | null | undefined): string {
    return (label ?? "")
        .replace(/^\(optional\)\s*/i, "")
        .replace(/^[\s*•\-–—\d.)]+/, "")
        .trim();
}

/**
 * A NEGATED bare verb opens an instruction, never a question.
 *
 * "Do not send medication in your child's backpack" fronts an auxiliary exactly as a question does,
 * and is the one construction that regularly does so without asking anything. Consulted only where
 * the author left no "?" — "Is not your child enrolled?" is still a question, because it says so.
 */
const NEGATED_IMPERATIVE = /^(do|does|did|is|are|was|were|can|could|will|would|should|may|must)\s+(not|n't)\b/i;

/**
 * Does this label READ as a question — open or closed?
 *
 * A trailing "?" alone is enough: the author said so. Absent one, the opening word decides, because
 * a heading that merely begins with a verb ("Sign below") is an instruction rather than a question.
 *
 * Where the author left no "?" and the opening is genuinely ambiguous, this leans toward QUESTION.
 * The two mistakes are not symmetric: a statement misread as a question is asked out loud, which a
 * person sees and an operator can correct, while a question misread as a statement is removed from
 * the conversation with nothing said — which is the failure that made this clause necessary.
 */
export function labelIsQuestion(label: string | null | undefined): boolean {
    const t = core(label);
    if (!t) return false;
    if (t.endsWith("?")) return true;
    if (NEGATED_IMPERATIVE.test(t)) return false;
    return AUXILIARY_LEAD.test(t) || INTERROGATIVE_LEAD.test(t);
}

/**
 * Does this label read as a question answerable YES or NO?
 *
 * Both halves are required. The "?" keeps an instruction out — "Do not send medication" opens with
 * an auxiliary and is not a question — and the auxiliary opener keeps an open question out, so
 * "How is your child comforted?" is never offered two buttons.
 */
export function labelIsClosedQuestion(label: string | null | undefined): boolean {
    const t = core(label);
    if (!t.endsWith("?")) return false;
    return AUXILIARY_LEAD.test(t);
}
