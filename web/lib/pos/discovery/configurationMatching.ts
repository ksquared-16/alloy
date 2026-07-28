/**
 * POS-FP16 — Layer 4 → Layer 5: business concepts → governed configuration proposals.
 *
 * For each concept, propose what the operator should approve — REUSING the existing platform
 * vocabularies, never inventing parallel matching:
 *
 *   • scalar concepts run through `suggestFieldBinding` (the platform's deterministic label→canonical
 *     matcher) → reuse_canonical_field (a `FormFieldSource`) when matched, else create_proposed_field
 *   • relationship groups → relationship_binding against the platform-fixed operational role keys
 *   • upload / acknowledgement / signature concepts → the frozen `RequirementType` constructs
 *   • static / output-copy concepts → static_content / output_binding
 *
 * Configuration Discovery PROPOSES. It never creates or mutates configuration — every proposal is a
 * default the operator confirms, and a new-field proposal is never persisted until explicit approval.
 * Confidence carries deterministic signals + operator-language band; every proposal is explainable.
 *
 * Pure + deterministic. No I/O, no LLM. (Org-catalog resolution — matching an existing custom
 * field_definitions entry — is a thin async pass layered on top by the caller; this core handles the
 * canonical/platform matcher and new-field proposals so it is fully unit-testable.)
 */

import { suggestFieldBinding } from "@/lib/forms/canonicalBindingSuggestions";
import {
    DISCOVERY_CONTRACT_VERSION,
    type BusinessConceptCandidate,
    type ConceptSubject,
    type Confidence,
    type ConfigurationProposal,
    type ProposalAlternative,
    type ProposalDisposition,
    type ProposedFieldDefinition,
} from "./contracts";

/** Subject/grain → owning entity_type for a PROPOSED new field (matched fields keep the matcher's entity). */
function entityForSubject(subject: ConceptSubject): string {
    switch (subject) {
        case "child":
            return "customer_member";
        case "person":
            return "person";
        case "household":
            return "customer";
        case "enrollment":
            return "opportunity";
        default:
            return "customer_member";
    }
}

/** Draft data type → canonical field type for a proposed field. */
function canonicalType(dataType: string | undefined): string {
    switch (dataType) {
        case "date":
            return "date";
        case "number":
            return "number";
        case "boolean":
        case "checkbox":
            return "boolean";
        case "select":
            return "select";
        case "multiselect":
            return "multiselect";
        default:
            return "text";
    }
}

function conf(band: Confidence["band"], signals: string[]): Confidence {
    const percent = band === "high" ? 90 : band === "review" ? 65 : band === "attention" ? 40 : 20;
    return { band, percent, signals };
}

function fieldKeyFrom(conceptKey: string | null, label: string): string {
    const base = (conceptKey?.split(".").slice(1).join("_") || label).toLowerCase();
    return base.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "field";
}

const HEALTH_RE = /medical|health|immuniz|allerg|diabet|asthma|seizure|convuls|medication|surgery|injur|chronic|dietary|physical limitation|nosebleed|heart|infection|sting/i;

/**
 * High-value SEMANTIC concept keys → canonical binding. The concept layer's understanding is richer
 * than the raw label ("Best Contact Number" is a phone even though the label matcher can't tell), so
 * a known concept key resolves to its canonical field directly — the label matcher is the fallback.
 * Targets mirror `suggestFieldBinding` exactly (child=customer_member, guardian/emergency=person,
 * address=customer) so there is one canonical truth, not a parallel one.
 */
const CANONICAL_CONCEPT_BINDINGS: Record<string, { entity_type: string; field_key: string; band: Confidence["band"] }> = {
    "child.date_of_birth": { entity_type: "customer_member", field_key: "dob", band: "high" },
    "child.name": { entity_type: "customer_member", field_key: "display_name", band: "high" },
    "child.allergies": { entity_type: "customer_member", field_key: "allergies", band: "review" },
    "person.email": { entity_type: "person", field_key: "email", band: "high" },
    "person.phone": { entity_type: "person", field_key: "phone", band: "high" },
    "person.name": { entity_type: "person", field_key: "full_name", band: "high" },
    "household.address": { entity_type: "customer", field_key: "address", band: "review" },
};

export function matchConcept(concept: BusinessConceptCandidate): ConfigurationProposal {
    const base = {
        contract_version: DISCOVERY_CONTRACT_VERSION,
        id: concept.id,
        candidate_id: concept.id,
        decision_state: "proposed" as const,
        validation_issues: [] as string[],
        source: concept.source,
    };

    // ── relationships → operational-role relationship binding ──
    if (concept.kind === "relationship_group" && concept.relationship_role) {
        return {
            ...base,
            disposition: "relationship_binding",
            target_relationship_role: concept.relationship_role,
            confidence: conf("high", [`operational role ${concept.relationship_role}`, "reuses the canonical Person↔Child relationship model"]),
            alternatives: [],
            explanation: `Bind as a ${concept.label.toLowerCase()} relationship (role: ${concept.relationship_role}) on each child — persons are linked or created, not stored as flat fields.`,
        };
    }

    // ── requirements ──
    if (concept.kind === "upload_requirement") {
        return {
            ...base,
            disposition: "upload_requirement",
            target_requirement_type: "upload",
            confidence: concept.confidence,
            alternatives: [],
            explanation: `A document-upload requirement (${concept.label}) — proposed against the frozen requirement model; responsibility remains editable in Packet Composition.`,
        };
    }
    if (concept.kind === "acknowledgement") {
        return {
            ...base,
            disposition: "acknowledgement",
            target_requirement_type: "acknowledgement",
            confidence: conf("high", ["consent / legal prose requiring acknowledgement"]),
            alternatives: [],
            explanation: "A consent/acknowledgement requirement; the legal paragraph is preserved as static content.",
        };
    }
    if (concept.kind === "signature") {
        const internal = concept.concept_key === "signature.internal";
        return {
            ...base,
            disposition: "signature_requirement",
            target_requirement_type: "signature",
            confidence: conf("high", [internal ? "internal/operator signature" : "participant signature"]),
            alternatives: [],
            explanation: internal
                ? "An internal/operator (director) signature — classified as internal, NOT participant work."
                : "A participant (guardian) signature responsibility.",
        };
    }

    // ── static / output ──
    if (concept.kind === "static_content") {
        return { ...base, disposition: "static_content", confidence: conf("high", ["instructional/legal prose"]), alternatives: [], explanation: "Preserved as read-only static/instructional content." };
    }
    if (concept.kind === "output_copy") {
        return {
            ...base,
            disposition: "output_binding",
            confidence: conf("review", ["output/classroom copy of earlier information"]),
            alternatives: [],
            explanation: "An output/classroom-copy projection of already-collected concepts — a durable output binding for future document generation, not a new set of participant questions.",
        };
    }

    // ── scalars / choices / booleans / conditionals → canonical field or proposed field ──
    const wantsType = concept.kind === "choice_field" ? "select" : concept.kind === "boolean_status" ? "boolean" : concept.suggested_data_type ?? "text";

    // First, resolve by the concept's SEMANTIC key (richer than the label). Scalar concepts only —
    // a boolean/choice concept never binds to a scalar canonical field.
    const semantic = concept.kind === "scalar_field" && concept.concept_key ? CANONICAL_CONCEPT_BINDINGS[concept.concept_key] : undefined;
    if (semantic) {
        return {
            ...base,
            disposition: "reuse_canonical_field",
            target_field_source: { entity_type: semantic.entity_type, field_key: semantic.field_key },
            confidence: conf(semantic.band, [`matched by concept "${concept.concept_key}" to ${semantic.entity_type}.${semantic.field_key}`]),
            alternatives: [{ disposition: "create_proposed_field", label: `Create a new ${concept.subject} field instead`, confidence: conf("attention", ["operator override"]) }],
            explanation: `Matched "${concept.label}" to the canonical ${semantic.entity_type} field ${semantic.field_key} — reuse the existing field rather than create a duplicate.`,
        };
    }

    const binding = concept.kind === "scalar_field" ? suggestFieldBinding(concept.label, wantsType) : null;

    if (binding?.field_source) {
        const bandFromBinding: Confidence["band"] = binding.confidence === "high" ? "high" : binding.confidence === "medium" ? "review" : "attention";
        return {
            ...base,
            disposition: "reuse_canonical_field",
            target_field_source: binding.field_source,
            confidence: conf(bandFromBinding, [
                `matched to ${binding.field_source.entity_type}.${binding.field_source.field_key}`,
                ...(binding.note ? [binding.note] : []),
            ]),
            alternatives: [{ disposition: "create_proposed_field", label: `Create a new ${concept.subject} field instead`, confidence: conf("attention", ["operator override"]) }],
            explanation: `Matched "${concept.label}" to the canonical ${binding.field_source.entity_type} field ${binding.field_source.field_key} — reuse the existing field rather than create a duplicate.`,
        };
    }

    // no canonical match → propose a new configurable field (never auto-created)
    const proposed: ProposedFieldDefinition = {
        operator_label: concept.label.replace(/\s*—\s*if\s+yes.*$/i, "").trim(),
        suggested_field_key: fieldKeyFrom(concept.concept_key, concept.label),
        entity_type: entityForSubject(concept.subject),
        data_type: canonicalType(wantsType),
        description: `Proposed from the imported document (${concept.source.section_title}).`,
        ...(concept.options && concept.options.length ? { option_set: concept.options } : {}),
        required_recommendation: false,
        ...(HEALTH_RE.test(concept.label) ? { sensitivity: "health" as const } : {}),
        introduced_by: [concept.source.section_title],
    };
    const band: Confidence["band"] = concept.kind === "choice_field" ? "review" : "attention";
    const proposal: ConfigurationProposal = {
        ...base,
        disposition: "create_proposed_field",
        proposed_field: proposed,
        confidence: conf(band, ["no canonical field matched this label", `owning entity: ${proposed.entity_type}`]),
        alternatives: [],
        explanation: `No existing Alloy field matched "${concept.label}". Proposed as a new ${proposed.entity_type} ${proposed.data_type} field — created only after you approve.`,
        validation_issues: proposed.suggested_field_key ? [] : ["A field key is required before this can be created."],
    };
    return proposal;
}

export function matchConcepts(concepts: BusinessConceptCandidate[]): ConfigurationProposal[] {
    return concepts.map(matchConcept);
}
