/** @deprecated Import from @/lib/fields/derived/ageFromDateOfBirth — intake re-export for transitional callers. */
export {
    calculateAgeFromDob,
    deriveAgeFromDateOfBirth,
} from "@/lib/fields/derived/ageFromDateOfBirth";

export type { DerivedAgeValue as IntakeAgeValue } from "@/lib/fields/derived/types";

/** @deprecated Use DerivedFieldResult from @/lib/fields/derived/types */
export type IntakeCalculatedAge = {
    value: { years: number; months: number };
    display: string;
};
