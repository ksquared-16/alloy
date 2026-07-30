/**
 * Processing Form Composer — question resolution model.
 *
 * Document evidence → semantic question → operator meaning choice → storage binding(s).
 * The UI speaks in questions and subjects; storage (`field_source`) is derived.
 */

import type { FormFieldSource } from "@/lib/forms/schema";
import { suggestFieldBinding } from "@/lib/forms/canonicalBindingSuggestions";
import {
    reviewFieldOptionById,
    suggestReviewDestinationField,
} from "./processingReviewFieldCatalog";
import type { ManualFieldInput as DraftFieldInput } from "./buildManualFormDraft";

export type QuestionSubject =
    | "child"
    | "parent"
    | "guardian"
    | "household"
    | "enrollment"
    | "other_adult"
    | "processing_only";

export type NameRepresentation = "full_name" | "first_last" | "first_middle_last";

export type QuestionResolutionStatus =
    | "high"
    | "medium"
    | "low"
    | "needs_review"
    | "processing_only"
    | "ignored";

export type QuestionIntent =
    | "child_identity"
    | "date_of_birth"
    | "guardian_identity"
    | "emergency_contact"
    | "contact_info"
    | "health"
    | "date"
    | "signature"
    | "generic";

export type ReviewQuestionInput = {
    id: string;
    /** Label as detected from the source document (evidence). */
    evidenceLabel: string;
    /** Operator-facing question / display label. */
    displayLabel: string;
    type: string;
    section: string;
    required?: boolean;
    confidence?: string;
    evidence?: string;
    /** Region/question provenance for operator review. */
    mappingOrigin?: "auto_detected" | "operator_created" | "operator_corrected";
    pdf_field_name?: string;
    page?: number;
    bbox?: [number, number, number, number];
    questionSubject?: QuestionSubject;
    nameRepresentation?: NameRepresentation;
    /** Selected canonical destination field (registry id). */
    destinationFieldId?: string;
    /** Optional extracted/sample value for normalization preview. */
    sampleValue?: string;
    resolutionStatus?: QuestionResolutionStatus;
    ignored?: boolean;
    /** Advanced override — when set, skips derived storage. */
    field_source?: FormFieldSource;
};

export type ReviewQuestionMappingDisposition = "mapped" | "form_field_only" | "unresolved" | "ignored";

export const PROCESSING_NEEDS_DESTINATION_DESCRIPTION = "Needs destination configuration";
export const UNRESOLVED_AT_GENERATE_EVIDENCE = "unresolved_at_generate";

function hasCanonicalBinding(fieldSource?: FormFieldSource | null): boolean {
    if (!fieldSource?.field_key) return false;
    const key = fieldSource.field_key;
    return key !== "unmapped" && key !== "custom";
}

/** Operator-facing disposition for generate-step summaries and CTAs. */
export function classifyReviewQuestionMapping(question: ReviewQuestionInput): ReviewQuestionMappingDisposition {
    if (question.ignored) return "ignored";
    if (question.questionSubject === "processing_only") return "form_field_only";

    const intent = inferQuestionIntent(question.evidenceLabel || question.displayLabel, question.section ?? "");
    const subject = question.questionSubject ?? defaultSubjectForIntent(intent);
    const fieldSource =
        question.field_source ??
        deriveFieldSources({
            subject,
            nameRepresentation: question.nameRepresentation,
            intent,
            displayLabel: question.displayLabel,
            type: question.type,
            destinationFieldId: question.destinationFieldId,
        });

    if (hasCanonicalBinding(fieldSource)) return "mapped";
    return "unresolved";
}

/** Human label for where a question's answer will land in the generated form. */
export function formatReviewDestinationDisplay(question: ReviewQuestionInput): string {
    const disposition = classifyReviewQuestionMapping(question);
    if (disposition === "ignored") return "Ignored";
    if (disposition === "form_field_only") return "Form field only";
    if (disposition === "unresolved") return "Unresolved";

    const intent = inferQuestionIntent(question.evidenceLabel || question.displayLabel, question.section ?? "");
    const subject = question.questionSubject ?? defaultSubjectForIntent(intent);
    const fieldSource =
        question.field_source ??
        deriveFieldSources({
            subject,
            nameRepresentation: question.nameRepresentation,
            intent,
            displayLabel: question.displayLabel,
            type: question.type,
            destinationFieldId: question.destinationFieldId,
        });
    return storageSummaryLabel(fieldSource, question.destinationFieldId);
}

export type ExpandQuestionsOptions = {
    /** When true, unresolved questions become form-only fields with provenance — not silently mapped. */
    generateAnyway?: boolean;
};

export const QUESTION_SUBJECT_OPTIONS: Array<{ value: QuestionSubject; label: string }> = [
    { value: "child", label: "Child" },
    { value: "parent", label: "Parent" },
    { value: "guardian", label: "Guardian" },
    { value: "other_adult", label: "Other adult" },
    { value: "household", label: "Household" },
    { value: "enrollment", label: "Enrollment" },
    { value: "processing_only", label: "Form field only" },
];

export const NAME_REPRESENTATION_OPTIONS: Array<{ value: NameRepresentation; label: string }> = [
    { value: "full_name", label: "Full name (one field)" },
    { value: "first_last", label: "First + last (two fields)" },
    { value: "first_middle_last", label: "First + middle + last (three fields)" },
];

/** Person-name labels that carry no subject of their own — the section supplies it. */
const BARE_NAME_LABEL_RE = /^\s*(full\s*|legal\s*|first\s*|last\s*|middle\s*|preferred\s*)?name\s*:?\s*$/i;

/**
 * Which person a SECTION is about. Real forms print "Parent or Guardian #1" as a heading and then a
 * bare "Name:" line underneath — the label alone says nothing, so a label-only reader classified it
 * as generic and every such question fell through to "form field only". That is why a guardian's
 * name appeared to be stored nowhere.
 */
function sectionIdentityIntent(sectionTitle: string): QuestionIntent | null {
    const t = sectionTitle.trim();
    if (!t) return null;
    if (/\bemergency\b/i.test(t)) return "emergency_contact";
    if (/\b(parent|guardian|mother|father|caregiver)s?\b/i.test(t)) return "guardian_identity";
    if (/\b(child|student|pupil)\b/i.test(t)) return "child_identity";
    return null;
}

export function inferQuestionIntent(label: string, sectionTitle = ""): QuestionIntent {
    const text = label.trim();
    if (!text) return "generic";

    // A bare "Name:" takes its subject from the section it sits under. Checked FIRST so a guardian
    // section is not out-competed by the generic fallthrough below.
    if (BARE_NAME_LABEL_RE.test(text)) {
        const fromSection = sectionIdentityIntent(sectionTitle);
        if (fromSection) return fromSection;
    }
    if (/\b(signature|sign\s*here|e-?sign)\b/i.test(text)) return "signature";
    if (/\b(child|student|pupil)('?s)?\s*name\b|\bname\s*of\s*(child|student)\b/i.test(text)) return "child_identity";
    if (/\b(parent|guardian|mother|father|caregiver)('?s)?\s*name\b/i.test(text)) return "guardian_identity";
    if (/\bemergency\s*contact\b/i.test(text)) return "emergency_contact";
    if (/\ballerg|medical|immuniz|physician|health\b/i.test(text)) return "health";
    if (/\b(date\s*of\s*birth|birth\s*date|birthdate|d\.?o\.?b\.?)\b/i.test(text)) return "date_of_birth";
    if (/\bemail\b/i.test(text)) return "contact_info";
    if (/\b(phone|telephone|mobile|cell)\b/i.test(text)) return "contact_info";
    if (/\bdate\b/i.test(text)) return "date";
    return "generic";
}

export function defaultSubjectForIntent(intent: QuestionIntent): QuestionSubject {
    switch (intent) {
        case "child_identity":
        case "date_of_birth":
        case "health":
            return "child";
        case "guardian_identity":
        case "contact_info":
            return "parent";
        case "emergency_contact":
            return "other_adult";
        case "signature":
            return "processing_only";
        default:
            return "processing_only";
    }
}

export function supportsNameRepresentation(intent: QuestionIntent, type?: string): boolean {
    if (type === "date" || intent === "date_of_birth") return false;
    return intent === "child_identity" || intent === "guardian_identity" || intent === "emergency_contact";
}

/**
 * A person's name defaults to SEPARATE first and last fields.
 *
 * Paper forms almost always print one "Name: ______" line, and the old default mirrored that
 * literally — so "Child's Name" and a guardian's "Name" both became a single full-name field. That
 * is faithful to the paper and wrong for the record: operators sort, search, greet and match on
 * first and last name, and a single blob has to be re-split by hand later (badly, for anyone with a
 * two-word surname).
 *
 * The document still wins when it is EXPLICIT: a line that actually says "full name" or "name as it
 * appears on…" is asking for one field, so it keeps one. Everything downstream — the expansion in
 * `expandQuestionsForDraftSave`, the canonical first/last field sources — already existed; only this
 * default was holding names together.
 */
export function defaultNameRepresentation(intent: QuestionIntent, evidenceLabel = ""): NameRepresentation {
    if (!supportsNameRepresentation(intent)) return "full_name";
    // An explicit single-field request in the source document is honoured.
    if (/\bfull\s*name\b|\bname\s+as\s+it\s+appears\b|\blegal\s+name\b/i.test(evidenceLabel)) {
        return "full_name";
    }
    return "first_last";
}

export function deriveResolutionStatus(question: ReviewQuestionInput): QuestionResolutionStatus {
    if (question.ignored) return "ignored";
    if (question.resolutionStatus) return question.resolutionStatus;
    if (question.questionSubject === "processing_only") return "processing_only";
    const conf = question.confidence ?? "medium";
    if (conf === "low") return "needs_review";
    if (question.questionSubject && question.displayLabel.trim()) {
        return conf === "high" ? "high" : "medium";
    }
    return "needs_review";
}

function registrySource(entity_type: string, field_key: string, shared_value_key?: string): FormFieldSource {
    return shared_value_key
        ? { entity_type, field_key, shared_value_key }
        : { entity_type, field_key };
}

/** Derive storage binding(s) from resolved meaning — not shown as primary UI. */
export function deriveFieldSources(input: {
    subject: QuestionSubject;
    nameRepresentation?: NameRepresentation;
    intent: QuestionIntent;
    displayLabel: string;
    type: string;
    destinationFieldId?: string;
}): FormFieldSource | undefined {
    if (input.subject === "processing_only") return undefined;

    if (input.destinationFieldId) {
        const selected = reviewFieldOptionById(input.destinationFieldId);
        if (selected) return selected.fieldSource;
    }

    const suggestion = suggestReviewDestinationField({
        evidenceLabel: input.displayLabel,
        displayLabel: input.displayLabel,
        type: input.type,
        subject: input.subject,
    });
    if (suggestion) return suggestion.fieldSource;

    if (input.intent === "date_of_birth" || (input.type === "date" && input.subject === "child")) {
        const dob = reviewFieldOptionById("child_date_of_birth");
        if (dob) return dob.fieldSource;
    }

    if (input.intent === "child_identity" || (input.subject === "child" && supportsNameRepresentation(input.intent, input.type))) {
        if (input.nameRepresentation === "first_last") {
            return registrySource("child", "child_first_name", "child_first_name");
        }
        if (input.nameRepresentation === "first_middle_last") {
            return registrySource("child", "child_first_name", "child_first_name");
        }
        return registrySource("child", "child_first_name", "child_first_name");
    }

    if (input.intent === "guardian_identity" || input.subject === "parent" || input.subject === "guardian") {
        if (input.nameRepresentation === "first_last") {
            return registrySource("guardian", "guardian_first_name", "guardian_first_name");
        }
        return registrySource("guardian", "guardian_first_name", "guardian_first_name");
    }

    if (input.intent === "emergency_contact" || input.subject === "other_adult") {
        return registrySource("guardian", "guardian_first_name", "guardian_first_name");
    }

    if (input.intent === "health" || input.subject === "enrollment") {
        if (/\ballerg/i.test(input.displayLabel)) {
            return registrySource("enrollment", "allergy_notes", "allergy_notes");
        }
    }

    const bindingSuggestion = suggestFieldBinding(input.displayLabel, input.type);
    return bindingSuggestion?.field_source;
}

const PROCESSING_FIELD_LABEL_BY_KEY = new Map<string, string>(
    [
        ["child:child_date_of_birth", "Date of birth"],
        ["child:child_first_name", "Child first name"],
        ["child:child_last_name", "Child last name"],
        ["guardian:guardian_first_name", "Parent / guardian first name"],
        ["guardian:guardian_last_name", "Parent / guardian last name"],
        ["guardian:guardian_email", "Parent email"],
        ["guardian:guardian_phone", "Parent phone"],
        ["enrollment:start_date", "Desired start date"],
        ["enrollment:child_site", "Preferred school / site"],
        ["enrollment:allergy_notes", "Allergies"],
    ] as const
);

/**
 * Human label for where data is stored — shows canonical field when known.
 *
 * IMPORTANT: a question has NO `field_source` until the concept review is applied. Detection alone
 * never binds storage. Labelling that state "Form field only — not synced to records" read as a
 * decision Alloy had made, when it is really "not decided yet" — which is why a guardian's Name
 * appeared to be heading nowhere. `context` lets the caller say which it actually is.
 */
export function storageSummaryLabel(
    fieldSource?: FormFieldSource | null,
    destinationFieldId?: string | null,
    context?: {
        /** Label of the relationship collection this question's section belongs to, when bound. */
        relationshipLabel?: string | null;
        /** True when a concept proposal covering this question is still awaiting a decision. */
        awaitingConceptDecision?: boolean;
    }
): string {
    if (destinationFieldId) {
        const option = reviewFieldOptionById(destinationFieldId);
        if (option) return option.label;
    }
    if (!fieldSource) {
        // Ordered most-specific first: a bound relationship is a real answer, a pending concept is
        // an honest "not yet", and only the remainder is genuinely form-only.
        if (context?.relationshipLabel) return `Collected as ${context.relationshipLabel}`;
        if (context?.awaitingConceptDecision) return "Not decided yet — set this in concept review";
        return "Form field only — not stored on a record";
    }
    const selected = PROCESSING_FIELD_LABEL_BY_KEY.get(`${fieldSource.entity_type}:${fieldSource.field_key}`);
    if (selected) return selected;
    const subject =
        fieldSource.entity_type === "child" || fieldSource.entity_type === "customer_member"
            ? "Child"
            : fieldSource.entity_type === "guardian" || fieldSource.entity_type === "person"
              ? "Parent / guardian"
              : fieldSource.entity_type === "customer"
                ? "Household"
                : fieldSource.entity_type === "enrollment"
                  ? "Enrollment"
                  : "Record";
    return `Store on ${subject}`;
}

/** Expand resolved questions into draft field rows (splits name representations). */
export function expandQuestionsForDraftSave(
    questions: readonly ReviewQuestionInput[],
    options?: ExpandQuestionsOptions
): DraftFieldInput[] {
    const out: DraftFieldInput[] = [];

    for (const question of questions) {
        if (question.ignored) continue;
        const label = question.displayLabel.trim();
        if (!label) continue;

        const disposition = classifyReviewQuestionMapping(question);
        const forceFormOnly =
            options?.generateAnyway && disposition === "unresolved";

        const intent = inferQuestionIntent(question.evidenceLabel || label, question.section ?? "");
        let subject = question.questionSubject ?? defaultSubjectForIntent(intent);
        if (
            question.nameRepresentation &&
            (question.nameRepresentation === "first_last" || question.nameRepresentation === "first_middle_last") &&
            supportsNameRepresentation(intent) &&
            subject === "processing_only"
        ) {
            subject = defaultSubjectForIntent(intent);
        }
        const nameRep = question.nameRepresentation ?? defaultNameRepresentation(intent, question.evidenceLabel);
        const fieldSource = forceFormOnly
            ? undefined
            : question.field_source ??
              deriveFieldSources({
                  subject,
                  nameRepresentation: question.nameRepresentation,
                  intent,
                  displayLabel: label,
                  type: question.type,
                  destinationFieldId: question.destinationFieldId,
              });

        const pdfProvenance = {
            pdf_field_name: question.pdf_field_name,
            page: question.page,
            bbox: question.bbox,
            evidence: forceFormOnly ? UNRESOLVED_AT_GENERATE_EVIDENCE : question.evidence,
            ...(forceFormOnly ? { description: PROCESSING_NEEDS_DESTINATION_DESCRIPTION } : {}),
        };

        const splitName =
            subject !== "processing_only" &&
            (nameRep === "first_last" || nameRep === "first_middle_last") &&
            (supportsNameRepresentation(intent, question.type) ||
                subject === "child" ||
                subject === "parent" ||
                subject === "guardian" ||
                subject === "other_adult");

        if (splitName && subject === "child") {
            out.push({
                label: "Child first name",
                type: "text",
                section: question.section,
                required: question.required,
                field_source: registrySource("child", "child_first_name", "child_first_name"),
                ...pdfProvenance,
            });
            if (nameRep === "first_middle_last") {
                out.push({
                    label: "Child middle name",
                    type: "text",
                    section: question.section,
                    required: false,
                    ...pdfProvenance,
                });
            }
            out.push({
                label: "Child last name",
                type: "text",
                section: question.section,
                required: question.required,
                field_source: registrySource("child", "child_last_name", "child_last_name"),
                ...pdfProvenance,
            });
            continue;
        }

        if (splitName && (subject === "parent" || subject === "guardian" || subject === "other_adult")) {
            out.push({
                label: subject === "other_adult" ? "Emergency contact first name" : "Guardian first name",
                type: "text",
                section: question.section,
                required: question.required,
                field_source: registrySource("guardian", "guardian_first_name", "guardian_first_name"),
                ...pdfProvenance,
            });
            out.push({
                label: subject === "other_adult" ? "Emergency contact last name" : "Guardian last name",
                type: "text",
                section: question.section,
                required: question.required,
                field_source: registrySource("guardian", "guardian_last_name", "guardian_last_name"),
            });
            continue;
        }

        out.push({
            label,
            type: question.type,
            section: question.section,
            required: question.required,
            ...(fieldSource ? { field_source: fieldSource } : {}),
            ...pdfProvenance,
        });
    }

    return out;
}

export function seedReviewQuestionFromDraftField(field: {
    id: string;
    label: string;
    type: string;
    section: string;
    required?: boolean;
    confidence?: string;
    evidence?: string;
    pdf_field_name?: string;
    page?: number;
    bbox?: [number, number, number, number];
    field_source?: FormFieldSource;
}): ReviewQuestionInput {
    const evidenceLabel = field.label;
    // The seed is where a question first gets its subject, so the section must be considered here
    // too — otherwise a bare "Name" under "Parent or Guardian #1" is born as form-only.
    const intent = inferQuestionIntent(evidenceLabel, field.section ?? "");
    const questionSubject = field.field_source
        ? field.field_source.entity_type === "child" || field.field_source.entity_type === "customer_member"
            ? "child"
            : field.field_source.entity_type === "guardian" || field.field_source.entity_type === "person"
              ? "guardian"
              : field.field_source.entity_type === "enrollment"
                ? "enrollment"
                : field.field_source.entity_type === "customer"
                  ? "household"
                  : "processing_only"
        : defaultSubjectForIntent(intent);

    const suggestion = suggestReviewDestinationField({
        evidenceLabel,
        displayLabel: field.label,
        type: field.type,
        subject: questionSubject,
    });

    return {
        id: field.id,
        evidenceLabel,
        displayLabel: field.label,
        type: field.type,
        section: field.section,
        required: field.required,
        confidence: field.confidence,
        evidence: field.evidence,
        pdf_field_name: field.pdf_field_name,
        page: field.page,
        bbox: field.bbox,
        questionSubject,
        nameRepresentation: supportsNameRepresentation(intent, field.type)
            ? defaultNameRepresentation(intent, evidenceLabel)
            : undefined,
        destinationFieldId: suggestion?.fieldId,
        mappingOrigin: field.evidence === "operator" || field.evidence === "manual_pdf_mapping" ? "operator_created" : "auto_detected",
        field_source: field.field_source ?? suggestion?.fieldSource ?? suggestFieldBinding(field.label, field.type)?.field_source,
    };
}
