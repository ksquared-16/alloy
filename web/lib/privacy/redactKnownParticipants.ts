/**
 * Deterministic known-participant name redaction.
 *
 * The third platform privacy primitive, and deliberately NOT a person-name
 * detector. The distinction is the whole reason this module is allowed to exist:
 *
 *   - A **detector** asks "does this text contain a person's name?" — an open
 *     question answerable only by heuristics. `minimizeTextContent` refuses to
 *     answer it, and says why: a detector that is usually right is exactly what
 *     a fail-closed privacy engine must not contain, because "usually" is
 *     indistinguishable from "leaked" after the fact.
 *   - This module asks "does this text contain **one of these specific
 *     strings**?" — a closed question with an exact answer. The roster is
 *     supplied by the caller from resolved records; nothing here guesses who a
 *     participant is.
 *
 * So `person_name` remains an unsupported minimization class, and this is not a
 * back door to it. A name belonging to someone not on the roster is NOT removed,
 * and that residual is stated rather than hidden — see
 * {@link KnownParticipantRedactionResult}.
 *
 * **The error asymmetry is the point.** A roster token that collides with an
 * ordinary word ("Will", "May", "Grace") over-redacts: prose is damaged, and
 * reasoning quality drops. That is a cost, not a breach. The opposite error —
 * failing to remove a real participant's name — is a breach. So this module
 * carries no stop-list of colliding words: excluding "Will" to protect a
 * sentence would leak every participant actually named Will.
 *
 * ## D-86 — what this primitive does NOT make safe
 *
 * Director decision D-86, recorded against the real Firefly corpus: removing
 * known-participant identity **does not make arbitrary Communications prose
 * admissible to a provider.** Two residuals were demonstrated, not theorised:
 *
 *   - **Health and other sensitive semantics survive.** "Maya has a fever"
 *     becomes "[name removed] has a fever". The identity went; the health
 *     statement did not.
 *   - **Unknown third-party identities survive.** "my sister Ana will collect
 *     her" keeps "Ana", because Ana is not on the roster.
 *
 * So this module is a building block, never a clearance. `person_name` remains
 * unsupported as a general heuristic minimizer, the `summarize` transformation
 * remains a compatibility concession rather than a resolved one, and **every
 * prose-bearing capability still owes its own explicit admissibility proof**.
 * Reaching for this primitive is not that proof.
 *
 * **Deterministic and local.** No model, no network, no credential, no clock, no
 * randomness. Identical input and roster produce byte-identical output.
 *
 * **Not tokenization.** The placeholder is one constant string carrying no
 * identifier, no index and no recoverable material, so two different
 * participants are indistinguishable in the output. `tokenize` remains an
 * unsupported transformation (Phase 2.1, Director decision D-3).
 *
 * @see lib/privacy/minimizeTextContent.ts — the content-aware sibling this runs AFTER
 * @see lib/privacy/redactObject.ts — the structural, key-name counterpart
 */

/** Maximum text length this redactor will accept. Beyond it, it refuses. */
export const MAX_PARTICIPANT_REDACTABLE_TEXT_LENGTH = 100_000;

/**
 * Shortest roster token that may be matched.
 *
 * A one-character token would match a letter anywhere a boundary allows and
 * redact essentially arbitrary text, which destroys the input without
 * protecting anything additional — the full name it came from is matched on its
 * own.
 */
export const MIN_PARTICIPANT_TOKEN_LENGTH = 2;

/** Constant. No identifier, no index, no recoverable material. */
export const PARTICIPANT_PLACEHOLDER = "[name removed]" as const;

export const PARTICIPANT_REDACTION_REFUSAL_CODES = [
    "PARTICIPANT_REDACTION_EMPTY_ROSTER",
    "PARTICIPANT_REDACTION_INPUT_TOO_LARGE",
] as const;

export type ParticipantRedactionRefusalCode = (typeof PARTICIPANT_REDACTION_REFUSAL_CODES)[number];

/**
 * What the redactor did. A COUNT, never a matched substring and never a roster
 * entry — recording either would reintroduce the identity being removed into
 * the evidence that proves it was removed.
 */
export type ParticipantRedactionRecord = {
    readonly redaction_kind: "person_name";
    readonly replaced_count: number;
    /** How many distinct tokens the roster expanded to. Never the tokens. */
    readonly roster_token_count: number;
};

export type KnownParticipantRedactionResult =
    | {
          readonly ok: true;
          readonly text: string;
          readonly record: ParticipantRedactionRecord;
      }
    | {
          readonly ok: false;
          readonly refusal_code: ParticipantRedactionRefusalCode;
          /** Names limits and counts only — never the input, a match, or a roster entry. */
          readonly detail: string;
      };

/**
 * Expands roster names into the tokens that will be matched.
 *
 * A roster entry arrives as a display name ("Maya Kurzman"). Matching only the
 * whole string would miss "Maya", which is how a parent actually writes about
 * their child, so each whitespace-separated part becomes a token too.
 *
 * Sorted longest-first so a full name is consumed as ONE span rather than as
 * two adjacent part-matches. That changes the reported count, not the safety:
 * either way no name survives.
 */
export function expandParticipantTokens(roster: readonly string[]): readonly string[] {
    const tokens = new Set<string>();
    for (const entry of roster) {
        if (typeof entry !== "string") continue;
        const full = entry.trim().replace(/\s+/g, " ");
        if (full.length >= MIN_PARTICIPANT_TOKEN_LENGTH) tokens.add(full);
        for (const part of full.split(" ")) {
            // Strip punctuation that rides along with a display name ("O'Brien,"
            // "Kurzman-Smith,") without splitting the name itself apart.
            const cleaned = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
            if (cleaned.length >= MIN_PARTICIPANT_TOKEN_LENGTH) tokens.add(cleaned);
        }
    }
    return [...tokens].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function escapeForRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces every occurrence of every roster token, preserving surrounding prose.
 *
 * Boundaries are letter/number lookarounds rather than `\b`, which is ASCII-only
 * and would fail on accented names. A possessive ("Maya's") matches the name and
 * leaves the suffix, because `'` is not a letter.
 *
 * Spans are collected first and applied in one right-to-left pass, so earlier
 * replacements cannot shift later offsets. The placeholder contains no letters
 * outside its own bracketed word, and is never re-scanned, so a replacement can
 * never create a later match.
 */
export function redactKnownParticipants(
    text: string,
    roster: readonly string[],
): KnownParticipantRedactionResult {
    const tokens = expandParticipantTokens(roster);

    // Fail closed. An empty roster means this module cannot remove anything, and
    // admitting the prose anyway would attach the name of a redaction that had
    // no material to work with — the precise falsehood the transformation
    // dispatch exists to prevent. A thread with no resolved participant is a
    // real state, and the honest response to it is refusal, not a silent no-op.
    if (tokens.length === 0) {
        return {
            ok: false,
            refusal_code: "PARTICIPANT_REDACTION_EMPTY_ROSTER",
            detail:
                `Known-participant redaction was required, but the supplied roster expanded to zero ` +
                `usable tokens (minimum token length ${MIN_PARTICIPANT_TOKEN_LENGTH}). Admitting the text ` +
                `unredacted would claim a redaction that never ran.`,
        };
    }

    if (text.length > MAX_PARTICIPANT_REDACTABLE_TEXT_LENGTH) {
        return {
            ok: false,
            refusal_code: "PARTICIPANT_REDACTION_INPUT_TOO_LARGE",
            detail:
                `Text of ${text.length} characters exceeds the ${MAX_PARTICIPANT_REDACTABLE_TEXT_LENGTH}-character ` +
                `participant-redaction limit. Silently truncating would discard content while reporting success.`,
        };
    }

    const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}])(?:${tokens.map(escapeForRegex).join("|")})(?![\\p{L}\\p{N}])`,
        "giu",
    );

    const spans: { start: number; end: number }[] = [];
    for (const match of text.matchAll(pattern)) {
        const start = match.index;
        if (start === undefined) continue;
        const end = start + match[0].length;
        // Alternation is longest-first, so an overlap here means a shorter token
        // fell inside a span already claimed. Counting it twice would overstate
        // what was removed.
        if (spans.some((s) => start < s.end && end > s.start)) continue;
        spans.push({ start, end });
    }

    spans.sort((a, b) => b.start - a.start);
    let out = text;
    for (const span of spans) {
        out = out.slice(0, span.start) + PARTICIPANT_PLACEHOLDER + out.slice(span.end);
    }

    return {
        ok: true,
        text: out,
        record: {
            redaction_kind: "person_name",
            replaced_count: spans.length,
            roster_token_count: tokens.length,
        },
    };
}
