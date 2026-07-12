/**
 * Legacy Forms / Documents system-field compatibility — explicit adapter for saved schemas.
 *
 * Each OPERATIONAL_FORM_SYSTEM_FIELDS id is classified for picker, publish, and hydration.
 * Legacy aliases must not create duplicate picker entries.
 *
 * @see docs/sprints/archive/08_2026/forms-documents-field-platform-adoption.md
 */

import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import {
    canonicalRefKey,
    systemFieldIdToCanonicalRef,
    type CanonicalRegistryRef,
} from "@/lib/fields/fieldRegistryReferenceMatrix";

export type FormsLegacyCompatibilityClass =
    | "exact_canonical"
    | "alias_to_canonical"
    | "legacy_load_only"
    | "obsolete_renderable"
    | "unsupported";

export type FormsLegacyCompatibilityEntry = {
    systemFieldId: string;
    classification: FormsLegacyCompatibilityClass;
    canonicalRef: CanonicalRegistryRef | null;
    /** Shown in new operator pickers — false for legacy-only rows. */
    appearsInNewPickers: boolean;
    /** Accepted in published schema validation. */
    publishes: boolean;
    /** Hydrates in saved schema editors without mutation. */
    hydrates: boolean;
    notes?: string;
};

function classifyOperationalEntry(id: string): FormsLegacyCompatibilityEntry {
    const entry = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === id);
    const canonicalRef = systemFieldIdToCanonicalRef(id);

    if (id === "enrollment_acknowledgement_signature") {
        return {
            systemFieldId: id,
            classification: "legacy_load_only",
            canonicalRef: null,
            appearsInNewPickers: false,
            publishes: true,
            hydrates: true,
            notes: "Signature artifact control — not a canonical data provider.",
        };
    }

    if (!entry) {
        return {
            systemFieldId: id,
            classification: "unsupported",
            canonicalRef: null,
            appearsInNewPickers: false,
            publishes: false,
            hydrates: false,
        };
    }

    if (id === "child_room_cohort") {
        return {
            systemFieldId: id,
            classification: "obsolete_renderable",
            canonicalRef,
            appearsInNewPickers: false,
            publishes: true,
            hydrates: true,
            notes: "Deprecated alias of program_room_preference / program_room_cohort_key.",
        };
    }

    if (!canonicalRef) {
        if (entry.entity_type === "custom") {
            return {
                systemFieldId: id,
                classification: "legacy_load_only",
                canonicalRef: null,
                appearsInNewPickers: false,
                publishes: true,
                hydrates: true,
            };
        }
        return {
            systemFieldId: id,
            classification: "unsupported",
            canonicalRef: null,
            appearsInNewPickers: false,
            publishes: false,
            hydrates: true,
        };
    }

    const classification: FormsLegacyCompatibilityClass =
        entry.field_key === canonicalRef.field_key && entry.entity_type === canonicalRef.entity_type
            ? "exact_canonical"
            : "alias_to_canonical";

    return {
        systemFieldId: id,
        classification,
        canonicalRef,
        appearsInNewPickers: true,
        publishes: true,
        hydrates: true,
    };
}

export const FORMS_LEGACY_COMPATIBILITY_MATRIX: readonly FormsLegacyCompatibilityEntry[] =
    OPERATIONAL_FORM_SYSTEM_FIELDS.map((entry) => classifyOperationalEntry(entry.id));

const BY_SYSTEM_ID = new Map(FORMS_LEGACY_COMPATIBILITY_MATRIX.map((e) => [e.systemFieldId, e]));
const BY_CANONICAL = new Map<string, FormsLegacyCompatibilityEntry>();

for (const row of FORMS_LEGACY_COMPATIBILITY_MATRIX) {
    if (!row.canonicalRef) continue;
    const key = canonicalRefKey(row.canonicalRef);
    if (!BY_CANONICAL.has(key)) BY_CANONICAL.set(key, row);
}

export function formsLegacyCompatibilityEntry(systemFieldId: string): FormsLegacyCompatibilityEntry | undefined {
    return BY_SYSTEM_ID.get(systemFieldId.trim());
}

export function formsLegacyCompatibilityForCanonicalRef(ref: CanonicalRegistryRef): FormsLegacyCompatibilityEntry | undefined {
    return BY_CANONICAL.get(canonicalRefKey(ref));
}

export function isFormsLegacyLoadOnlySystemFieldId(systemFieldId: string): boolean {
    const entry = formsLegacyCompatibilityEntry(systemFieldId);
    return entry?.classification === "legacy_load_only" || entry?.appearsInNewPickers === false;
}
