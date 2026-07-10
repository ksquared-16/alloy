/**
 * Processing review-question canonical field catalog consumer.
 *
 * Exposes eligible canonical fields per destination entity for the review inspector.
 * Consumes the shared builder library + system field registry — no Processing-only catalog.
 */

import type { FormFieldSource } from "@/lib/forms/schema";
import { suggestFieldBinding } from "@/lib/forms/canonicalBindingSuggestions";
import {
    PROCESSING_BUILDER_CANONICAL_FIELDS,
    resolveProcessingBuilderRegistryEntry,
    type ProcessingBuilderCanonicalField,
} from "@/lib/forms/processingFormBuilderLibrary";
import type { QuestionSubject } from "./questionResolutionModel";

export type ReviewCanonicalFieldOption = {
    id: string;
    label: string;
    meta: string;
    entityType: string;
    valueKind: string;
    fieldSource: FormFieldSource;
};

export type ReviewFieldSuggestion = {
    fieldId: string;
    label: string;
    confidence: "high" | "medium" | "low";
    confidencePercent: number;
    fieldSource: FormFieldSource;
};

const SUBJECT_ENTITY_TYPES: Record<QuestionSubject, readonly string[]> = {
    child: ["child"],
    parent: ["guardian", "person"],
    guardian: ["guardian"],
    other_adult: ["guardian"],
    household: ["customer"],
    enrollment: ["enrollment", "opportunity"],
    processing_only: [],
};

function registryFieldSource(entry: NonNullable<ReturnType<typeof resolveProcessingBuilderRegistryEntry>>): FormFieldSource {
    return entry.shared_value_key
        ? { entity_type: entry.entity_type, field_key: entry.field_key, shared_value_key: entry.shared_value_key }
        : { entity_type: entry.entity_type, field_key: entry.field_key };
}

function toOption(canonical: ProcessingBuilderCanonicalField): ReviewCanonicalFieldOption | null {
    const entry = resolveProcessingBuilderRegistryEntry(canonical);
    if (!entry) return null;
    return {
        id: canonical.id,
        label: canonical.pickerLabel,
        meta: canonical.pickerMeta,
        entityType: entry.entity_type,
        valueKind: entry.suggested_kind,
        fieldSource: registryFieldSource(entry),
    };
}

/** All eligible canonical fields for a review destination entity. */
export function eligibleCanonicalFieldsForSubject(subject: QuestionSubject): ReviewCanonicalFieldOption[] {
    const allowed = new Set(SUBJECT_ENTITY_TYPES[subject] ?? []);
    if (allowed.size === 0) return [];
    const out: ReviewCanonicalFieldOption[] = [];
    for (const canonical of PROCESSING_BUILDER_CANONICAL_FIELDS) {
        const entry = resolveProcessingBuilderRegistryEntry(canonical);
        if (!entry || !allowed.has(entry.entity_type)) continue;
        const option = toOption(canonical);
        if (option) out.push(option);
    }
    return out;
}

function confidencePercent(confidence: "high" | "medium" | "low"): number {
    if (confidence === "high") return 85;
    if (confidence === "medium") return 65;
    return 40;
}

function bindingToFieldId(fieldSource: FormFieldSource, eligible: ReviewCanonicalFieldOption[], label: string): string | null {
    const matches = eligible.filter((canonical) => {
        const entry = resolveProcessingBuilderRegistryEntry(
            PROCESSING_BUILDER_CANONICAL_FIELDS.find((f) => f.id === canonical.id)!
        );
        if (!entry) return false;
        return entry.field_key === fieldSource.field_key && entry.entity_type === fieldSource.entity_type;
    });
    if (matches.length === 0) {
        const match = PROCESSING_BUILDER_CANONICAL_FIELDS.find((canonical) => {
            const entry = resolveProcessingBuilderRegistryEntry(canonical);
            if (!entry) return false;
            return entry.field_key === fieldSource.field_key && entry.entity_type === fieldSource.entity_type;
        });
        return match?.id ?? null;
    }
    if (matches.length === 1) return matches[0]!.id;

    const text = label.toLowerCase();
    if (/\b(parent|guardian)\b/.test(text) && !/\bemergency\b/.test(text)) {
        const comm = matches.find((m) => /parent|guardian/i.test(m.label) && !/emergency/i.test(m.label));
        if (comm) return comm.id;
    }
    if (/\bemergency\b/.test(text)) {
        const emergency = matches.find((m) => /emergency/i.test(m.label));
        if (emergency) return emergency.id;
    }
    return matches[0]!.id;
}

/** Ranked semantic field-match suggestion for a detected question. */
export function suggestReviewDestinationField(input: {
    evidenceLabel: string;
    displayLabel: string;
    type: string;
    subject: QuestionSubject;
}): ReviewFieldSuggestion | null {
    const eligible = eligibleCanonicalFieldsForSubject(input.subject);
    if (eligible.length === 0) return null;

    const binding = suggestFieldBinding(input.evidenceLabel || input.displayLabel, input.type);
    if (binding?.field_source) {
        const fieldId = bindingToFieldId(binding.field_source, eligible, input.evidenceLabel || input.displayLabel);
        const matched = fieldId ? eligible.find((f) => f.id === fieldId) : eligible.find(
            (f) =>
                f.fieldSource.field_key === binding.field_source!.field_key &&
                f.fieldSource.entity_type === binding.field_source!.entity_type
        );
        if (matched) {
            const confidence = binding.confidence ?? "medium";
            return {
                fieldId: matched.id,
                label: matched.label,
                confidence,
                confidencePercent: confidencePercent(confidence),
                fieldSource: matched.fieldSource,
            };
        }
    }

    const label = (input.evidenceLabel || input.displayLabel).trim().toLowerCase();
    const typeFallback =
        input.type === "date"
            ? eligible.find((f) => f.valueKind === "date")
            : input.type === "boolean"
              ? eligible.find((f) => f.valueKind === "checkbox")
              : /\bemail\b/i.test(label)
                ? eligible.find((f) => f.valueKind === "email" && !/emergency/i.test(f.label)) ??
                  eligible.find((f) => f.valueKind === "email")
                : /\b(phone|telephone|mobile|cell)\b/i.test(label)
                  ? eligible.find((f) => f.valueKind === "phone" && !/emergency/i.test(f.label)) ??
                    eligible.find((f) => f.valueKind === "phone")
                  : /\b(first|given)\b/i.test(label)
                    ? eligible.find((f) => /first name/i.test(f.label))
                    : /\blast\b/i.test(label)
                      ? eligible.find((f) => /last name/i.test(f.label))
                      : /\b(campus|location|site|school)\b/i.test(label)
                        ? eligible.find((f) => f.id === "child_site")
                        : null;

    if (typeFallback) {
        return {
            fieldId: typeFallback.id,
            label: typeFallback.label,
            confidence: "medium",
            confidencePercent: 65,
            fieldSource: typeFallback.fieldSource,
        };
    }

    return null;
}

export function reviewFieldOptionById(fieldId: string): ReviewCanonicalFieldOption | null {
    const canonical = PROCESSING_BUILDER_CANONICAL_FIELDS.find((f) => f.id === fieldId);
    if (!canonical) return null;
    return toOption(canonical);
}
