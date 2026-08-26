/** Platform derived-field kinds — source of truth stays on the source field; derived values are display-only unless configured to persist. */
export type DerivedFieldKind =
    | "age_from_date_of_birth"
    /**
     * The organisation-local calendar date on which a document is executed.
     *
     * "Today's Date" beside a signature does not mean the day the Form was built, nor the day the
     * packet was created — it means the day the family signed. The value therefore does not exist
     * until submission, which is a fact about TIMING, not a reason to ask a parent what day it is.
     */
    | "execution_date";

export type DerivedAgeValue = {
    years: number;
    months: number;
};

export type DerivedFieldResult = {
    kind: DerivedFieldKind;
    /** Machine-readable derived value when applicable. */
    value: DerivedAgeValue | null;
    /** Operator-facing display string. */
    display: string;
    /** ISO date-only source used for derivation. */
    source_value: string;
};

export type DerivedFieldBinding = {
    kind: DerivedFieldKind;
    /** Payload/field key holding the source value (e.g. date_of_birth). */
    source_key: string;
    /**
     * Payload/field key holding the date the derivation is taken AS OF.
     *
     * Age is meaningless without one. "Student Age Upon Enrolling" is the child's age on the day
     * enrolment starts, not the day someone happens to open the form — and substituting today
     * because the reference date is inconvenient is how a document acquires a plausible wrong
     * number. Absent, an age derivation falls back to the caller's `asOfDate`.
     */
    as_of_key?: string;
    /** When true, consumers may persist derived value — default false everywhere today. */
    persist?: boolean;
};
