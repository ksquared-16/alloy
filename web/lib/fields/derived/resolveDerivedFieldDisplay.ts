import type { DerivedFieldBinding } from "@/lib/fields/derived/types";
import { deriveAgeFromDateOfBirth } from "@/lib/fields/derived/ageFromDateOfBirth";
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

export function resolveDerivedFieldDisplay(input: {
    target_key: string;
    values: Record<string, string>;
    bindings?: Readonly<Record<string, DerivedFieldBinding>>;
    asOfDate?: Date;
}): DerivedFieldResult | null {
    const binding = (input.bindings ?? CREATE_LEAD_DERIVED_FIELD_BINDINGS)[input.target_key];
    if (!binding) return null;

    const sourceValue = (input.values[binding.source_key] ?? "").trim();
    if (!sourceValue) return null;

    if (binding.kind === "age_from_date_of_birth") {
        return deriveAgeFromDateOfBirth(sourceValue, input.asOfDate);
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
