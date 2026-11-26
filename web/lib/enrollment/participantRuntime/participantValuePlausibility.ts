/**
 * Is this value CREDIBLE? — the check that runs after structure, and only after it.
 *
 * ## The distinction this file exists to hold
 *
 * `2021-02-29` is structurally malformed: no such day exists. Forms' own validator settles that.
 * `2035-03-14` is perfectly well-formed and cannot be a date of birth, because it has not happened.
 * Structure cannot see that. Plausibility can, and it is a different question with different rules.
 *
 * ## Bounded on purpose
 *
 * Only two rules are universal enough to assert without configuration:
 *
 *   - a date of birth in the FUTURE is impossible, for anyone, in any programme;
 *   - a birth year outside a wide credible window is a typo, not a person.
 *
 * Anything narrower — a specific age band in years — is a PROGRAMME rule, and Alloy already has an
 * owner for it: `lib/programs/programAgeRange.ts`. This module therefore accepts a `ProgramAgeRange`
 * rather than restating one, and does nothing when the caller has none. No age band is hardcoded
 * here, for any programme kind, and adding one would be the defect.
 *
 * ## Clarify vs refuse
 *
 * A value that cannot possibly be right is REFUSED. A value that is probably a typo, where the
 * intended value can be derived safely, is CLARIFIED — the parent is asked, and nothing persists
 * until they answer. Where no safe correction can be derived, the parent is simply asked to check.
 *
 * Pure. The clock is injected, never read.
 */

import {
    normalizeProgramAgeBoundaryToDays,
    type ProgramAgeRange,
} from "@/lib/programs/programAgeRange";

export type PlausibilityVerdict =
    | { readonly kind: "plausible" }
    /** Cannot be right under any configuration. No question is worth asking. */
    | { readonly kind: "refuse"; readonly reason: string }
    /** Probably wrong. Ask, and persist nothing until the parent answers. */
    | {
          readonly kind: "clarify";
          readonly reason: string;
          /** A correction offered ONLY when it can be derived safely. */
          readonly likely?: unknown;
      };

/** The wide window a human birth year can credibly fall in — a typo filter, not an age rule. */
export const CREDIBLE_BIRTH_YEAR_MIN = 1900;

const MS_PER_DAY = 86_400_000;

/** Whole days between two calendar dates, UTC — a date-only value has no timezone. */
function daysBetween(fromIso: string, toIso: string): number {
    const a = Date.parse(`${fromIso}T00:00:00Z`);
    const b = Date.parse(`${toIso}T00:00:00Z`);
    return Math.floor((b - a) / MS_PER_DAY);
}

/**
 * Is this date of birth credible?
 *
 * `nowIso` is the reference day, injected. `ageRange` is the PROGRAMME's rule when the caller has
 * resolved one — absent means no programme constraint is applied, which is the correct default.
 */
export function assessDateOfBirthPlausibility(input: {
    readonly iso: string;
    readonly nowIso: string;
    readonly ageRange?: ProgramAgeRange | null;
}): PlausibilityVerdict {
    const today = input.nowIso.slice(0, 10);
    const iso = input.iso.slice(0, 10);

    // A birth that has not happened. Universal, and never merely "suspicious".
    if (daysBetween(today, iso) > 0) {
        return { kind: "refuse", reason: "That date is in the future." };
    }

    const year = Number(iso.slice(0, 4));
    if (!Number.isFinite(year) || year < CREDIBLE_BIRTH_YEAR_MIN) {
        return { kind: "clarify", reason: "That year looks further back than expected." };
    }

    /**
     * PROGRAMME rules, from their own owner.
     *
     * Deliberately `clarify`, never `refuse`: a child slightly outside a programme's advertised band
     * is an enrolment conversation, not a malformed value, and refusing it would make the runtime a
     * second admissions authority. Alloy asks; a human decides.
     */
    const range = input.ageRange ?? null;
    if (range) {
        const ageDays = daysBetween(iso, today);
        const minDays = normalizeProgramAgeBoundaryToDays(range.minimum);
        const maxDays = normalizeProgramAgeBoundaryToDays(range.maximum);
        if (minDays != null && ageDays < minDays) {
            return { kind: "clarify", reason: "That would make them younger than this programme usually takes." };
        }
        if (maxDays != null && ageDays > maxDays) {
            return { kind: "clarify", reason: "That would make them older than this programme usually takes." };
        }
    }

    return { kind: "plausible" };
}

/**
 * Plausibility for a value, chosen by what the value MEANS rather than how it is typed.
 *
 * A date of birth is the only semantic fact with a universal rule today. Everything else returns
 * `plausible` — this module refuses to invent domain rules it has no owner for.
 */
export function assessParticipantValuePlausibility(input: {
    readonly canonicalKey?: string | null;
    readonly fieldKey?: string | null;
    readonly label?: string | null;
    readonly controlType?: string | null;
    readonly value: unknown;
    readonly nowIso: string;
    readonly ageRange?: ProgramAgeRange | null;
}): PlausibilityVerdict {
    const type = (input.controlType ?? "").toLowerCase();
    if (type !== "date" || typeof input.value !== "string") return { kind: "plausible" };

    const semantics = `${input.canonicalKey ?? ""} ${input.fieldKey ?? ""} ${input.label ?? ""}`.toLowerCase();
    const isBirthDate =
        semantics.includes("dob") ||
        semantics.includes("date_of_birth") ||
        semantics.includes("date of birth") ||
        semantics.includes("birth");
    if (!isBirthDate) return { kind: "plausible" };

    return assessDateOfBirthPlausibility({
        iso: input.value,
        nowIso: input.nowIso,
        ageRange: input.ageRange ?? null,
    });
}
