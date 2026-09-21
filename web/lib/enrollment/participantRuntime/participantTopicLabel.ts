/**
 * A SHORT NAME FOR A CHAPTER, for navigation only.
 *
 * ## What this is not
 *
 * It is not a rename. The authored section keeps its name — "Health Information and Developmental
 * History" is what the school wrote, what the paperwork prints, and what every document, export and
 * legal surface continues to say. This is the word the CONVERSATION uses when it tells a parent
 * where they are, and when it lists their answers back to them.
 *
 * The distinction matters because the two have different jobs. A document heading is a title; a
 * navigation label is a signpost, read at a glance, a dozen times, in a column beside six people's
 * names. "Toureeb · Health Information and Developmental History" wraps onto three lines in that
 * column and says nothing the shorter form does not.
 *
 * ## Why a vocabulary and not an algorithm
 *
 * Shortening English headings by rule produces confident nonsense: dropping "Information" and
 * "History" from the heading above yields "Health & Developmental", and no rule that is safe for
 * one tenant's wording is safe for the next one's. So this is a small table of CONCEPTS — health,
 * emergency and pickup, tuition, contact details — recognised by words that appear on school and
 * childcare paperwork generally rather than on this packet specifically.
 *
 * ## It fails by saying nothing new
 *
 * A heading that matches no concept keeps its authored words. That is the safe direction: a long
 * label is a readability problem, and a WRONG short label is a lie about what a parent is looking
 * at. Nothing here is Enrollment-specific and nothing here is required for correctness — remove the
 * table and every chapter is still named, just longer.
 *
 * Pure. No I/O.
 */

/**
 * Concept → the words the conversation uses. Order matters: the first match wins.
 *
 * Every entry requires BOTH halves of its concept to be present in the heading. A single-word
 * trigger was tried first and immediately produced the failure this file warns about: a fixture
 * heading of "Health and daily routines" came back as "Health & medical" — a word the author never
 * wrote, replacing one they did. The table is deliberately small, and a heading it half-recognises
 * keeps its own words.
 */
const TOPIC_CONCEPTS: ReadonlyArray<{ readonly label: string; readonly test: RegExp }> = [
    // "Emergency Contact Information & Authorized Adults" — who may collect the child, and in a crisis.
    { label: "Emergency & pickup", test: /\bemergency\b(?=[\s\S]*\b(pick(\s|-)?up|authori[sz]ed|adults?)\b)|\b(pick(\s|-)?up|authori[sz]ed adults?)\b(?=[\s\S]*\bemergency\b)/i },
    // "Health Information and Developmental History"
    { label: "Health & development", test: /\bhealth\b(?=[\s\S]*\bdevelopment(al)?\b)|\bdevelopment(al)?\b(?=[\s\S]*\bhealth\b)/i },
    // "Tuition & Enrollment Agreement"
    { label: "Tuition & agreement", test: /\btuition\b(?=[\s\S]*\bagreement\b)|\bagreement\b(?=[\s\S]*\btuition\b)/i },
    // "Contact Information" — the one single-concept entry, because both of its words are present.
    { label: "Contact details", test: /^\s*contact\s+(information|details)\s*$/i },
];

/**
 * The conversational name for an authored section heading.
 *
 * Returns the heading unchanged when no concept is recognised, so an unknown tenant's paperwork is
 * never given a label nobody wrote.
 */
export function participantTopicLabel(sectionTitle: string): string {
    const heading = (sectionTitle ?? "").trim();
    if (!heading) return heading;
    for (const concept of TOPIC_CONCEPTS) {
        if (concept.test.test(heading)) return concept.label;
    }
    return heading;
}
