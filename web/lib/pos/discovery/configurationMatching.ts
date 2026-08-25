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
import { checkBindingParty, partyHasNoCanonicalHome, type ConceptParty } from "./bindingSafety";
import { ownershipHoldFor } from "./canonicalOwnershipHolds";
import { classifyNonFormSource } from "@/lib/pos/processingCase/classification/classifyNonFormSource";
import { CLASSIFICATION_KEY_LABELS } from "@/lib/pos/processingCase/classification/operatorCorrection";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";
import type { FormFieldSource } from "@/lib/forms/schema";
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
    // Names resolve to the REGISTERED split fields (see systemFieldRegistry): there is no
    // person-level display_name/full_name system field, and generation has always built first+last.
    "child.name": { entity_type: "child", field_key: "child_first_name", band: "high" },
    "child.allergies": { entity_type: "customer_member", field_key: "allergies", band: "review" },
    "person.email": { entity_type: "person", field_key: "email", band: "high" },
    "person.phone": { entity_type: "person", field_key: "phone", band: "high" },
    "person.name": { entity_type: "guardian", field_key: "guardian_first_name", band: "high" },
    "household.address": { entity_type: "customer", field_key: "address", band: "review" },
};

/**
 * A person's name is CAPTURED as separate first + last fields, even though the concept matches one
 * canonical name field. Saying only "matched to display_name" understated what the operator is
 * approving — the generated form has always split it (see expandQuestionsForDraftSave), so the
 * explanation now says so rather than leaving them to discover it after generating.
 */
function nameCaptureNote(fieldKey: string): string {
    // A name concept anchors on the FIRST-name field; generation adds the last-name field alongside
    // it. Saying only "matched to child_first_name" would understate what the operator approves.
    return /_first_name$/i.test(fieldKey) ? " Captured as separate first and last name fields." : "";
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
    // A LOW-confidence match on a concept whose owner is settled elsewhere is the quiet failure this
    // whole gate exists for: an immunization record binds to the generic "Medical notes" field, the
    // review shows a green "Existing field" chip, and the operator is given nothing to decide. The
    // record is then a sentence in a notes blob that the Health foundation must later parse back out.
    // A confident match — an allergy note to the child-grain allergies field — is a real destination
    // and is never held.
    if (bindingConfidence === "low") {
        const held = heldProposal(base, concept);
        if (held) return held;
    }
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

/**
 * Run a matched canonical binding past the party check before it is ever proposed.
 *
 * A refusal is not a miss: it is recorded on the proposal so the operator sees what was considered
 * and why it was declined, and the concept falls through to the durable/form-only path as if the
 * matcher had found nothing. @see ./bindingSafety
 */
function safeBinding(
    concept: BusinessConceptCandidate,
    suggested: FormFieldSource | undefined
): { field_source?: FormFieldSource; refused?: { target: FormFieldSource; reason: string }; note?: string } {
    if (!suggested) return {};
    const verdict = checkBindingParty((concept.party ?? "unknown") as ConceptParty, concept.attribute ?? null, suggested, concept.label);
    if (!verdict.ok) return { refused: { target: verdict.refused, reason: verdict.reason } };
    return { field_source: verdict.field_source, ...(verdict.redirected ? { note: verdict.reason } : {}) };
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

    // ── a fact ABOUT a party that has its own relationship definition ──
    //
    // A physician's name is not a child field with an awkward label; it is an attribute of a person
    // reached through a relationship. Discovery already derives the party from the label, and the
    // relationship layer already owns which parties are relationships — so when those two agree, the
    // proposal is a relationship binding rather than a new field.
    //
    // Semantic, not a lookup table: nothing here knows this school's wording. A tenant that
    // configures "therapist" as a definition row gets the same treatment with no edit here.
    // Only where the party has NO canonical field of its own. A guardian HAS registered fields
    // (`guardian_first_name`, `guardian_phone`), and those are what a form collects and what prefill
    // reads — rerouting them to the relationship would move a working binding for no gain. A
    // physician has none, which is exactly the gap the definition row fills.
    if (
        (concept.kind === "scalar_field" || concept.kind === "choice_field") &&
        concept.party &&
        concept.party !== "unknown" &&
        partyHasNoCanonicalHome(concept.party as ConceptParty)
    ) {
        const definition = relationshipDefinitionForRole(concept.party);
        if (definition && definition.collectable) {
            const nested = concept.attribute === "name" ? "full_name" : concept.attribute;
            const covered = nested ? definition.nested_field_keys.includes(nested) : false;
            if (covered) {
                return {
                    ...base,
                    disposition: "relationship_binding",
                    target_relationship_role: definition.operational_role_key,
                    confidence: conf("high", [
                        `the label names the ${definition.label.toLowerCase().replace(/s$/, "")}`,
                        `"${nested}" is collected for each member of the ${definition.label} relationship`,
                    ]),
                    alternatives: [
                        { disposition: "create_proposed_field", label: `Create a ${concept.subject} field instead`, confidence: conf("attention", ["operator override"]) },
                    ],
                    explanation: `Bind as the ${nested?.replace(/_/g, " ")} of a ${definition.label.toLowerCase().replace(/s$/, "")} on this child — a person linked through the ${definition.label} relationship, not a field on the child record.`,
                };
            }
        }
    }

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
        // Reuse the platform's own document classifier rather than inventing a second document
        // vocabulary here — the clause text is the title it reads.
        const classified = classifyNonFormSource({ sourceKind: "document", title: concept.label });
        const documentType = classified.status === "classified" ? classified.classification_key : null;
        return {
            ...base,
            disposition: "upload_requirement",
            target_requirement_type: "upload",
            ...(documentType ? { target_document_classification: documentType } : {}),
            confidence: concept.confidence,
            alternatives: [],
            explanation: documentType
                ? `A document-upload requirement (${concept.label}) — Alloy already recognises this document type as "${CLASSIFICATION_KEY_LABELS[documentType]}", so an uploaded file is classified rather than filed as an untyped attachment. Responsibility remains editable in Packet Composition.`
                : `A document-upload requirement (${concept.label}) — Alloy has no canonical document type for what is being asked, so the upload is accepted and left unclassified rather than forced into a type that does not fit. Responsibility remains editable in Packet Composition.`,
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

    // ── repeated destinations → ONE collection decision ──
    if (concept.kind === "value_series" || concept.kind === "repeating_record") {
        const n = concept.repetition?.instances ?? 0;
        // "Where that schedule lives is an operator decision" is the invitation this gate closes.
        // A vaccine dose schedule IS an immunization record; if the operator answers that question
        // here, Enrollment owns immunization history and the Health foundation inherits a rival.
        // The collection SHAPE is preserved in the explanation — held is not unrecognised.
        const heldCollection = heldProposal(base, concept);
        if (heldCollection) {
            return {
                ...heldCollection,
                explanation: `The document draws ${n} destinations for this one value — one ${concept.label} schedule, not ${n} fields. Where that schedule lives is not an open question: ${heldCollection.ownership_hold?.explanation ?? ""}`,
            };
        }
        return {
            ...base,
            disposition: "structured_collection",
            confidence: concept.confidence,
            alternatives: [],
            explanation:
                concept.kind === "value_series"
                    ? `The document draws ${n} destinations for this one value. Store it as a schedule of ${n} occurrences — not ${n} fields. Where that schedule lives is an operator decision.`
                    : `A repeatable collection of ${n} rows (${concept.repetition?.item_types.join(" + ") ?? "columns"}). Where the collection lives is an operator decision.`,
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
    const semanticRaw = concept.kind === "scalar_field" && concept.concept_key ? CANONICAL_CONCEPT_BINDINGS[concept.concept_key] : undefined;
    const semanticSafe = semanticRaw ? safeBinding(concept, { entity_type: semanticRaw.entity_type, field_key: semanticRaw.field_key }) : {};
    const semantic = semanticRaw && semanticSafe.field_source ? semanticRaw : undefined;
    if (semantic && semanticSafe.field_source) {
        return {
            ...base,
            disposition: "reuse_canonical_field",
            target_field_source: semanticSafe.field_source,
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
        const rawBinding = concept.kind === "scalar_field" ? suggestFieldBinding(concept.label, wantsType) : null;
        const guarded = safeBinding(concept, rawBinding?.field_source);
        const binding = guarded.field_source ? { ...rawBinding, field_source: guarded.field_source, note: guarded.note ?? rawBinding?.note } : null;
        if (!binding?.field_source && !isDurableRecordConcept(concept)) {
            return {
                ...base,
                disposition: "form_only_response",
                confidence: conf("high", [durabilitySignal(concept), ...(guarded.refused ? [`canonical binding refused: ${guarded.refused.reason}`] : [])]),
                ...(guarded.refused ? { refused_binding: guarded.refused } : {}),
                alternatives: [
                    { disposition: "create_proposed_field", label: `Create a durable ${concept.subject} field instead`, confidence: conf("attention", ["operator override"]) },
                ],
                explanation: `Collected as a form response (${concept.label}) — a ${formOnlyReason(concept)}. No durable record field is created unless you choose to.`,
            };
        }
        if (binding?.field_source) return reuseFieldProposal(base, concept, binding.field_source, binding.confidence ?? "medium", binding.note);
        if (guarded.refused) return proposeNewField(base, concept, wantsType, guarded.refused);
    }

    const rawBinding2 = concept.kind === "scalar_field" ? suggestFieldBinding(concept.label, wantsType) : null;
    const guarded2 = safeBinding(concept, rawBinding2?.field_source);
    const binding = guarded2.field_source ? { ...rawBinding2, field_source: guarded2.field_source, note: guarded2.note ?? rawBinding2?.note } : null;

    if (binding?.field_source) {
        if (binding.confidence === "low") {
            const held = heldProposal(base, concept);
            if (held) return held;
        }
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
    return proposeNewField(base, concept, wantsType, guarded2.refused);
}

/**
 * Propose a NEW configurable field. Also the landing place for a concept whose canonical match was
 * refused on party grounds — the refusal travels with the proposal so the operator can see that a
 * binding was found and declined, rather than assuming nothing matched.
 */
/**
 * A proposal that collects the answer and creates nothing.
 *
 * No `proposed_field` is attached, so the refusal survives a caller that ignores the disposition —
 * there is simply nothing creatable in the object.
 */
function heldProposal(
    base: Pick<ConfigurationProposal, "contract_version" | "id" | "candidate_id" | "decision_state" | "validation_issues" | "source">,
    concept: BusinessConceptCandidate,
): ConfigurationProposal | null {
    const hold = ownershipHoldFor(concept);
    if (!hold) return null;
    return {
        ...base,
        disposition: "held_for_canonical_owner",
        ownership_hold: hold,
        confidence: conf("review", [
            hold.owner ? `owned by ${hold.owner}` : "no canonical owner exists yet",
            `Director decision ${hold.decision}`,
        ]),
        alternatives: [],
        explanation: `"${concept.label}" is collected on this form, and it does not become a durable Alloy field here. ${hold.explanation}`,
        validation_issues: [],
    };
}

function proposeNewField(
    base: Pick<ConfigurationProposal, "contract_version" | "id" | "candidate_id" | "decision_state" | "validation_issues" | "source">,
    concept: BusinessConceptCandidate,
    wantsType: string,
    refused?: { target: FormFieldSource; reason: string }
): ConfigurationProposal {
    const held = heldProposal(base, concept);
    if (held) return held;

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
    return {
        ...base,
        disposition: "create_proposed_field",
        proposed_field: proposed,
        confidence: conf(band, [
            refused ? `a canonical field matched the label and was REFUSED: ${refused.reason}` : "no canonical field matched this label",
            `owning entity: ${proposed.entity_type}`,
        ]),
        ...(refused ? { refused_binding: refused } : {}),
        alternatives: [],
        explanation: refused
            ? `"${concept.label}" matched the canonical field ${refused.target.entity_type}.${refused.target.field_key}, and that binding was refused — ${refused.reason}. Proposed as a new ${proposed.entity_type} ${proposed.data_type} field instead, created only after you approve.`
            : `No existing Alloy field matched "${concept.label}". Proposed as a new ${proposed.entity_type} ${proposed.data_type} field — created only after you approve.`,
        validation_issues: proposed.suggested_field_key ? [] : ["A field key is required before this can be created."],
    };
}

export function matchConcepts(concepts: BusinessConceptCandidate[]): ConfigurationProposal[] {
    return concepts.map(matchConcept);
}
