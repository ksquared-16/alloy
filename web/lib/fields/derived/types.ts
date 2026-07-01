/** Platform derived-field kinds — source of truth stays on the source field; derived values are display-only unless configured to persist. */
export type DerivedFieldKind = "age_from_date_of_birth";

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
    /** When true, consumers may persist derived value — default false everywhere today. */
    persist?: boolean;
};
