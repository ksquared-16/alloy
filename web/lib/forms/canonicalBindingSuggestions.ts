/**
 * Canonical binding suggestions — reusable mapping from a detected/extracted field
 * (label + type) to an Alloy canonical `field_source`, so document-generated and manual
 * forms persist bindings that drive prefill + the guided family intake.
 *
 * This is a generic, ordered pattern layer — NOT hardcoded to any single form (e.g. MO500).
 * Operators can accept or change the suggestion; persisting `field_source` is what matters.
 *
 * Scope semantics (Family Packet model): household (shared once), child (per child),
 * recipient (signatures). Signature + signature-date fields are recipient-scoped and carry
 * no `field_source` (handled by the runtime, not record prefill).
 *
 * Pure, deterministic, no I/O.
 */

import type { FormField, FormFieldSource } from "@/lib/forms/schema";

export type BindingScope = "household" | "child" | "recipient";

export interface BindingSuggestion {
    /** Canonical binding to persist on the field (absent for signatures / special dates). */
    field_source?: FormFieldSource;
    scope: BindingScope;
    confidence: "high" | "medium" | "low";
    /** Special non-record bindings the runtime fills (signature/submission dates). */
    special?: "signature_date" | "submission_date";
    /** Human note for the binding review UI. */
    note?: string;
}

interface Rule {
    test: RegExp;
    /** Field types this rule applies to (omit = any non-signature scalar). */
    types?: ReadonlyArray<FormField["type"]>;
    suggest: BindingSuggestion;
}

const cm = (field_key: string, confidence: BindingSuggestion["confidence"] = "high"): BindingSuggestion => ({ field_source: { entity_type: "customer_member", field_key }, scope: "child", confidence });
const person = (field_key: string, confidence: BindingSuggestion["confidence"] = "high"): BindingSuggestion => ({ field_source: { entity_type: "person", field_key }, scope: "household", confidence });

/**
 * Person NAMES bind to the registered system fields, which are split.
 *
 * `OPERATIONAL_FORM_SYSTEM_FIELDS` registers child_first_name / child_last_name (entity "child") and
 * guardian_first_name / guardian_last_name (entity "guardian"). It registers NO person-level
 * display_name or full_name — the only display_name in the registry belongs to the household.
 *
 * These rules used to suggest `customer_member.display_name` / `person.full_name`, carrying the note
 * "split into first/last not yet supported". That note was false: form generation has always
 * expanded a person name into first + last against exactly these registered fields. So the concept
 * review promised the operator a binding to a field the registry does not have, while the generated
 * form built a different (correct) pair — two layers describing the same thing differently.
 *
 * The FIRST-name field is the anchor a name concept resolves to; generation adds the last-name field
 * alongside it. Callers that surface this to an operator should say the name is captured as first +
 * last rather than implying a single field.
 */
const childName = (which: "first" | "last"): BindingSuggestion => ({
    field_source: { entity_type: "child", field_key: `child_${which}_name`, shared_value_key: `child_${which}_name` },
    scope: "child",
    confidence: "high",
});
const guardianName = (which: "first" | "last"): BindingSuggestion => ({
    field_source: { entity_type: "guardian", field_key: `guardian_${which}_name`, shared_value_key: `guardian_${which}_name` },
    scope: "household",
    confidence: "high",
});
const household = (entity_type: string, field_key: string, confidence: BindingSuggestion["confidence"] = "medium"): BindingSuggestion => ({ field_source: { entity_type, field_key }, scope: "household", confidence });

/**
 * Ordered rules — first match wins. More specific patterns (first/last name, date of birth,
 * date signed) MUST precede generic ones (name, date).
 */
const RULES: Rule[] = [
    // Child split-name (only if first/last explicit)
    { test: /\b(child|student|pupil)\b.*\bfirst\s*name\b|\bfirst\s*name\b.*\b(child|student)\b/i, suggest: childName("first") },
    { test: /\b(child|student|pupil)\b.*\blast\s*name\b|\blast\s*name\b.*\b(child|student)\b/i, suggest: childName("last") },
    // Child / student full name
    { test: /\b(child|student|pupil)('?s)?\s*name\b|\bname\s*of\s*(child|student)\b/i, suggest: { ...childName("first"), note: "Captured as separate first and last name fields." } },
    // DOB (before generic date)
    { test: /\b(date\s*of\s*birth|birth\s*date|birthdate|d\.?o\.?b\.?)\b/i, suggest: cm("dob") },
    // Child attributes
    { test: /\ballerg/i, suggest: cm("allergies", "medium") },
    { test: /\b(medical|medications?|immuniz|health\s*condition)/i, suggest: cm("medical_notes", "low") },
    // Parent / guardian split-name
    { test: /\b(parent|guardian|mother|father|caregiver)\b.*\bfirst\s*name\b/i, suggest: guardianName("first") },
    { test: /\b(parent|guardian|mother|father|caregiver)\b.*\blast\s*name\b/i, suggest: guardianName("last") },
    // Parent / guardian full name
    { test: /\b(parent|guardian|mother|father|caregiver|emergency\s*contact)('?s)?\s*name\b/i, suggest: { ...guardianName("first"), note: "Captured as separate first and last name fields." } },
    // Contact
    { test: /\bemail\b/i, suggest: person("email") },
    { test: /\b(phone|telephone|mobile|cell)\b/i, suggest: person("phone") },
    // Household / address
    { test: /\b(address|street|city|state|zip|postal)\b/i, suggest: household("customer", "address", "low") },
    // Signature dates (before generic date) — recipient-scoped, no field_source
    { test: /\b(date\s*signed|signed\s*date|signature\s*date)\b/i, suggest: { scope: "recipient", confidence: "high", special: "signature_date" } },
    { test: /\b(signature|sign\s*here|e-?sign|attestation|consent)\b/i, suggest: { scope: "recipient", confidence: "high" } },
    // Generic date → submission date (low confidence)
    { test: /\bdate\b/i, suggest: { scope: "recipient", confidence: "low", special: "submission_date", note: "Generic date — verify if this is a signature/submission date." } },
];

/**
 * Suggest a canonical binding for a detected field. Signature-typed fields are always
 * recipient-scoped. Returns `null` when nothing confident matches (operator binds manually).
 */
export function suggestFieldBinding(label: string, type: string): BindingSuggestion | null {
    if (type === "signature") return { scope: "recipient", confidence: "high" };
    if (type === "file_ref") return { scope: "child", confidence: "low", note: "Upload — usually a child document (e.g. immunization)." };

    const text = (label ?? "").trim();
    if (!text) return null;
    for (const rule of RULES) {
        if (rule.types && !(rule.types as readonly string[]).includes(type)) continue;
        if (rule.test.test(text)) return rule.suggest;
    }
    return null;
}

export interface BindableFieldInput {
    id: string;
    label: string;
    type: FormField["type"];
    field_source?: FormFieldSource;
}

export interface BindingProposal {
    id: string;
    label: string;
    type: FormField["type"];
    /** Existing or newly-suggested binding (existing wins; null when none). */
    field_source: FormFieldSource | null;
    scope: BindingScope | null;
    suggested: boolean;
    confidence: BindingSuggestion["confidence"] | null;
    special?: BindingSuggestion["special"];
    note?: string;
}

/**
 * Produce binding proposals for a set of fields: keep existing `field_source`, otherwise
 * auto-propose from the suggester. Pure — the UI presents these for accept/change, and the
 * accepted bindings are persisted onto the form fields.
 */
export function buildBindingProposals(fields: BindableFieldInput[]): BindingProposal[] {
    return fields.map((f) => {
        if (f.field_source) {
            return { id: f.id, label: f.label, type: f.type, field_source: f.field_source, scope: null, suggested: false, confidence: null };
        }
        const s = suggestFieldBinding(f.label, f.type);
        return {
            id: f.id,
            label: f.label,
            type: f.type,
            field_source: s?.field_source ?? null,
            scope: s?.scope ?? null,
            suggested: Boolean(s),
            confidence: s?.confidence ?? null,
            ...(s?.special ? { special: s.special } : {}),
            ...(s?.note ? { note: s.note } : {}),
        };
    });
}

/**
 * Apply auto-suggested `field_source` to fields that are currently unbound (existing bindings
 * kept). Returns the same field shape with `field_source` set where suggested. Used when
 * generating a form so it persists canonical bindings by default.
 */
export function applyBindingSuggestions<T extends BindableFieldInput>(fields: T[]): T[] {
    return fields.map((f) => {
        if (f.field_source) return f;
        const s = suggestFieldBinding(f.label, f.type);
        if (s?.field_source) return { ...f, field_source: s.field_source };
        return f;
    });
}
