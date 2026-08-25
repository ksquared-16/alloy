/**
 * POS-FP16 — Configuration Discovery: versioned inter-layer contracts.
 *
 * Configuration Discovery turns imported DOCUMENT STRUCTURE (what the page physically contains,
 * owned by the native-layout detector) into a governed CONFIGURATION PROPOSAL (what business
 * concepts the document expresses, how they map to Alloy's existing data model, and what the
 * operator should approve). Forms are ONE consumer of the approved concepts — not the owner.
 *
 * The pipeline is a chain of EXPLICIT, VERSIONED contracts — never one growing untyped object:
 *
 *   Layer 2  DocumentStructureCandidate   (existing detector — physical structure)
 *   Layer 3  SemanticDocumentModel        (semantic block roles: field / static / signature / …)
 *   Layer 4  BusinessConceptCandidate[]   (operational meaning: child identity, guardian, upload req…)
 *   Layer 5  ConfigurationProposal[]      (reuse canonical field / new field / relationship / requirement…)
 *   Layer 6  form + requirement projection (existing draftFormToFormSchemaV1 / requirement model)
 *
 * STABLE IDENTITY DOCTRINE: every candidate/proposal id derives from SOURCE LINEAGE + structural
 * identity (page · normalized-section · normalized-concept), never from a mutable label or an array
 * index. This is what lets detector reruns preserve accepted operator decisions.
 *
 * REUSE, DON'T DUPLICATE: matching targets are the EXISTING platform vocabularies —
 * `FormFieldSource` (canonical fields), `OperationalRoleKey` (relationships), and the
 * frozen `RequirementType` (requirements). This module owns no parallel storage.
 */

import type { FormFieldSource } from "@/lib/forms/schema";
import type { SectionDisposition } from "@/lib/pos/processingCase/formDraft/sectionDisposition";
import type { RequirementType } from "@/lib/pos/packet/requirementResponsibility";
import type { OperationalRoleKey } from "@/lib/fields/personChildRelationship/personChildRelationshipEntity";

export const DISCOVERY_CONTRACT_VERSION = "fp16.2";

// ─────────────────────────────────────────────────────────────────────────────
// Confidence — operator language first, numeric as supporting detail (never the message).
// ─────────────────────────────────────────────────────────────────────────────

export type ConfidenceBand = "high" | "review" | "attention" | "unresolved";

export interface Confidence {
    band: ConfidenceBand;
    /** Supporting numeric (0–100). Never the primary operator message. */
    percent: number;
    /** Deterministic reasons this confidence was assigned (registry alias, section context, …). */
    signals: string[];
}

/** Operator-facing confidence copy — the primary message. */
export function confidenceLabel(band: ConfidenceBand): string {
    switch (band) {
        case "high":
            return "High confidence";
        case "review":
            return "Review recommended";
        case "attention":
            return "Needs attention";
        case "unresolved":
            return "Unresolved";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source lineage — every concept/proposal traces back to where it came from.
// ─────────────────────────────────────────────────────────────────────────────

export interface SourceRef {
    /** 1-based source page. */
    page: number;
    /** The section title as detected (display). */
    section_title: string;
    /** Normalized section identity (lowercased, punctuation-stripped) — stable across reruns. */
    section_key: string;
    /** Detected field/question labels contributing to this concept (evidence, display). */
    labels: string[];
    /**
     * The DESTINATIONS this concept came from, by the reader's own stable identity — an AcroForm
     * field name, a hosted-form control name. Labels are evidence, not identity: two destinations in
     * different artifacts can share the label "Today's Date:", and a label-keyed lineage cannot tell
     * them apart or survive a wording change. This is what lets an operator ask "why does Alloy think
     * this fact belongs here?" and be shown the exact controls.
     */
    destinations?: SourceDestinationRef[];
}

/** One source destination, addressable and stable. */
export interface SourceDestinationRef {
    /** The reader's stable identity for the control (`pdf_field:Signature1`, `hosted_form:q10:RESULT_TextField-2`). */
    evidence: string;
    /** Label as the source wrote it — display evidence, never identity. */
    label: string;
    /** 1-based page, where the source has pages. */
    page: number | null;
    /** The section the destination sits in. */
    section_title: string;
    /** The logical artifact inside the source that owns it, when the source has several. */
    logical_artifact_id?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 3 — Semantic document model. The detector already assigns disposition (field / static /
// acknowledgement / signature / upload / output-copy); this contract types that semantic view
// with explicit lineage, decoupled from the physical structure object.
// ─────────────────────────────────────────────────────────────────────────────

export type SemanticBlockRole =
    | "informational_field"
    | "choice_field"
    | "yes_no_question"
    | "conditional_explanation"
    | "static_content"
    | "acknowledgement"
    | "upload_instruction"
    | "signature"
    | "repeated_person_group"
    | "generated_output"
    | "instruction";

export interface SemanticField {
    /** Stable id: `${section_key}:${normalized_label}`. */
    id: string;
    /** Set when this field is one occurrence of a repeating structure (see `SemanticSection.repeating_groups`). */
    repeat_group_id?: string;
    /** For signature fields: the initial required signature, or an update / re-sign line. */
    signature_variant?: import("@/lib/pos/processingCase/structure/signatureFieldName").SignatureVariant;
    /** The reader's stable identity for this destination — lineage, not a display label. */
    evidence?: string;
    /** 1-based page, where the source has pages. */
    page?: number;
    label: string;
    role: SemanticBlockRole;
    /** Draft field type (text/date/number/select/boolean/signature/file_ref). */
    data_type: string;
    options?: string[];
    /** Conditional-explanation fields point at the question they depend on. */
    depends_on?: string;
}

export interface SemanticSection {
    section_key: string;
    title: string;
    page: number;
    disposition: SectionDisposition;
    /** True when this section repeats a person identity (guardian/emergency/pickup). */
    repeated_person: boolean;
    /** True when this section is an output/duplicate copy of information collected earlier. */
    output_copy: boolean;
    static_text?: string | null;
    fields: SemanticField[];
    /** Repeating structures on this section's page — one decision each, not one per occurrence. */
    repeating_groups?: import("@/lib/pos/processingCase/structure/repeatingFieldGroups").RepeatingFieldGroup[];
}

export interface SemanticDocumentModel {
    contract_version: string;
    sections: SemanticSection[];
    warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 4 — Business concepts. The operational meaning the document expresses.
// ─────────────────────────────────────────────────────────────────────────────

export type ConceptKind =
    | "scalar_field" // one value bound to an entity (child name, DOB, email, address part)
    | "choice_field" // single/multi choice (preferred hospital)
    | "boolean_status" // Y/N question (health-care-plan status, immunized)
    | "conditional_explanation" // free text conditional on a boolean
    | "relationship_group" // repeated person (guardian / emergency contact / pickup)
    | "upload_requirement" // a document must be provided (immunization records)
    | "acknowledgement" // consent / legal affirmation
    | "signature" // a signature responsibility
    | "value_series" // ONE value the document writes N times (a dose schedule, a five-column row)
    | "repeating_record" // a table whose ROWS are instances of one record (name + date, N times)
    | "static_content" // instructional / legal prose to preserve
    | "output_copy" // generated/output projection of earlier information
    | "unresolved"; // could not be classified — operator decides

/** Subject/grain a concept attaches to — aligned with the platform entity doctrine. */
export type ConceptSubject = "child" | "person" | "household" | "enrollment" | "internal" | "unknown";

export interface BusinessConceptCandidate {
    contract_version: string;
    /** Stable id from lineage: `${page}:${section_key}:${concept_slug}` — never an array index. */
    id: string;
    kind: ConceptKind;
    /** Operator-facing concept name. */
    label: string;
    /**
     * Normalized semantic concept key (e.g. "child.date_of_birth", "person.email",
     * "relationship.guardian", "requirement.upload"). Null when unresolved.
     */
    concept_key: string | null;
    subject: ConceptSubject;
    /**
     * WHO the label names, when it names anyone — child, guardian, physician, emergency contact.
     * A canonical binding whose field belongs to a different party is refused rather than proposed.
     * @see ./bindingSafety
     */
    party?: import("./bindingSafety").ConceptParty;
    /** The attribute the label asks for (name / phone / email / address / date_of_birth). */
    attribute?: string;
    /** How many of this concept the document collects (a group is `multiple`). */
    cardinality: "single" | "multiple";
    /** For relationship concepts: the child- or household-scoped operational role. */
    relationship_role?: OperationalRoleKey;
    relationship_scope?: "child" | "household";
    /** For requirement concepts: the frozen requirement type this maps to. */
    requirement_type?: RequirementType;
    /** Suggested draft data type for scalar/choice concepts. */
    suggested_data_type?: string;
    options?: string[];
    /**
     * For value_series / repeating_record / grouped choice concepts: how many occurrences the
     * document draws, and the destinations they occupy. The occurrences are evidence of
     * CARDINALITY — they are never separate facts.
     */
    repetition?: {
        instances: number;
        member_labels: string[];
        member_names: string[];
        item_types: string[];
        group_id: string;
    };
    /** Whether all values populating an output copy are already collected elsewhere. */
    output_of?: string[]; // concept_keys the output copy reproduces
    source: SourceRef;
    confidence: Confidence;
    /** One-sentence explanation, e.g. "Classified as a child-scoped relationship because …". */
    explanation: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 5 — Configuration proposals. For each concept, what the operator should approve.
// ─────────────────────────────────────────────────────────────────────────────

export type ProposalDisposition =
    | "reuse_canonical_field" // bind to a platform/system canonical field (FormFieldSource)
    | "reuse_existing_field" // bind to an org custom field_definitions entry
    | "create_proposed_field" // no match → propose a NEW durable configurable field (never auto-created)
    | "form_only_response" // collected on the form but NOT durable record data — no field created
    | "relationship_binding" // repeated person → operational-role relationship
    | "upload_requirement"
    | "acknowledgement"
    | "signature_requirement"
    | "static_content"
    | "structured_collection" // repeated destinations reviewed as ONE collection, not N fields
    | "output_binding" // generated/output-copy projection of approved concepts
    | "derived_value"
    | "unresolved"; // manual classification required

/** A proposed NEW configurable field — never persisted until the operator explicitly approves. */
export interface ProposedFieldDefinition {
    operator_label: string;
    /** Suggested canonical key (snake_case), operator-editable. */
    suggested_field_key: string;
    /** Owning entity/grain (customer_member / person / customer / opportunity …). */
    entity_type: string;
    /** Canonical field type (text/email/phone/number/date/boolean/select/multiselect). */
    data_type: string;
    description: string;
    option_set?: string[];
    required_recommendation: boolean;
    /** Sensitivity classification when applicable (e.g. "health" for medical concepts). */
    sensitivity?: "standard" | "health" | "financial";
    /** Documents that introduced this field (for the duplicate-across-imports warning). */
    introduced_by: string[];
    /** Similar existing field(s) — a "did you mean" duplicate warning. */
    similar_to?: string[];
}

export type ProposalDecisionState = "proposed" | "accepted" | "changed" | "ignored";

export interface ProposalAlternative {
    disposition: ProposalDisposition;
    /** For field alternatives: the canonical binding. */
    field_source?: FormFieldSource;
    label: string;
    confidence: Confidence;
}

export interface ConfigurationProposal {
    contract_version: string;
    /** Stable id: same lineage slug as the candidate it serves. */
    id: string;
    candidate_id: string;
    disposition: ProposalDisposition;
    /** Matched existing canonical/org field binding (reuse_* dispositions). */
    target_field_source?: FormFieldSource;
    /** Matched relationship role (relationship_binding). */
    target_relationship_role?: OperationalRoleKey;
    /** Matched requirement type (upload/acknowledgement/signature). */
    target_requirement_type?: RequirementType;
    /** Proposed new field (create_proposed_field only). */
    proposed_field?: ProposedFieldDefinition;
    confidence: Confidence;
    alternatives: ProposalAlternative[];
    /** Operator decision — persisted separately from detector output. */
    decision_state: ProposalDecisionState;
    /**
     * A canonical binding that WAS matched and then refused because it belongs to another party.
     * Surfaced so the operator sees the decision instead of an unexplained gap — and so a refusal
     * can never be mistaken for "the matcher found nothing".
     */
    refused_binding?: { target: FormFieldSource; reason: string };
    /** Validation problems that would block application (e.g. new field needs a key). */
    validation_issues: string[];
    explanation: string;
    source: SourceRef;
}

// ─────────────────────────────────────────────────────────────────────────────
// The persisted discovery result (what a rerun compares against for decision preservation).
// ─────────────────────────────────────────────────────────────────────────────

export type DiscoveryCategory =
    | "existing_fields"
    | "new_fields"
    | "form_responses"
    | "relationships"
    | "upload_requirements"
    | "acknowledgements"
    | "signatures"
    | "static_content"
    | "output_copies"
    | "collections"
    | "needs_review";

export interface DiscoverySummaryCount {
    category: DiscoveryCategory;
    label: string;
    count: number;
}

export interface ConfigurationDiscoveryResult {
    contract_version: string;
    generated_at: string;
    source_document_id: string | null;
    concepts: BusinessConceptCandidate[];
    proposals: ConfigurationProposal[];
    summary: DiscoverySummaryCount[];
    warnings: string[];
}
