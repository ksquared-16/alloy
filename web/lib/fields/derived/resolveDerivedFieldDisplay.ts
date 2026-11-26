import type { DerivedFieldBinding } from "@/lib/fields/derived/types";
import { deriveAgeFromDateOfBirth } from "@/lib/fields/derived/ageFromDateOfBirth";
import { deriveExecutionDate } from "@/lib/fields/derived/executionDate";
import type { DerivedFieldResult } from "@/lib/fields/derived/types";

/**
 * Consumer-specific derived-field bindings.
 * Create Lead is one consumer — POS/forms should register their own bindings, not hardcode in shared UI.
 */
export const CREATE_LEAD_DERIVED_FIELD_BINDINGS: Readonly<Record<string, DerivedFieldBinding>> = {
    child_age: {
        kind: "age_from_date_of_birth",
        source_key: "child_date_of_birth",
        persist: false,
    },
};

/** A `YYYY-MM-DD` as the local calendar day it names — never an instant. */
function calendarDate(dateOnly: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
    if (!m) return new Date(NaN);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function resolveDerivedFieldDisplay(input: {
    target_key: string;
    values: Record<string, string>;
    bindings?: Readonly<Record<string, DerivedFieldBinding>>;
    asOfDate?: Date;
    /** The instant the document was executed, and the organisation's zone, for date derivations. */
    executedAtIso?: string;
    timeZone?: string;
}): DerivedFieldResult | null {
    const binding = (input.bindings ?? CREATE_LEAD_DERIVED_FIELD_BINDINGS)[input.target_key];
    if (!binding) return null;

    if (binding.kind === "execution_date") {
        if (!input.executedAtIso || !input.timeZone) return null;
        return deriveExecutionDate(input.executedAtIso, input.timeZone);
    }

    const sourceValue = (input.values[binding.source_key] ?? "").trim();
    if (!sourceValue) return null;

    if (binding.kind === "age_from_date_of_birth") {
        // As-of is read from the payload when the binding names one: an age is only ever an age ON
        // a date, and the caller's default must never quietly stand in for the date that was meant.
        const asOfRaw = binding.as_of_key ? (input.values[binding.as_of_key] ?? "").trim() : "";
        if (binding.as_of_key && !asOfRaw) return null;
        /*
         * A date-only as-of is a CALENDAR DATE, and it is compared against one.
         *
         * `computeAgeParts` reads the as-of through local getters, so building it at UTC midnight
         * put it on the previous calendar day everywhere west of Greenwich. The age came out a day
         * early — and when the as-of equalled the date of birth, a day early meant NEGATIVE, so the
         * derivation returned nothing at all. On the Admissions packet that left "Student Age Upon
         * Enrolling" blank, and the whole submission was refused for a required box the platform
         * was responsible for filling.
         *
         * Both sides of the comparison now live in the same frame. Nothing here is an instant: a
         * birthday and a first day of school are days, and days have no timezone.
         */
        const asOf = asOfRaw ? calendarDate(asOfRaw) : input.asOfDate;
        if (asOf && Number.isNaN(asOf.getTime())) return null;
        return deriveAgeFromDateOfBirth(sourceValue, asOf);
    }

    return null;
}

export function isDerivedDisplayOnlyField(
    targetKey: string,
    bindings: Readonly<Record<string, DerivedFieldBinding>> = CREATE_LEAD_DERIVED_FIELD_BINDINGS,
): boolean {
    const binding = bindings[targetKey];
    return Boolean(binding && !binding.persist);
}
