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

const HEALTH_RE = /medical|health|immuniz|allerg|diabet|asthma|seizure|convuls|medication|surgery|injur|chronic|dietary|physical limitation|nosebleed|heart|infection|sting|doctor|dentist|physician|hospital|provider|practice/i;

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

/**
 * A person's name is CAPTURED as separate first + last fields, even though the concept matches one
 * canonical name field. Saying only "matched to display_name" understated what the operator is
 * approving — the generated form has always split it (see expandQuestionsForDraftSave), so the
 * explanation now says so rather than leaving them to discover it after generating.
 */
function nameCaptureNote(fieldKey: string): string {
    return /(^|_)(display_name|full_name|name)$/i.test(fieldKey)
        ? " Captured as separate first and last name fields."
        : "";
}

const SCREENING_SECTION_RE = /chronic|health history|nature of reaction|recurring/i;
const DURABLE_ATTR_RE = /nickname|doctor|dentist|physician|provider|practice|hospital|clinic/i;
const FORM_ONLY_LABEL_RE = /please\s+(list|describe|explain)|\bactivities\b|^other$/i;

/**
 * Is this concept DURABLE RECORD DATA (a new canonical field is warranted) rather than a form-only
 * response? Conservative by DESIGN — a false "new field" (pushing the operator to create a field the
 * matcher just failed to match) is worse than a form-only response the operator can promote later.
 */
function isDurableRecordConcept(c: BusinessConceptCandidate): boolean {
    if (c.kind === "conditional_explanation" || c.kind === "boolean_status") return false; // screening / conditional answers
    if (c.kind === "choice_field") return true; // a fixed-option attribute (e.g. Preferred Hospital)
    // scalar_field:
    if (c.suggested_data_type === "date") return true; // a date attribute
    if (DURABLE_ATTR_RE.test(c.label)) return true; // named durable reference (provider, hospital, nickname)
    if (SCREENING_SECTION_RE.test(c.source.section_title)) return false; // health-history screening grid → form-only
    if (FORM_ONLY_LABEL_RE.test(c.label)) return false; // "please list/describe", free-text prompts
    return true; // a plain named attribute outside screening defaults to durable
}

function formOnlyReason(c: BusinessConceptCandidate): string {
    if (c.kind === "conditional_explanation") return "conditional explanation collected on the form";
    if (c.kind === "boolean_status") return "yes/no screening answer";
    if (SCREENING_SECTION_RE.test(c.source.section_title)) return "health-screening response";
    return "form-collected response";
}

function durabilitySignal(c: BusinessConceptCandidate): string {
    if (c.kind === "boolean_status") return "yes/no screening question — not durable record data";
    if (c.kind === "conditional_explanation") return "conditional free-text explanation — not durable record data";
    if (SCREENING_SECTION_RE.test(c.source.section_title)) return "health-history screening grid — form response, not a record field";
    return "free-text prompt — form response, not a record field";
}

function reuseFieldProposal(
    base: Pick<ConfigurationProposal, "contract_version" | "id" | "candidate_id" | "decision_state" | "validation_issues" | "source">,
    concept: BusinessConceptCandidate,
    field_source: { entity_type: string; field_key: string; shared_value_key?: string; crm_mapping_key?: string },
    bindingConfidence: "high" | "medium" | "low",
    note?: string
): ConfigurationProposal {
    const band: Confidence["band"] = bindingConfidence === "high" ? "high" : bindingConfidence === "medium" ? "review" : "attention";
    return {
        ...base,
        disposition: "reuse_canonical_field",
        target_field_source: field_source,
        confidence: conf(band, [`matched to ${field_source.entity_type}.${field_source.field_key}`, ...(note ? [note] : [])]),
        alternatives: [{ disposition: "create_proposed_field", label: `Create a new ${concept.subject} field instead`, confidence: conf("attention", ["operator override"]) }],
        explanation: `Matched "${concept.label}" to the canonical ${field_source.entity_type} field ${field_source.field_key} — reuse the existing field rather than create a duplicate.${nameCaptureNote(field_source.field_key)}`,
    };
}

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
            explanation: `Matched "${concept.label}" to the canonical ${semantic.entity_type} field ${semantic.field_key} — reuse the existing field rather than create a duplicate.${nameCaptureNote(semantic.field_key)}`,
        };
    }

    // ── AUDIT (M5): unmatched concepts are NOT automatically new durable fields. Most of the health
    // screening section is FORM-ONLY response data — collected on the form, never a durable
    // customer_member field. The operator must not be pushed to create a field because the matcher
    // failed. A concept becomes a durable new field only when it is genuinely durable record data.
    if (concept.kind === "scalar_field" || concept.kind === "choice_field" || concept.kind === "boolean_status" || concept.kind === "conditional_explanation") {
        const binding = concept.kind === "scalar_field" ? suggestFieldBinding(concept.label, wantsType) : null;
        if (!binding?.field_source && !isDurableRecordConcept(concept)) {
            return {
                ...base,
                disposition: "form_only_response",
                confidence: conf("high", [durabilitySignal(concept)]),
                alternatives: [
                    { disposition: "create_proposed_field", label: `Create a durable ${concept.subject} field instead`, confidence: conf("attention", ["operator override"]) },
                ],
                explanation: `Collected as a form response (${concept.label}) — a ${formOnlyReason(concept)}. No durable record field is created unless you choose to.`,
            };
        }
        if (binding?.field_source) return reuseFieldProposal(base, concept, binding.field_source, binding.confidence, binding.note);
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
            explanation: `Matched "${concept.label}" to the canonical ${binding.field_source.entity_type} field ${binding.field_source.field_key} — reuse the existing field rather than create a duplicate.${nameCaptureNote(binding.field_source.field_key)}`,
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
