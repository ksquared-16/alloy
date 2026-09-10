/**
 * Is this free text a QUESTION the parent is asking, rather than an answer they are giving?
 *
 * ## Why this is deterministic, and stays deterministic
 *
 * The participant runtime takes free text whole on a collect turn — "a plain answer to a plain
 * question is the answer". That rule is right, and it had three guards, none of which asked whether
 * the words were an answer at all. So a parent who typed
 *
 *     "What do I still need to do?"
 *
 * had it written as their child's emergency contact first name, settled, and carried toward a form
 * with a fidelity map that would have printed it onto Oregon paperwork.
 *
 * The obvious fix — ask a model whether this looks like a question — is refused here for the same
 * reason the rest of this layer refuses similarity matching: it would make a data-integrity
 * guarantee depend on model uptime and model judgement. This is set membership and punctuation, the
 * same class of decision as the affirmation list next door.
 *
 * ## It fails in the safe direction, deliberately
 *
 * A false positive costs a parent one extra tap: the runtime answers them and re-offers the same
 * question, and their words are still there to send. A false negative writes a question into a
 * child's legal paperwork. Those are not symmetric, so the rule leans toward "this might be a
 * question" and lets the parent insist.
 *
 * Nothing here decides what to DO about a question — only what the words are shaped like.
 */

/**
 * Words that open a question in English.
 *
 * Deliberately not "any sentence containing why". A lead word is a strong, cheap signal precisely
 * because it is positional: "why do you need this" opens with one, "reason: why we moved" does not.
 */
const INTERROGATIVE_LEADS = new Set([
    "what",
    "whats",
    "what's",
    "why",
    "when",
    "where",
    "who",
    "whom",
    "whose",
    "which",
    "how",
    "can",
    "could",
    "should",
    "would",
    "will",
    "do",
    "does",
    "did",
    "is",
    "are",
    "am",
    "was",
    "were",
    "have",
    "has",
    "may",
    "must",
]);

/** Openers that are asking for help rather than asking a question, and are equally not answers. */
const HELP_LEADS = new Set(["help", "explain", "tell", "show", "i'm", "im", "i"]);

const HELP_PHRASES = [
    "i don't understand",
    "i dont understand",
    "i'm not sure what",
    "im not sure what",
    "i need help",
    "what does this mean",
];

function firstWord(text: string): string {
    const m = text.match(/^[a-z']+/i);
    return (m?.[0] ?? "").toLowerCase();
}

/**
 * True when the words read as a question or a request for help.
 *
 * @param text raw participant free text
 */
export function looksLikeParticipantQuestion(text: string | null | undefined): boolean {
    const raw = (text ?? "").trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();

    // A question mark is the participant saying so themselves. Nothing beats it.
    if (raw.includes("?")) return true;

    for (const phrase of HELP_PHRASES) {
        if (lower.startsWith(phrase)) return true;
    }

    const lead = firstWord(lower);
    if (!lead) return false;

    /*
     * A LEAD WORD ALONE IS NOT ENOUGH.
     *
     * "Will" and "May" are names. "Do" opens a question and also nothing else anyone types into a
     * name box. So a lead word only counts when the text is long enough to be a sentence rather
     * than a value — a single word, or two, is far more likely to be the answer that was asked for.
     */
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length < 3) return false;

    if (INTERROGATIVE_LEADS.has(lead)) return true;
    if (HELP_LEADS.has(lead) && /\b(help|understand|mean|explain|need to|supposed to)\b/.test(lower)) {
        return true;
    }
    return false;
}
