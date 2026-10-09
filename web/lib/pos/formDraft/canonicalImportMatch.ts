/**
 * THE IMPORTER'S ROUTE TO THE CANONICAL FIELD CATALOG.
 *
 * Import recognition was a closed vocabulary: nine regexes in `inferQuestionIntent` — child name,
 * guardian name, emergency contact, health, date of birth, email, phone, date, signature — and a
 * `default: processing_only` fallthrough. `deriveFieldSources` then returns `undefined` for
 * `processing_only` on its first line, BEFORE any catalog is consulted. So an unrecognised question
 * could never reach a canonical destination, however obvious it was: "How would you describe your
 * child's gender?" resolved to form-only while `child:gender` sat in the catalog the Studio picker
 * offers. The destination was writable and unreachable.
 *
 * The fix is not another regex. It is a second route to the SAME authority the picker reads —
 * `mergeLifecycleFieldPaletteForStage`, the lifecycle field palette — consulted only when the intent
 * vocabulary has already said "I don't recognise this". Adding `gender` to the regex list would have
 * reproduced the architecture that caused the problem, one word later.
 *
 * ## Why the platform palette and not the org-merged one
 *
 * The merged palette needs the org's `field_definitions` rows, which needs a database round trip; the
 * draft builder is pure and synchronous, and making it async would reach into every import path. So the
 * importer sees the PLATFORM catalog — the same entries, from the same function, minus an
 * organisation's own custom fields. A custom field still has to be chosen in the inspector, which is
 * honest: Alloy has no basis for guessing what a school's bespoke field means.
 *
 * ## The safety law, restated for this path
 *
 * A match is applied only when it is UNAMBIGUOUS, which here means all of:
 *
 *   1. the question names a subject the catalog models (a child, a parent/guardian, the household);
 *   2. exactly ONE catalog entry for that subject has its label present in the question as whole words;
 *   3. that entry has a real `field_key` to bind to.
 *
 * Anything else — no subject, two candidates, a one-word catalog label that would match half the
 * English language — returns null and the question stays unresolved for the operator. A wrong canonical
 * binding writes a real child's record; a missing one costs a click.
 */

import type { FormFieldSource } from "@/lib/forms/schema";
import { mergeLifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import type { LifecycleFieldPaletteEntry } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";

/** The subject a question is about, in the catalog's own vocabulary. */
type CatalogSubject = "child" | "person" | "customer";

/**
 * How the catalog's entity names map onto the form's `entity_type`.
 *
 * `opportunity` is deliberately absent: an inquiry-level fact ("tour outcome", "start date") is about
 * the enrolment rather than a person, and a question's wording gives no reliable signal for it. Those
 * stay operator decisions.
 */
const ENTITY_TYPE: Record<CatalogSubject, string> = {
    child: "child",
    person: "person",
    customer: "customer",
};

/** Words in a question that name whose fact it is. */
const SUBJECT_WORDS: ReadonlyArray<{ readonly subject: CatalogSubject; readonly re: RegExp }> = [
    { subject: "child", re: /\b(child|children|student|pupil|son|daughter)('?s)?\b/i },
    { subject: "person", re: /\b(parent|guardian|mother|father|caregiver|carer)('?s)?\b/i },
    { subject: "customer", re: /\b(household|family|account)('?s)?\b/i },
];

/**
 * A catalog label too generic to match on.
 *
 * "Program", "Status" or "Notes" appear inside ordinary English sentences, so matching them would place
 * a destination on the strength of a coincidence. They remain available in the picker, where a person
 * is making the decision.
 */
const TOO_GENERIC = new Set(["program", "status", "notes", "type", "name", "date", "room", "site", "plan"]);

function normalise(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Does the catalog label appear in the question as whole words? */
function labelAppearsIn(question: string, label: string): boolean {
    const haystack = ` ${normalise(question)} `;
    const needle = normalise(label);
    if (!needle || TOO_GENERIC.has(needle)) return false;
    return haystack.includes(` ${needle} `);
}

function subjectOf(question: string, sectionTitle: string): CatalogSubject | null {
    for (const candidate of SUBJECT_WORDS) {
        if (candidate.re.test(question)) return candidate.subject;
    }
    // A section heading supplies the subject a bare question omits — "Gender" under "Child Information".
    for (const candidate of SUBJECT_WORDS) {
        if (candidate.re.test(sectionTitle)) return candidate.subject;
    }
    return null;
}

let paletteCache: readonly LifecycleFieldPaletteEntry[] | null = null;

/** The platform catalog, read once. Pure: the same entries the Studio picker is built from. */
function catalog(): readonly LifecycleFieldPaletteEntry[] {
    if (!paletteCache) paletteCache = mergeLifecycleFieldPaletteForStage("lead");
    return paletteCache;
}

export type CanonicalImportMatch = {
    readonly fieldSource: FormFieldSource;
    /** The catalog's own operator-facing label, e.g. "Gender". */
    readonly label: string;
    readonly ruleId: string;
};

/**
 * The canonical destination a question unambiguously names, or null.
 *
 * Called only after the intent vocabulary has returned `generic`. Returning null is the common and
 * correct outcome; it leaves the question exactly where the existing mapping contract puts it.
 */
export function matchCanonicalDestination(question: string, sectionTitle = ""): CanonicalImportMatch | null {
    const text = question.trim();
    if (!text) return null;

    const subject = subjectOf(text, sectionTitle);
    if (!subject) return null;

    const candidates = catalog().filter(
        (entry) => ENTITY_TYPE[subject] !== undefined && entry.entity === subject && Boolean(entry.field_key) && labelAppearsIn(text, entry.field_label),
    );
    // Two candidates means the question is ambiguous, and an ambiguous question is not mapped.
    if (candidates.length !== 1) return null;

    const entry = candidates[0]!;
    return {
        fieldSource: { entity_type: ENTITY_TYPE[subject], field_key: entry.field_key! },
        label: entry.field_label,
        ruleId: entry.rule_id,
    };
}
