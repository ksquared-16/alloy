/**
 * Conversation input → the AUTHORED canonical type, before anything validates it.
 *
 * ## Why this exists as its own step
 *
 * A parent types "Aug 8, 2021" or "8/8/21". The Form's date control stores `2021-08-08`. Until now
 * the participant runtime simply refused anything that was not already ISO, which made the composer
 * useless for exactly the values it should be best at. The fix is NOT to loosen validation — it is
 * to normalize FIRST and then let the existing Form validator judge the canonical value.
 *
 *   conversation text  →  normalize to authored type  →  Forms' own validator  →  plausibility
 *
 * ## What normalization may and may not do
 *
 * It may re-SHAPE a value the participant clearly expressed. It may never INVENT one, and it may
 * never make a suspicious value look clean: a five-digit year stays suspicious so the layer above
 * can ask about it, rather than being silently rounded into something plausible.
 *
 * Parsing is borrowed from `presentationDateFormat` — the platform's own parser, already used by
 * the document destination formatter. There is no second date parser in this codebase.
 *
 * Pure. No I/O, no clock, no provider.
 */

import { parsePresentationDateInput } from "@/lib/presentation/presentationDateFormat";

export type ParticipantNormalization =
    /** Understood and re-shaped into the authored type. */
    | { readonly kind: "normalized"; readonly value: unknown }
    /**
     * Parsed, but something about it is not credible — a year of `20201`, a month of `13`.
     *
     * `suspicion` names WHY, and `likely` carries a correction only when one can be derived
     * safely. Never persisted: the layer above turns this into a question.
     */
    | {
          readonly kind: "suspicious";
          readonly suspicion: "implausible_year" | "impossible_calendar_date";
          readonly raw: string;
          readonly likely?: unknown;
      }
    /** Left exactly as given, for the validator to accept or reject on its own terms. */
    | { readonly kind: "unchanged"; readonly value: unknown };

/** The authored control types this module knows how to re-shape. */
export type NormalizableControlType = string | null | undefined;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date, not merely a well-shaped string — `2021-02-29` must fail. */
export function isRealCalendarDate(iso: string): boolean {
    const m = ISO_DATE.exec(iso.trim());
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * The window a human birth date can credibly fall in.
 *
 * Deliberately WIDE and deliberately not an early-childhood assumption: this only separates "a year
 * a person could have been born in" from a typo like `20201` or `221`. Programme-specific age rules
 * are a different question with a different owner (`programAgeRange.ts`).
 */
const CREDIBLE_YEAR_MIN = 1900;
const CREDIBLE_YEAR_MAX = 2200;

/**
 * A two-digit year as a person means it.
 *
 * `8/8/21` is 2021, not 0021 and not 1921. The pivot is the platform's own convention elsewhere:
 * two digits belong to the current century unless that would be far in the future.
 */
function expandTwoDigitYear(yy: number, referenceYear: number): number {
    const century = Math.floor(referenceYear / 100) * 100;
    const candidate = century + yy;
    // A birth date is not decades ahead; roll back a century rather than invent the future.
    return candidate > referenceYear + 1 ? candidate - 100 : candidate;
}

function isoFrom(y: number, m: number, d: number): string {
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Normalize a date the way a parent would type it.
 *
 * `referenceYear` is injected rather than read from a clock, so the same input always normalizes to
 * the same value in a test and in production.
 */
export function normalizeDateInput(raw: unknown, referenceYear: number): ParticipantNormalization {
    if (typeof raw !== "string") return { kind: "unchanged", value: raw };
    const text = raw.trim();
    if (!text) return { kind: "unchanged", value: raw };

    // Already canonical — still checked for calendar reality.
    if (ISO_DATE.test(text)) {
        return isRealCalendarDate(text)
            ? { kind: "normalized", value: text }
            : { kind: "suspicious", suspicion: "impossible_calendar_date", raw: text };
    }

    /**
     * Numeric shapes, handled before the general parser.
     *
     * `M/D/YY` and `M/D/YYYY` are the two a parent actually types, and the platform parser only
     * accepts a four-digit year — so a two-digit year is expanded here rather than by loosening the
     * shared parser for every other caller. A year with five or more digits is NOT expanded: it is
     * reported as suspicious, with the four-digit reading offered as the likely correction.
     */
    const slash = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,})$/.exec(text);
    if (slash) {
        const month = Number(slash[1]);
        const day = Number(slash[2]);
        const yearText = slash[3]!;
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return { kind: "suspicious", suspicion: "impossible_calendar_date", raw: text };
        }
        if (yearText.length > 4) {
            /**
             * `8/8/20201` — a stuck keypress, and NO correction is offered.
             *
             * `20201` reads equally well as `2021` with a stray `0` or `2020` with a stray `1`.
             * Picking one would be inventing a date of birth on a coin flip, so the parent is asked
             * to check it instead. "Do not invent corrections when confidence is low" outranks the
             * nicer-sounding "did you mean…?" here.
             */
            return { kind: "suspicious", suspicion: "implausible_year", raw: text };
        }
        if (yearText.length === 2 && referenceYear <= 0) {
            // No reference year was supplied, so `21` cannot be resolved honestly. Left unchanged.
            return { kind: "unchanged", value: raw };
        }
        const year = yearText.length === 2 ? expandTwoDigitYear(Number(yearText), referenceYear) : Number(yearText);
        const iso = isoFrom(year, month, day);
        if (!isRealCalendarDate(iso)) {
            return { kind: "suspicious", suspicion: "impossible_calendar_date", raw: text };
        }
        if (year < CREDIBLE_YEAR_MIN || year > CREDIBLE_YEAR_MAX) {
            return { kind: "suspicious", suspicion: "implausible_year", raw: text };
        }
        return { kind: "normalized", value: iso };
    }

    // A bare implausible year inside prose — "August 8, 20201" — before the platform parser, which
    // would otherwise coerce it into something that looks fine.
    const longYear = /\b\d{5,}\b/.exec(text);
    if (longYear) {
        // Same ambiguity as the numeric form: read, doubted, and asked about — never guessed at.
        return { kind: "suspicious", suspicion: "implausible_year", raw: text };
    }

    /**
     * A YEAR MUST BE STATED.
     *
     * `parsePresentationDateInput` helpfully defaults a missing year to the current one. That is
     * right for an operator filter and wrong here: "August 21" would become a date of birth the
     * parent never gave. Normalization re-shapes what was said; it does not supply what was not.
     */
    if (!/\b\d{4}\b/.test(text)) return { kind: "unchanged", value: raw };

    // "August 8, 2021", "Aug 8 2021" — the platform's parser owns this.
    const parsed = parsePresentationDateInput(text);
    if (!parsed) return { kind: "unchanged", value: raw };
    const iso = parsed.date.toISOString().slice(0, 10);
    if (!isRealCalendarDate(iso)) {
        return { kind: "suspicious", suspicion: "impossible_calendar_date", raw: text };
    }
    const year = Number(iso.slice(0, 4));
    if (year < CREDIBLE_YEAR_MIN || year > CREDIBLE_YEAR_MAX) {
        return { kind: "suspicious", suspicion: "implausible_year", raw: text };
    }
    return { kind: "normalized", value: iso };
}

/** `yes`/`no` and their ordinary spoken variants, into the authored boolean. */
export function normalizeBooleanInput(raw: unknown): ParticipantNormalization {
    if (typeof raw === "boolean") return { kind: "normalized", value: raw };
    if (typeof raw !== "string") return { kind: "unchanged", value: raw };
    const t = raw.trim().toLowerCase();
    if (["yes", "y", "true", "yep", "yeah", "correct", "right"].includes(t)) {
        return { kind: "normalized", value: true };
    }
    if (["no", "n", "false", "nope", "nah", "incorrect"].includes(t)) {
        return { kind: "normalized", value: false };
    }
    return { kind: "unchanged", value: raw };
}

/** A typed number, from the digits a parent used. Currency and grouping are tolerated. */
export function normalizeNumberInput(raw: unknown): ParticipantNormalization {
    if (typeof raw === "number") {
        return Number.isFinite(raw) ? { kind: "normalized", value: raw } : { kind: "unchanged", value: raw };
    }
    if (typeof raw !== "string") return { kind: "unchanged", value: raw };
    const cleaned = raw.trim().replace(/[$,\s]/g, "");
    if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return { kind: "unchanged", value: raw };
    const n = Number(cleaned);
    return Number.isFinite(n) ? { kind: "normalized", value: n } : { kind: "unchanged", value: raw };
}

/**
 * A phone number as digits, with the formatting a parent used removed.
 *
 * Kept deliberately shallow: what a VALID phone number is stays with the authored field's own
 * `validate.pattern`, which the Form validator enforces. This only removes punctuation so a
 * correctly-typed number is not rejected for its parentheses.
 */
export function normalizePhoneInput(raw: unknown): ParticipantNormalization {
    if (typeof raw !== "string") return { kind: "unchanged", value: raw };
    const text = raw.trim();
    const digits = text.replace(/[^\d]/g, "");
    // 10 or 11 (leading 1) digits is the North American shape the tenant forms use. Anything else is
    // left untouched for the authored pattern to judge — this module does not decide validity.
    if (digits.length === 10) return { kind: "normalized", value: digits };
    if (digits.length === 11 && digits.startsWith("1")) return { kind: "normalized", value: digits.slice(1) };
    return { kind: "unchanged", value: raw };
}

/** Trim only — an email's shape is the authored pattern's business. */
export function normalizeEmailInput(raw: unknown): ParticipantNormalization {
    if (typeof raw !== "string") return { kind: "unchanged", value: raw };
    return { kind: "normalized", value: raw.trim().toLowerCase() };
}

/**
 * Match a parent's words to an AUTHORED option, case- and punctuation-insensitively.
 *
 * This is not synonym interpretation — that is the provider's job, and its output lands back here
 * as a candidate. This only forgives casing and spacing on a value the parent effectively named,
 * and it can only ever return a value the operator authored.
 */
export function normalizeEnumInput(raw: unknown, allowed: readonly string[]): ParticipantNormalization {
    if (typeof raw !== "string" || allowed.length === 0) return { kind: "unchanged", value: raw };
    const fold = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    const target = fold(raw);
    if (!target) return { kind: "unchanged", value: raw };
    const hit = allowed.find((option) => fold(option) === target);
    return hit ? { kind: "normalized", value: hit } : { kind: "unchanged", value: raw };
}

/**
 * Normalize by the AUTHORED control type.
 *
 * The type is the Form's, never the conversation's — that is the whole boundary. An unknown type
 * returns the value untouched so a new control can never be silently coerced into an old one's shape.
 */
export function normalizeParticipantValue(input: {
    readonly controlType: NormalizableControlType;
    readonly fieldKey?: string | null;
    readonly allowedOptions?: readonly string[];
    readonly raw: unknown;
    /** Injected — normalization must not read a clock. */
    readonly referenceYear: number;
}): ParticipantNormalization {
    const type = (input.controlType ?? "").toLowerCase();
    const key = (input.fieldKey ?? "").toLowerCase();

    if (type === "date") return normalizeDateInput(input.raw, input.referenceYear);
    if (type === "boolean" || type === "checkbox") return normalizeBooleanInput(input.raw);
    if (type === "number") return normalizeNumberInput(input.raw);
    if (type === "select" || type === "radio" || type === "multiselect" || type === "checkbox_group") {
        return normalizeEnumInput(input.raw, input.allowedOptions ?? []);
    }
    // Text controls carry their semantics in the field key and the authored pattern.
    if (key.includes("email")) return normalizeEmailInput(input.raw);
    if (key.includes("phone") || key.includes("tel") || key.includes("mobile")) {
        return normalizePhoneInput(input.raw);
    }
    return { kind: "unchanged", value: input.raw };
}
