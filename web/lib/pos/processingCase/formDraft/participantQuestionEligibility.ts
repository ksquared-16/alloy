/**
 * Which source destinations become participant questions, and what they are called.
 *
 * `buildFormDraftFromStructure` maps ONE destination to ONE participant field, taking the label from
 * the OCR string and the type from the reader's guess. Nothing consults the semantic layer that
 * Processing already produced. The published Forms show what that costs:
 *
 *     173 participant fields for 86 correlated facts
 *     63 labels carrying OCR/bilingual noise ("Phone Number NúMero De TeléFono Row1")
 *     5 of 173 fields carrying a shared_value_key — so one fact does not populate many destinations
 *     a phone destination projected as `type: "number"`
 *
 * The grain is the defect, not the labels. A destination is a PLACEMENT on a document; a participant
 * question is a thing a person is asked. The two are related by the semantic fact between them, and
 * one fact may own several placements.
 *
 * This module answers both questions from evidence that already exists — the concept's disposition,
 * its canonical binding, and the canonical label registries — and refuses to guess. Where it cannot
 * name a question safely it says HOLD, because publishing an OCR string as participant copy is worse
 * than telling an operator a decision is owed.
 *
 * Pure. No I/O.
 */

import type { BusinessConceptCandidate, ConfigurationProposal } from "@/lib/pos/discovery/contracts";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import { CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST } from "@/lib/fields/customerMemberFieldRegistry";

/** What a destination becomes for the participant. */
export type ParticipantRole =
    /** A scalar question the participant answers. */
    | "question"
    /** Part of a repeating/structured set answered as a group, never as N loose questions. */
    | "structured_collection"
    /** Alloy already knows it; the participant confirms rather than retypes. */
    | "prefill_confirm"
    /** A document the participant provides. */
    | "upload"
    | "acknowledgement"
    | "signature"
    /** Prose reproduced on the artifact; never asked. */
    | "static_content"
    /** Placed on the artifact from a fact owned elsewhere — never asked directly. */
    | "artifact_placement_only"
    /** Owned by a platform area that cannot take it yet. */
    | "held"
    /** A guardian/party fact — resolved through the Relationship + Person owners, never a child field. */
    | "relationship_person"
    /** Askable, but no durable Alloy field or entity is created for the answer. */
    | "process_scoped"
    /** A control belonging to one artifact's own logic, not a packet-wide question. */
    | "artifact_structured_control"
    /** Asked only when its parent gate makes it applicable. */
    | "dependent_question"
    /** No safe participant question exists. An operator decides; nothing is published. */
    | "hold_for_review";

export type ParticipantProjection = {
    role: ParticipantRole;
    /** Participant-facing copy. Present only when the role is actually asked. */
    label?: string;
    /** Canonical semantic type — never the reader's widget guess. */
    semanticType?: "text" | "phone" | "email" | "date" | "number" | "boolean" | "select";
    /** The shared identity that lets one answer populate every destination that needs it. */
    sharedValueKey?: string;
    /** For `dependent_question`: the concept whose answer decides whether this is asked. */
    dependsOnConceptId?: string;
    /** Why, in one clause — so a reviewer can disagree with the reasoning, not just the label. */
    basis: string;
};

/**
 * Dispositions that are not participant scalars, mapped to what they actually are.
 *
 * Taken from the certified disposition vocabulary rather than re-derived, so a change there cannot
 * leave this table quietly disagreeing.
 */
const ROLE_BY_DISPOSITION: Partial<Record<ConfigurationProposal["disposition"], ParticipantRole>> = {
    upload_requirement: "upload",
    acknowledgement: "acknowledgement",
    signature_requirement: "signature",
    static_content: "static_content",
    output_binding: "artifact_placement_only",
    derived_value_system: "artifact_placement_only",
    structured_collection: "structured_collection",
    financial_payment: "held",
    held_for_canonical_owner: "held",
    held_unknown_owner: "hold_for_review",
    unresolved: "hold_for_review",
    safeguarding_binding: "held",
};

/** A label that is provenance, not participant copy. */
const OCR_NOISE = /\bRow\s*\d+\b|Dosis|NúMero|Apellido|Fecha\s+De|Nombre\s+De|Segundo\s+Nombre|Primer\s+Nombre/i;

export function looksLikeSourceLabel(label: string | null | undefined): boolean {
    return OCR_NOISE.test(label ?? "");
}

/**
 * Does this label read as a question someone actually wrote?
 *
 * Ends in a question mark, or opens with an interrogative. Both are properties of authored prose,
 * which is why a bespoke school intake form has them and a scanned government grid does not. A
 * heading ("Developmental History:") and a checkbox caption ("Module") fail deliberately — inventing
 * the question they imply would be guessing at meaning.
 */
export function readsAsAuthoredQuestion(label: string | null | undefined): boolean {
    const text = (label ?? "").trim();
    if (text.length < 8 || looksLikeSourceLabel(text)) return false;
    if (text.endsWith("?")) return true;
    return /^(has|have|does|do|did|is|are|was|were|can|could|will|would|should|how|what|when|where|which|who|why)\b/i.test(text);
}

/**
 * Canonical participant copy for a bound destination.
 *
 * Registry first. Where no registry names it, the label is humanised from the CANONICAL KEY —
 * `person.phone` → "Phone" — never from the source string. That distinction is the whole point: a
 * canonical key is a semantic identifier Alloy chose, while "Phone Number NúMero De TeléFono Row1"
 * is what a scanner read off a bilingual government form. Humanising the first is naming a concept;
 * cleaning up the second is guessing at one.
 */
export function canonicalLabelFor(entityType: string, fieldKey: string): string | null {
    const system = OPERATIONAL_FORM_SYSTEM_FIELDS.find((f) => f.field_key === fieldKey);
    if (system?.default_label) return system.default_label;
    if (entityType === "customer_member") {
        const member = CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.find((f) => f.field_key === fieldKey);
        if (member?.label) return member.label;
    }
    return humaniseCanonicalKey(fieldKey);
}

/** `emergency_contact_phone` → "Emergency contact phone". Applied ONLY to canonical keys. */
export function humaniseCanonicalKey(fieldKey: string): string | null {
    const key = fieldKey.trim();
    if (!key || !/^[a-z0-9_]+$/i.test(key)) return null;
    const words = key.split("_").filter(Boolean);
    if (!words.length) return null;
    return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

/**
 * Semantic type for a canonical destination.
 *
 * Phone is the case that proves why the reader's widget guess cannot be trusted: the Oregon form's
 * phone box is numeric, the reader honestly reported `number`, and the projection stored
 * `person:phone = 1231231234` — a phone with no leading zero, no formatting and no country code,
 * because it stopped being a phone the moment it became a number.
 */
export function semanticTypeFor(fieldKey: string, readerType: string | null | undefined): ParticipantProjection["semanticType"] {
    if (/(^|_)phone(_|$)|mobile|telephone/i.test(fieldKey)) return "phone";
    if (/(^|_)email(_|$)/i.test(fieldKey)) return "email";
    if (/(^|_)(dob|date_of_birth)(_|$)|_date(_|$)/i.test(fieldKey)) return "date";
    switch (readerType) {
        case "date": return "date";
        case "boolean": return "boolean";
        case "select": return "select";
        case "number": return "number";
        default: return "text";
    }
}

/**
 * A dependent fragment: "If yes, their relationship to your child:".
 *
 * The source pairs a gate with the fragment that follows it — the certified structure shows
 * `choice_field` at 13 followed by a `conditional_explanation` at 14, and the same shape at 15/16.
 * Recovering the parent is reading that pairing, not guessing at meaning: the fragment is asked only
 * when the nearest preceding gate in its own section says it applies.
 */
export function looksLikeDependentFragment(label: string | null | undefined): boolean {
    return /^\s*if\s+(yes|so|applicable)\b/i.test(label ?? "");
}

/** A snake_case identifier is document plumbing — `subject_line` is not a thing to ask anyone. */
export function looksLikeStructuralIdentifier(label: string | null | undefined): boolean {
    const text = (label ?? "").trim();
    return text.length > 0 && /^[a-z][a-z0-9_]*$/.test(text);
}

/** A caption over other fields — "Developmental History:", "Social relationships:". */
export function looksLikeHeading(label: string | null | undefined): boolean {
    const text = (label ?? "").trim();
    return text.endsWith(":") && !readsAsAuthoredQuestion(text) && text.split(/\s+/).length <= 4;
}

export function projectParticipantRole(input: {
    concept: Pick<BusinessConceptCandidate, "label" | "concept_key" | "kind">;
    proposal: Pick<ConfigurationProposal, "disposition" | "target_field_source">;
    /** The reader's widget guess for the destination. Advisory only. */
    readerType?: string | null;
    /** The concept immediately preceding this one in source order, for dependent gating. */
    precedingGateConceptId?: string | null;
    /** True when this concept sits on an artifact that owns its own structured logic (the exemption). */
    onSelfContainedArtifact?: boolean;
}): ParticipantProjection {
    const { concept, proposal } = input;

    const mapped = ROLE_BY_DISPOSITION[proposal.disposition];
    if (mapped) {
        /*
         * `held_unknown_owner` is a statement about DURABLE ownership, not about whether a family
         * should be asked. The Slice 7 doctrine is explicit that held means collected-but-not-durable,
         * so a held concept whose source already carries a well-formed question — the school's own
         * words, "Is your child able to play alone?" — can be asked as a process-scoped answer while
         * still creating no canonical field.
         *
         * The guard is deliberately narrow: the label must READ as a question the school wrote, not
         * merely be free of OCR noise. A bare noun ("Module", "Developmental History:") is a heading
         * or a checkbox caption, and guessing what it asks is exactly the ownership inference this
         * whole pass exists to prevent.
         */
        if (mapped === "hold_for_review") {
            const directed = applyDirectorDecisions(input);
            if (directed) return directed;
        }
        if (mapped === "hold_for_review" && readsAsAuthoredQuestion(concept.label)) {
            return {
                role: "question",
                label: concept.label.trim(),
                semanticType: semanticTypeFor(concept.concept_key ?? "", input.readerType),
                basis: "the source already asks this in its own words; collected process-scoped, no durable field",
            };
        }
        return { role: mapped, basis: `disposition ${proposal.disposition}` };
    }

    // Bound to a canonical destination: Alloy either knows it or can ask it in its own words.
    const target = proposal.target_field_source;
    if (target?.field_key) {
        const label = canonicalLabelFor(target.entity_type, target.field_key);
        if (!label) {
            return {
                role: "hold_for_review",
                basis: `bound to ${target.entity_type}.${target.field_key}, which has no registered participant label`,
            };
        }
        return {
            role: "prefill_confirm",
            label,
            semanticType: semanticTypeFor(target.field_key, input.readerType),
            sharedValueKey: target.shared_value_key ?? `${target.entity_type}:${target.field_key}`,
            basis: `canonical ${target.entity_type}.${target.field_key}`,
        };
    }

    // Unbound. The only copy available is the source string, and a source string is provenance.
    if (looksLikeSourceLabel(concept.label)) {
        return {
            role: "hold_for_review",
            basis: "no canonical binding and the only available label is a source/OCR string",
        };
    }
    return {
        role: "question",
        label: concept.label,
        semanticType: semanticTypeFor(concept.concept_key ?? "", input.readerType),
        basis: "unbound concept with a readable label",
    };
}

/** Roles that put a question in front of a participant. */
export const ASKED_ROLES: readonly ParticipantRole[] = ["question", "prefill_confirm", "structured_collection"];

export function isAsked(role: ParticipantRole): boolean {
    return ASKED_ROLES.includes(role);
}

/**
 * The four settled decisions for concepts the model cannot name on its own.
 *
 * Each keys on a SEMANTIC property — the concept's grain, its artifact, its structural shape, its
 * gate — never on wording similarity, because "it sounds like an employer field" is exactly the
 * inference that manufactures false ownership.
 */
function applyDirectorDecisions(input: {
    concept: Pick<BusinessConceptCandidate, "label" | "concept_key" | "kind">;
    precedingGateConceptId?: string | null;
    onSelfContainedArtifact?: boolean;
    readerType?: string | null;
}): ParticipantProjection | null {
    const key = input.concept.concept_key ?? "";
    const label = input.concept.label ?? "";

    // 4. Structural artifact metadata. Never asked, never stored — placement lineage only.
    if (looksLikeStructuralIdentifier(label)) {
        return { role: "artifact_placement_only", basis: "structural artifact metadata, not a prompt" };
    }

    // 3b. A dependent fragment is asked only when its gate applies. Without a recoverable gate it
    //     stays held — an unconditioned "If yes…" asked of everyone is a worse defect than a hold.
    if (looksLikeDependentFragment(label)) {
        return input.precedingGateConceptId
            ? {
                  role: "dependent_question",
                  label: label.replace(/:$/, "").trim(),
                  semanticType: semanticTypeFor(key, input.readerType),
                  dependsOnConceptId: input.precedingGateConceptId,
                  basis: "dependent on the preceding gate in its own section",
              }
            : { role: "hold_for_review", basis: "dependent fragment whose gate cannot be recovered" };
    }

    // 1. Guardian/party grain. Identity and contact resolve through Relationship + Person; the two
    //    employer answers have no canonical external-person employment owner, so they are askable
    //    without creating anything durable. Keyed on the `guardian.` grain, not on the words.
    if (key.startsWith("guardian.")) {
        if (/employer/i.test(key)) {
            return {
                role: "process_scoped",
                label: label.replace(/:$/, "").trim(),
                semanticType: semanticTypeFor(key, input.readerType),
                basis: "no canonical external-person employment owner exists; asked, never stored durably",
            };
        }
        return {
            role: "relationship_person",
            basis: "a guardian fact — owned by Relationship + Person, never a child field",
        };
    }

    /*
     * Grain is checked BEFORE label shape, and that order is load-bearing.
     *
     * "Parent/Guardian #1 Employer:" ends in a colon and is three words, so a shape-first rule filed
     * it as a heading and silently dropped a question the school asks. A concept's grain is a
     * semantic fact; its punctuation is typography.
     */
    // 3a. A caption over other fields is static content, not a question.
    if (looksLikeHeading(label)) {
        return { role: "static_content", basis: "a heading over other fields" };
    }

    // 2. An artifact that owns its own logic keeps its controls. The exemption's boxes are that
    //    artifact's structure; as packet-wide questions they would be meaningless captions.
    if (input.onSelfContainedArtifact && input.concept.kind === "choice_field") {
        return {
            role: "artifact_structured_control",
            basis: "a control belonging to this artifact's own logic, not a packet-wide question",
        };
    }

    return null;
}
