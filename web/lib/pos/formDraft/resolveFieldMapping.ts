/**
 * ONE resolver for "where does this answer belong?", used by every surface that asks.
 *
 * The mapping intelligence already existed and was good: `questionResolutionModel` infers a question's
 * intent from its label AND the section it sits under (so a bare "Name:" under "Parent or Guardian #1"
 * is a guardian's name), picks a subject, consults the canonical destination catalog and the canonical
 * binding suggestions, and derives a real `field_source`. What it did not do was reach the operator:
 * it ran inside concept review, and its own comment said it plainly — "a question has NO field_source
 * until the concept review is applied. Detection alone never binds storage."
 *
 * That is the thing being changed. The intelligence is not rewritten, re-tuned or duplicated here;
 * this module is the single place that CALLS it and turns its answer into the five states an operator
 * sees. The imported-form surface and the draft presenter both read from here, so there is one
 * resolver rather than two that drift.
 *
 * ## The safety law
 *
 * A mapping is applied automatically only when the existing resolver produced a canonical destination
 * AND the question's resolution status is settled. A low-confidence or needs-review question keeps its
 * destination as a SUGGESTION — offered, visible, not written. Nothing is mapped because two labels
 * looked alike; label similarity is only ever an input to the existing resolver, never a decision made
 * here. A safe half is worth more than a dangerous nine tenths: a wrong canonical binding writes the
 * wrong child's allergy to a real record, and no amount of saved typing pays for that.
 */

import type { FormFieldSource } from "@/lib/forms/schema";
import type { DraftFormField } from "@/lib/pos/processingCase/formDraft/types";
import { matchCanonicalDestination } from "./canonicalImportMatch";
import {
    classifyReviewQuestionMapping,
    defaultSubjectForIntent,
    deriveFieldSources,
    deriveResolutionStatus,
    inferQuestionIntent,
    seedReviewQuestionFromDraftField,
    storageSummaryLabel,
} from "@/lib/pos/processingCase/formDraft/questionResolutionModel";

/** How a question's destination stands, in the operator's terms. */
export type FieldMappingState =
    /** A canonical destination is settled. The family will not be asked to retype it. */
    | "mapped"
    /** A destination is proposed and visible, and deliberately NOT applied. */
    | "suggested"
    /** Nothing canonical could be established. This is what gets red-lined. */
    | "needs_mapping"
    /** Collected as evidence on the form, with no canonical destination, on purpose. */
    | "form_only"
    /** Alloy works this out itself and should not ask at all. */
    | "derived";

export type FieldMapping = {
    readonly state: FieldMappingState;
    /** "Date of birth", "Parent / guardian first name" — the destination in business language. */
    readonly destinationLabel: string | null;
    /** One plain sentence for the operator. Never engineering vocabulary. */
    readonly explanation: string;
    /**
     * The destination to APPLY. Present only for `mapped`.
     *
     * A suggestion deliberately leaves this absent: the proposal is carried in `proposed` so a surface
     * can offer it with one click without anything having been written on the operator's behalf.
     */
    readonly apply: FormFieldSource | null;
    readonly proposed: FormFieldSource | null;
};

/** A settled status means the existing resolver was confident, not that a label matched. */
const SETTLED = new Set(["high", "medium"]);

/** The record a destination lands on, in the operator's words. Never the raw entity token. */
function subjectNoun(entityType: string): string {
    switch (entityType) {
        case "child":
        case "customer_member":
            return "the child";
        case "person":
        case "guardian":
            return "a parent or guardian";
        case "customer":
            return "the household";
        default:
            return "this record";
    }
}

export function resolveFieldMapping(
    field: Pick<DraftFormField, "id" | "label" | "type" | "required" | "confidence" | "evidence" | "page" | "pdf_field_name" | "bbox" | "field_source" | "derived">,
    sectionTitle: string,
): FieldMapping {
    if (field.derived) {
        return {
            state: "derived",
            destinationLabel: null,
            explanation: "Alloy works this out itself — the family is not asked.",
            apply: null,
            proposed: null,
        };
    }

    /*
     * The existing seed is what does the thinking: intent from label + section, subject, the canonical
     * catalog, then `suggestFieldBinding`. It returns a question already carrying the destination the
     * engine believes in, which is exactly what was being thrown away before the operator saw it.
     */
    const seeded = seedReviewQuestionFromDraftField({
        id: field.id,
        label: field.label,
        type: field.type,
        section: sectionTitle,
        ...(field.required !== undefined ? { required: field.required } : {}),
        ...(field.confidence ? { confidence: field.confidence } : {}),
        ...(field.evidence ? { evidence: field.evidence } : {}),
        ...(field.pdf_field_name ? { pdf_field_name: field.pdf_field_name } : {}),
        ...(typeof field.page === "number" ? { page: field.page } : {}),
        ...(field.bbox ? { bbox: field.bbox } : {}),
        ...(field.field_source ? { field_source: field.field_source } : {}),
    });

    const disposition = classifyReviewQuestionMapping(seeded);
    const status = deriveResolutionStatus(seeded);

    /*
     * The destination comes from `deriveFieldSources`, which is the resolver's own answer — the same
     * call `classifyReviewQuestionMapping` makes to decide whether a question is mapped at all.
     *
     * The seeded `field_source` is NOT it. The seed consults only the curated catalog and the binding
     * suggestions, so a bare "Name:" under "Parent or Guardian #1" comes back empty from the seed while
     * the resolver classifies it, correctly, as a guardian's name. Reading the weaker of the two would
     * have shown "needs mapping" on a question the engine had in fact already placed.
     */
    const intent = inferQuestionIntent(seeded.evidenceLabel || seeded.displayLabel, sectionTitle);
    const subject = seeded.questionSubject ?? defaultSubjectForIntent(intent);
    const proposed =
        deriveFieldSources({
            subject,
            ...(seeded.nameRepresentation ? { nameRepresentation: seeded.nameRepresentation } : {}),
            intent,
            displayLabel: seeded.displayLabel,
            type: seeded.type,
            ...(seeded.destinationFieldId ? { destinationFieldId: seeded.destinationFieldId } : {}),
        }) ?? null;
    /*
     * WHERE THE CATALOG FINALLY BECOMES REACHABLE.
     *
     * `inferQuestionIntent` is a closed vocabulary of nine patterns, and anything it does not recognise
     * becomes `processing_only` — at which point `deriveFieldSources` returns undefined on its first
     * line, before any catalog is consulted. So an obvious canonical fact could be unreachable purely
     * because nobody had written a regex for it: "How would you describe your child's gender?" resolved
     * to form-only while `child:gender` sat in the catalog the picker offers.
     *
     * The intent vocabulary stays as the high-confidence shortcut and runs first. Only when it has said
     * "generic" does the question get asked of the canonical field authority, and only an unambiguous
     * answer is accepted. @see canonicalImportMatch for the law.
     */
    const catalogMatch =
        !proposed && intent === "generic" ? matchCanonicalDestination(seeded.displayLabel, sectionTitle) : null;
    const resolved = proposed ?? catalogMatch?.fieldSource ?? null;
    const label = resolved
        ? catalogMatch?.label ?? storageSummaryLabel(resolved, seeded.destinationFieldId)
        : null;

    /*
     * An operator's own decision outranks everything. A destination already written on the draft was
     * either applied safely at import or chosen by a person, and either way it is not a proposal.
     */
    /*
     * `unmapped` / `custom` are how the engine records "considered, and not canonical". They are the
     * red line, not a decision, so they must not short-circuit as an operator's own destination.
     */
    const ownKey = field.field_source?.field_key;
    const ownDestination = ownKey && ownKey !== "unmapped" && ownKey !== "custom" ? field.field_source : null;
    if (ownDestination?.entity_type && ownDestination?.field_key) {
        return {
            state: "mapped",
            destinationLabel: storageSummaryLabel(ownDestination, seeded.destinationFieldId),
            explanation: `Alloy already knows this — ${storageSummaryLabel(ownDestination, seeded.destinationFieldId)}.`,
            apply: ownDestination,
            proposed: ownDestination,
        };
    }

    /*
     * A catalog match is a destination the authority named, so it is applied — the question was only
     * "form field only" because the intent vocabulary had nothing to say about it, which is an absence
     * of recognition rather than a decision that the answer belongs on the form.
     */
    if (catalogMatch) {
        return {
            state: "mapped",
            destinationLabel: catalogMatch.label,
            explanation: `Alloy already knows this — ${catalogMatch.label} for ${subjectNoun(catalogMatch.fieldSource.entity_type)}.`,
            apply: catalogMatch.fieldSource,
            proposed: catalogMatch.fieldSource,
        };
    }

    if (disposition === "form_field_only" || status === "processing_only") {
        return {
            state: "form_only",
            destinationLabel: null,
            explanation: "Kept with the form as the family's answer.",
            apply: null,
            proposed: proposed,
        };
    }

    if (!proposed || disposition === "unresolved") {
        return {
            state: "needs_mapping",
            destinationLabel: null,
            explanation: "Alloy could not tell where this answer belongs.",
            apply: null,
            proposed: proposed,
        };
    }

    if (SETTLED.has(status)) {
        return {
            state: "mapped",
            destinationLabel: label,
            explanation: `Alloy already knows this — ${label}.`,
            apply: proposed,
            proposed,
        };
    }

    return {
        state: "suggested",
        destinationLabel: label,
        explanation: `Alloy thinks this is ${label}. Worth confirming before it is used.`,
        apply: null,
        proposed,
    };
}

/**
 * The destinations to write at import, so an imported form arrives already mapped where it safely can.
 *
 * Returns only the fields the law above allows to be applied. A field already carrying a destination
 * is left exactly as it is — re-deriving it could overwrite an operator's correction with a guess.
 */
export function safeImportMappings(
    fields: readonly DraftFormField[],
    sectionTitleByFieldId: ReadonlyMap<string, string>,
): ReadonlyMap<string, FormFieldSource> {
    const out = new Map<string, FormFieldSource>();
    for (const field of fields) {
        if (field.field_source?.entity_type && field.field_source?.field_key) continue;
        if (field.suppressed_by_collection) continue;
        const resolved = resolveFieldMapping(field, sectionTitleByFieldId.get(field.id) ?? "");
        if (resolved.state === "mapped" && resolved.apply) out.set(field.id, resolved.apply);
    }
    return out;
}
