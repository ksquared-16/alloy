/**
 * Deterministic content-aware text minimization.
 *
 * Platform privacy primitive, and a sibling of {@link redactObjectForAi} rather
 * than a replacement for it. The two answer different questions:
 *
 *   - `redactObjectForAi` asks **"what is this FIELD?"** — it decides by key
 *     name, so it either destroys a whole value or leaves it entirely alone.
 *   - this module asks **"what is INSIDE this text?"** — it finds strongly
 *     structured identifiers embedded in otherwise permitted prose and replaces
 *     only those spans.
 *
 * That gap is why this module exists. A message body has no field name that
 * distinguishes "Email me at jane@example.com about Friday's tour" from "See you
 * Friday", so a key-name rule can only choose between leaking the address and
 * deleting the sentence.
 *
 * **Deterministic and local.** No model, no network, no credential, no clock,
 * no randomness. Identical input and policy produce byte-identical output.
 *
 * **This is not tokenization.** Placeholders are constant strings carrying no
 * identifier, no index and no recoverable material. Nothing here is reversible
 * and no vault exists; `tokenize` remains an unsupported transformation
 * (Phase 2.1, Director decision D-3). A placeholder produced here can never be
 * mistaken for a token because it contains no digits and no unique reference —
 * asserted by control.
 *
 * @see docs/platform/trust/privacy-runtime.md
 * @see lib/privacy/redactObject.ts — the structural, key-name counterpart
 */

import { normalizeEmail } from "@/lib/identity/normalizeEmail";
import { phoneDigitsNanp } from "@/lib/identity/normalizePhone";
import type { RedactionKind } from "@/lib/privacy/redactObject";

/**
 * The classes a privacy policy may REQUEST be minimized inside text.
 *
 * Deliberately wider than what is supported. A policy naming a class this
 * platform cannot deterministically detect must fail closed, and it can only do
 * that if the class is expressible in the first place. A vocabulary limited to
 * what already works could never refuse anything.
 */
export const TEXT_MINIMIZATION_CLASSES = [
    "email",
    "phone",
    "person_name",
    "street_address",
    "government_id",
    "health_information",
] as const;

export type TextMinimizationClass = (typeof TEXT_MINIMIZATION_CLASSES)[number];

/** Maximum text length this minimizer will accept. Beyond it, it refuses. */
export const MAX_MINIMIZABLE_TEXT_LENGTH = 100_000;

export const TEXT_MINIMIZATION_REFUSAL_CODES = [
    "TEXT_MINIMIZATION_UNSUPPORTED_CLASS",
    "TEXT_MINIMIZATION_INPUT_TOO_LARGE",
] as const;

export type TextMinimizationRefusalCode = (typeof TEXT_MINIMIZATION_REFUSAL_CODES)[number];

/**
 * One detector.
 *
 * `find` returns half-open `[start, end)` spans over the input. It never
 * returns the matched text, and nothing downstream asks for it — the substring
 * exists only long enough to be replaced.
 */
type TextDetector = {
    readonly key: TextMinimizationClass;
    /** Reuses the platform redaction vocabulary; audit stays one language. */
    readonly redaction_kind: RedactionKind;
    /** Constant. No identifier, no index, no recoverable material. */
    readonly placeholder: string;
    find(text: string): readonly (readonly [number, number])[];
};

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Local part, domain labels, then a required alphabetic TLD.
 *
 * The trailing `[A-Za-z]{2,}` is what makes adjacent punctuation safe: a
 * sentence-ending period cannot be absorbed into the match, because a `.` must
 * be followed by more label characters to be consumed at all.
 */
const EMAIL_SPAN =
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}/g;

const emailDetector: TextDetector = {
    key: "email",
    redaction_kind: "email",
    placeholder: "[email removed]",
    find(text) {
        const out: [number, number][] = [];
        for (const m of text.matchAll(EMAIL_SPAN)) {
            const value = m[0];
            const start = m.index;
            if (start === undefined) continue;
            // Confirmed against the CANONICAL normalizer rather than a second
            // opinion about what an address is. If `lib/identity` would not
            // accept it, this module does not claim to have found one.
            if (normalizeEmail(value) === null) continue;
            out.push([start, start + value.length]);
        }
        return out;
    },
};

// ---------------------------------------------------------------------------
// Telephone (NANP)
// ---------------------------------------------------------------------------

/**
 * Candidate NANP shapes: optional `+1`/`1`, optional parenthesised area code,
 * and space/dot/hyphen separators.
 *
 * The digit lookaround is load-bearing. Without it, a 14-digit order number
 * would yield a "phone number" from its first ten digits — the classic
 * false positive for this detector.
 */
const PHONE_SPAN = /(?<![0-9])(?:\+?1[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}(?![0-9])/g;

/**
 * NANP structural validity: area code and exchange both start 2–9.
 *
 * This is the difference between a phone detector and a ten-digit-number
 * detector. `1234567890` is not a telephone number and redacting it would be a
 * false claim about what the text contained.
 */
function isStructurallyNanp(digits: string): boolean {
    if (digits.length !== 10) return false;
    const area = digits[0]!;
    const exchange = digits[3]!;
    return area >= "2" && area <= "9" && exchange >= "2" && exchange <= "9";
}

const phoneDetector: TextDetector = {
    key: "phone",
    redaction_kind: "phone",
    placeholder: "[phone removed]",
    find(text) {
        const out: [number, number][] = [];
        for (const m of text.matchAll(PHONE_SPAN)) {
            const value = m[0];
            const start = m.index;
            if (start === undefined) continue;
            // Canonical digit extraction, so this module and identity resolution
            // cannot disagree about what the digits of a number are.
            if (!isStructurallyNanp(phoneDigitsNanp(value))) continue;
            out.push([start, start + value.length]);
        }
        return out;
    },
};

/**
 * The registry. Order is declared, not emergent: email runs first, so an
 * address containing digits is replaced before the phone detector sees the
 * text. Placeholders contain no digits, so an earlier replacement can never
 * create a later match.
 *
 * Adding a detector means adding an entry here plus its corpus. There is no
 * dynamic registration and no pattern list loaded from configuration.
 */
export const TEXT_DETECTORS: readonly TextDetector[] = Object.freeze([emailDetector, phoneDetector]);

const SUPPORTED: ReadonlySet<TextMinimizationClass> = new Set(TEXT_DETECTORS.map((d) => d.key));

/**
 * Classes this platform deliberately does NOT detect in free text.
 *
 * Not an oversight and not a backlog. Alloy's own label-anchored extractor
 * (`lib/intake/extract/extractFactsFromText.ts`) is the evidence: recognising a
 * person's name or a street address in prose needs heuristics whose failures
 * are already visible in this repository's long-standing intake test failures.
 * A detector that is usually right is exactly the thing a fail-closed privacy
 * engine must not contain, because "usually" is indistinguishable from "leaked"
 * after the fact.
 */
export const UNSUPPORTED_TEXT_MINIMIZATION_CLASSES: readonly TextMinimizationClass[] = Object.freeze(
    TEXT_MINIMIZATION_CLASSES.filter((c) => !SUPPORTED.has(c)),
);

export function isSupportedTextMinimizationClass(cls: TextMinimizationClass): boolean {
    return SUPPORTED.has(cls);
}

/** What one detector did. A COUNT, never the matched substring. */
export type TextMinimizationRecord = {
    readonly detector_key: TextMinimizationClass;
    readonly redaction_kind: RedactionKind;
    readonly replaced_count: number;
};

export type MinimizeTextResult =
    | { readonly ok: true; readonly text: string; readonly records: readonly TextMinimizationRecord[] }
    | {
          readonly ok: false;
          readonly refusal_code: TextMinimizationRefusalCode;
          /** Names classes and limits only — never the input or any match. */
          readonly detail: string;
      };

/**
 * Validates a policy's requested classes without touching any text.
 *
 * Separate from {@link minimizeTextContent} on purpose: a policy that asks for
 * something unsupported is wrong whether or not a string element happens to be
 * present in a given request, and discovering that only when text shows up
 * would make the refusal depend on the data rather than on the policy.
 */
export function validateTextMinimizationRequest(
    requested: readonly TextMinimizationClass[],
): { readonly ok: true } | { readonly ok: false; readonly refusal_code: TextMinimizationRefusalCode; readonly detail: string } {
    const unsupported = requested.filter((c) => !SUPPORTED.has(c));
    if (unsupported.length > 0) {
        return {
            ok: false,
            refusal_code: "TEXT_MINIMIZATION_UNSUPPORTED_CLASS",
            detail:
                `Text minimization was required for class(es) ${[...new Set(unsupported)].sort().join(", ")}, ` +
                `which this platform cannot detect deterministically. Supported classes: ` +
                `${[...SUPPORTED].sort().join(", ")}. Admitting the text unminimized would claim a ` +
                `transformation that did not occur.`,
        };
    }
    return { ok: true };
}

/**
 * Replaces every supported embedded identifier, preserving surrounding prose.
 *
 * Spans from all detectors are collected first and applied in one right-to-left
 * pass, so earlier replacements cannot shift later offsets and the result does
 * not depend on detector order beyond the declared registry order.
 */
export function minimizeTextContent(
    text: string,
    requested: readonly TextMinimizationClass[],
): MinimizeTextResult {
    const validation = validateTextMinimizationRequest(requested);
    if (!validation.ok) return validation;

    if (text.length > MAX_MINIMIZABLE_TEXT_LENGTH) {
        return {
            ok: false,
            refusal_code: "TEXT_MINIMIZATION_INPUT_TOO_LARGE",
            detail:
                `Text of ${text.length} characters exceeds the ${MAX_MINIMIZABLE_TEXT_LENGTH}-character ` +
                `minimization limit. Silently truncating would discard content while reporting success.`,
        };
    }

    const active = TEXT_DETECTORS.filter((d) => requested.includes(d.key));
    const spans: { start: number; end: number; placeholder: string; key: TextMinimizationClass }[] = [];
    const counts = new Map<TextMinimizationClass, number>();

    for (const detector of active) {
        for (const [start, end] of detector.find(text)) {
            // A span already claimed by an earlier detector is not claimed
            // twice; overlapping counts would overstate what was removed.
            if (spans.some((s) => start < s.end && end > s.start)) continue;
            spans.push({ start, end, placeholder: detector.placeholder, key: detector.key });
            counts.set(detector.key, (counts.get(detector.key) ?? 0) + 1);
        }
    }

    spans.sort((a, b) => b.start - a.start);
    let out = text;
    for (const span of spans) {
        out = out.slice(0, span.start) + span.placeholder + out.slice(span.end);
    }

    const records: TextMinimizationRecord[] = active.map((d) => ({
        detector_key: d.key,
        redaction_kind: d.redaction_kind,
        replaced_count: counts.get(d.key) ?? 0,
    }));

    return { ok: true, text: out, records };
}
